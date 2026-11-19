#!/usr/bin/env node

// picker 静态资源分发：/picker/style.css、/picker/icons.svg、/picker/client/*.js
// 只服务固定白名单文件（不存在路径拼接，天然免疫目录穿越）；不缓存，改 CSS/JS 后刷新即生效

const fs = require('fs')
const path = require('path')
const { CORS_HEADERS } = require('../utils')

const PICKER_PREFIX = '/picker/'

const ASSETS = {
  'style.css': 'text/css; charset=utf-8',
  'icons.svg': 'image/svg+xml; charset=utf-8',
  'client/main.js': 'application/javascript; charset=utf-8',
  'client/list.js': 'application/javascript; charset=utf-8',
  'client/nav.js': 'application/javascript; charset=utf-8',
  'client/ui.js': 'application/javascript; charset=utf-8',
  'client/actions.js': 'application/javascript; charset=utf-8',
}

function serve(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS_HEADERS))
    return res.end('Method Not Allowed')
  }
  const idx = url.pathname.indexOf(PICKER_PREFIX)
  const rel = idx === -1 ? '' : url.pathname.slice(idx + PICKER_PREFIX.length)
  const mime = ASSETS[rel]
  if (!mime) {
    res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS_HEADERS))
    return res.end('Not Found')
  }
  const filePath = path.join(__dirname, rel)
  let content
  try {
    content = fs.readFileSync(filePath)
  } catch (err) {
    res.writeHead(500, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS_HEADERS))
    return res.end('Asset read failed: ' + err.message)
  }
  res.writeHead(200, Object.assign({
    'Content-Type': mime,
    'Cache-Control': 'no-cache',
    'Content-Length': content.length,
  }, CORS_HEADERS))
  if (req.method === 'HEAD') return res.end()
  res.end(content)
}

module.exports = { serve, ASSETS }
