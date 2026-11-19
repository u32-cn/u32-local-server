const logger = require('./logger')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { redirect } = require('./utils')
const fsApi = require('./fs-api')
const bridge = require('./bridge')
const artifacts = require('./artifacts')
const sysinfo = require('./sysinfo')
const statusPage = require('./status-page')

const LOCAL_HOSTNAMES = ['127.0.0.1', 'localhost', '::1', '[::1]']

// 从 Host 头提取主机名（兼容 IPv6 的 [::1]:port 形式）
function getHostname(hostHeader) {
  if (!hostHeader) return ''
  const s = String(hostHeader)
  if (s.startsWith('[')) {
    const end = s.indexOf(']')
    return end === -1 ? s : s.slice(0, end + 1)
  }
  return s.split(':')[0]
}

// Host 允许列表：本机地址 + 配置的 trustedHosts（反向代理/自定义域名场景）
// 防止 DNS rebinding：恶意域名解析到 127.0.0.1 后，Host 头不是本机地址即拒绝
function hostAllowed(hostname, config) {
  if (!hostname) return false
  const h = hostname.toLowerCase()
  if (LOCAL_HOSTNAMES.includes(h)) return true
  const trusted = (config.trustedHosts || []).map(x => String(x).toLowerCase())
  return trusted.includes(h)
}

// 写接口 Origin 校验：浏览器发起的跨站 POST 一律拒绝（防 CSRF）
// 无 Origin 头视为非浏览器客户端（curl/CLI），放行
function sameOriginOk(req, hostHeader) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    if (new URL(origin).host === hostHeader) return true
    // 本机回环地址任意端口视为可信（本地开发页常跨端口调用写接口）
    const { hostname } = new URL(origin)
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(String(hostname).toLowerCase())
  } catch {
    return false
  }
}

function sendPlain(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(msg)
}

function setupRoutes(server, fileServe, proxy, configServe, homeServe, proxyPageServe, bridgeStatusServe, pickerServe, pickerDemoServe, config) {
  const publicDir = path.join(__dirname, '../public')
  artifacts.init(config, config.file && config.file.mime) // 桥产物存储：建目录+启动清空+定时清扫
  server.on('request', (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    logger.debug(`[REQUEST] ${req.method} ${url.pathname} from ${req.socket.remoteAddress}\n`)

    // 请求指标（/status 状态页用）：仅计数，无副作用
    sysinfo.recordRequest(req, res)

    // Host 校验（全局）：阻断 DNS rebinding；经反向代理访问时需在配置中添加 trustedHosts
    if (!hostAllowed(getHostname(req.headers.host), config)) {
      logger.error(`[SECURITY] Rejected request with untrusted Host: ${req.headers.host}\n`)
      return sendPlain(res, 403, '403 Forbidden: untrusted Host header')
    }

    // 写接口 Origin 校验：阻断恶意网页跨站修改配置/触发服务注册（CSRF）
    const isWriteApi = url.pathname.startsWith('/config/api') || url.pathname === '/api/service' || url.pathname === '/api/fs' || (url.pathname.startsWith('/bridge/api/') && (req.method === 'POST' || req.method === 'DELETE'))
    if (isWriteApi && !sameOriginOk(req, req.headers.host)) {
      logger.error(`[SECURITY] Rejected cross-origin ${req.method} to ${url.pathname} (Origin: ${req.headers.origin})\n`)
      return sendPlain(res, 403, '403 Forbidden: cross-origin request rejected')
    }

    if (req.method === 'OPTIONS') {
      logger.debug(`[INFO] Handling OPTIONS preflight request\n`)
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'access-control-allow-headers': '*',
      })
      return res.end()
    }

    if (url.pathname === '/' || url.pathname === '') {
      logger.debug(`[INFO] Routing to home page\n`)
      return homeServe(req, res, config)
    }
    if (url.pathname === '/llms.txt') {
      logger.debug(`[INFO] Routing to llms.txt\n`)
      const llmsPath = path.join(publicDir, 'llms.txt')
      if (fs.existsSync(llmsPath)) {
        let content = fs.readFileSync(llmsPath, 'utf8')
        content = content.replace(/\{\{PORT\}\}/g, String(config.port))
        res.writeHead(200, { 
          'Content-Type': 'text/plain; charset=utf-8',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        return res.end(content)
      }
      res.writeHead(404, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'access-control-allow-headers': '*',
      })
      return res.end('Not Found')
    }
    if (url.pathname === '/config/') {
      // 规范化到 /config（无尾斜杠），保证页面相对链接基准唯一
      return redirect(res, '../config')
    }
    if (url.pathname === '/config') {
      logger.debug(`[INFO] Routing to config page handler\n`)
      return configServe(req, res)
    }
    if (url.pathname.startsWith('/config/api')) {
      logger.debug(`[INFO] Routing to config API handler\n`)
      return configServe(req, res)
    }
    if (url.pathname === '/status/api') {
      // 运行状态 JSON（机器可读，字段与页面同源同脱敏）
      return statusPage.serveApi(req, res, config, server)
    }
    if (url.pathname === '/status/') {
      // 规范化到 /status（无尾斜杠），保证页面相对资源基准唯一
      return redirect(res, '../status')
    }
    if (url.pathname === '/status') {
      logger.debug(`[INFO] Routing to status page handler\n`)
      return statusPage.serve(req, res, config, server)
    }
    if (url.pathname === '/picker-demo') {
      logger.debug(`[INFO] Routing to picker demo page handler\n`)
      return pickerDemoServe(req, res)
    }
    if (url.pathname === '/picker/') {
      // 规范化到 /picker（无尾斜杠），保证资源相对路径基准唯一
      return redirect(res, '../picker')
    }
    if (url.pathname === '/picker') {
      logger.debug(`[INFO] Routing to picker page handler\n`)
      return pickerServe.servePage(req, res, config)
    }
    if (url.pathname.startsWith('/picker/api/')) {
      logger.debug(`[INFO] Routing to picker API handler\n`)
      return pickerServe.serveApi(req, res, url, config)
    }
    if (url.pathname.startsWith('/picker/')) {
      logger.debug(`[INFO] Routing to picker asset handler\n`)
      return pickerServe.serveAsset(req, res, url)
    }
    if (url.pathname === '/api/service') {
      logger.debug(`[INFO] Routing to service API handler\n`)
      return handleServiceAPI(req, res)
    }
    if (url.pathname === '/api/fs') {
      logger.debug(`[INFO] Routing to fs API handler\n`)
      return fsApi.serve(req, res, config)
    }
    if (url.pathname === '/bridge/') {
      // 规范化到 /bridge（无尾斜杠），保证页面相对链接基准唯一
      return redirect(res, '../bridge')
    }
    if (url.pathname === '/bridge') {
      logger.debug(`[INFO] Routing to bridge status page handler\n`)
      return bridgeStatusServe(req, res)
    }
    if (url.pathname.startsWith('/bridge/api/')) {
      logger.debug(`[INFO] Routing to bridge API handler\n`)
      return bridge.serve(req, res, url)
    }
    if (url.pathname === '/proxy') {
      // 规范化到 /proxy/（带尾斜杠），保证页面相对链接基准唯一
      return redirect(res, './proxy/')
    }
    if (url.pathname === '/proxy/') {
      logger.debug(`[INFO] Routing to proxy page handler\n`)
      return proxyPageServe(req, res, config)
    }
    if (url.pathname.startsWith('/proxy/') && url.pathname.length > 7) {
      logger.debug(`[INFO] Routing to proxy handler\n`)
      return proxy(req, res)
    }
    if (url.pathname.startsWith('/docs/')) {
      // AI 功能文档（docs/readme/*.md）：/docs/<name>.md 映射到包内 docs/readme，
      // 该目录同时是 GitHub Pages 站点的文档源，改一处两边生效，供 llms.txt 引用
      const docPath = path.join(__dirname, '..', 'docs', 'readme', path.basename(url.pathname))
      if (!docPath.endsWith('.md') || !fs.existsSync(docPath) || !fs.statSync(docPath).isFile()) {
        return sendPlain(res, 404, '404 Not Found')
      }
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' })
      return fs.createReadStream(docPath).pipe(res)
    }
    if (url.pathname.startsWith('/public/')) {
      const reqPath = path.join(publicDir, url.pathname.slice('/public/'.length))
      if (!fs.existsSync(reqPath) || !fs.statSync(reqPath).isFile()) {
        res.writeHead(404, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        return res.end('Not Found')
      }
      const ext = path.extname(reqPath).toLowerCase()
      const contentType = {
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.md': 'text/markdown',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.ttf': 'font/ttf',
      }[ext] || 'application/octet-stream'
      res.writeHead(200, { 
        'Content-Type': contentType,
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'access-control-allow-headers': '*',
      })
      return fs.createReadStream(reqPath).pipe(res)
    }

    logger.debug(`[INFO] Routing to file server handler\n`)
    fileServe(req, res, config)
  })
}

function handleServiceAPI(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, {
      'Content-Type': 'text/plain',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'access-control-allow-headers': '*',
    })
    return res.end('Method Not Allowed')
  }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', () => {
    try {
      const data = JSON.parse(body)
      logger.debug(`[SERVICE-API] Received action: ${data.action}\n`)

      if (data.action === 'register') {
        setTimeout(() => {
          logger.info(`[INFO] Triggering service registration...\n`)
          try {
            if (process.platform === 'win32') {
              execSync('start cmd /c u32-ls register', { stdio: 'ignore' })
            } else {
              execSync('u32-ls register &', { stdio: 'ignore' })
            }
          } catch (err) {
            logger.error(`[ERROR] Failed to trigger register: ${err.message}\n`)
          }
        }, 100)

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        return res.end(JSON.stringify({ ok: true }))
      }

      if (data.action === 'unregister') {
        setTimeout(() => {
          logger.info(`[INFO] Triggering service unregistration...\n`)
          try {
            if (process.platform === 'win32') {
              execSync('start cmd /c u32-ls unregister', { stdio: 'ignore' })
            } else {
              execSync('u32-ls unregister &', { stdio: 'ignore' })
            }
          } catch (err) {
            logger.error(`[ERROR] Failed to trigger unregister: ${err.message}\n`)
          }
        }, 100)

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        return res.end(JSON.stringify({ ok: true }))
      }

      logger.error(`[SERVICE-API] ERROR: Unknown action: ${data.action}\n`)
      res.writeHead(400, {
        'Content-Type': 'text/plain',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'access-control-allow-headers': '*',
      })
      return res.end('unknown action')
    } catch (e) {
      logger.error(`[SERVICE-API] ERROR: ${e.message}\n`)
      res.writeHead(400, {
        'Content-Type': 'text/plain',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'access-control-allow-headers': '*',
      })
      return res.end(e.message)
    }
  })
}

module.exports = { setupRoutes }
