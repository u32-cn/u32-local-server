const http = require('http')
const https = require('https')
const logger = require('./logger')

function proxy(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  // 目标 URL 取自原始 req.url 并补回 search：new URL 会把 ? 后的部分拆走，
  // 只取 pathname 会丢掉目标的查询串（如 /proxy/http://x/api?a=1 丢失 a=1）
  const targetStr = url.pathname.slice('/proxy/'.length) + url.search
  logger.debug(`[PROXY] Proxying request to: ${targetStr}\n`)
  let targetUrl
  try {
    targetUrl = new URL(targetStr)
    logger.debug(`[PROXY] Parsed target URL: ${targetUrl.href}\n`)
  } catch {
    logger.error(`[PROXY] ERROR: Invalid proxy URL: ${targetStr}\n`)
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    return res.end('400 Bad Request: invalid proxy URL')
  }

  const mod = targetUrl.protocol === 'https:' ? https : http
  logger.debug(`[PROXY] Using ${targetUrl.protocol} module\n`)
  const proxyOpts = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: { ...req.headers, host: targetUrl.host }
  }
  delete proxyOpts.headers['accept-encoding']
  logger.debug(`[PROXY] Proxy options: ${proxyOpts.method} ${targetUrl.hostname}:${proxyOpts.port}${proxyOpts.path}\n`)

  const proxyReq = mod.request(proxyOpts, (proxyRes) => {
    logger.debug(`[PROXY] Received response: ${proxyRes.statusCode} ${proxyRes.statusMessage}\n`)
    const headers = {
      ...proxyRes.headers,
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'access-control-allow-headers': '*',
    }
    delete headers['x-frame-options']
    res.writeHead(proxyRes.statusCode, headers)
    proxyRes.on('end', () => {
      logger.debug(`[PROXY] Proxy transfer completed\n`)
    })
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    logger.error(`[PROXY] ERROR: Proxy request failed: ${err.message}\n`)
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('502 Bad Gateway: ' + err.message)
  })

  req.pipe(proxyReq)
}

module.exports = { proxy }
