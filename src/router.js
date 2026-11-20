const logger = require('./logger')
const path = require('path')
const { redirect } = require('./utils')
const seaAssets = require('./sea-assets')
const fsApi = require('./fs-api')
const bridge = require('./bridge')
const artifacts = require('./artifacts')
const sysinfo = require('./sysinfo')
const statusPage = require('./status-page')
const pickerGuide = require('./picker-guide')
const summary = require('./summary')
const serviceStatus = require('./service-status')

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

function sendJson(res, data, code) {
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'access-control-allow-origin': '*',
  })
  res.end(JSON.stringify(data))
}

function setupRoutes(server, fileServe, proxy, configServe, homeServe, proxyPageServe, bridgeStatusServe, pickerServe, pickerDemoServe, config) {
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
    const isWriteApi = url.pathname.startsWith('/config/api') || url.pathname === '/api/service' || url.pathname === '/api/update' || url.pathname === '/api/fs' || (url.pathname.startsWith('/bridge/api/') && (req.method === 'POST' || req.method === 'DELETE'))
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

    if (url.pathname === '/favicon.ico') {
      // 浏览器默认会探 /favicon.ico；页面已用 SVG 图标，这里回 204 避免控制台与指标里出现 404/403 噪音
      res.writeHead(204)
      return res.end()
    }
    if (url.pathname === '/' || url.pathname === '') {
      logger.debug(`[INFO] Routing to home page\n`)
      return homeServe(req, res, config)
    }
    if (url.pathname === '/llms.txt') {
      logger.debug(`[INFO] Routing to llms.txt\n`)
      let content = seaAssets.readAsset('docs/llms.txt', path.join(__dirname, '..'))
      if (content !== null) {
        content = content.toString('utf8').replace(/\{\{PORT\}\}/g, String(config.port))
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
    if (url.pathname === '/picker-guide') {
      logger.debug(`[INFO] Routing to picker guide page handler\n`)
      return pickerGuide.serve(req, res, config)
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
    if (url.pathname === '/api/summary' && req.method === 'GET') {
      // 首页状态带数据源：与 SSR 首屏同一份计算，只含计数与布尔
      logger.debug(`[INFO] Routing to summary api\n`)
      return sendJson(res, Object.assign({ ok: true }, summary.collect(config)))
    }
    if (url.pathname === '/api/service-status' && req.method === 'GET') {
      // 服务注册状态（只读探测）：首页运维卡轮询用，避免信任提交结果造成的假成功
      logger.debug(`[INFO] Routing to service status api\n`)
      return sendJson(res, Object.assign({ ok: true }, serviceStatus.detect()))
    }
    if (url.pathname === '/api/service') {
      logger.debug(`[INFO] Routing to service API handler\n`)
      return handleServiceAPI(req, res)
    }
    if (url.pathname === '/api/update' && req.method === 'GET') {
      // 升级状态快照（首页「软件更新」卡数据源，前端 5s 轮询同款）：
      // { latest, updateAvailable, downloaded, downloading, progress, error }
      // 检测与下载由服务端自动调度（启动 30s 后 + 每 6h），前端只读状态、触发安装
      logger.debug(`[INFO] Routing to update status api\n`)
      const update = require('./update')
      return sendJson(res, update.status())
    }
    if (url.pathname === '/api/update' && req.method === 'POST') {
      // 触发动作：action=check 手动重查（页面上「检测更新」）；action=install 拉起安装向导；
      // action=download 手动重试下载（正常流程自动，失败重试用）
      logger.debug(`[INFO] Routing to update API handler\n`)
      return handleUpdateAPI(req, res)
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
    if (url.pathname === '/docs' || url.pathname === '/docs/') {
      // 规范化到文档站入口页，离线环境下也能看到完整排版文档
      return redirect(res, './docs/index.html')
    }
    if (url.pathname === '/docs/index.html' || url.pathname === '/docs/reader.html') {
      // 文档站页面（白名单固定两个 HTML，杜绝路径穿越）；
      // docs/ 同时是 GitHub Pages 站点源，本地伺服同一批文件，离线可用
      const rel = path.join('docs', path.basename(url.pathname))
      const content = seaAssets.readAsset(rel, path.join(__dirname, '..'))
      if (content === null) {
        return sendPlain(res, 404, '404 Not Found')
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(content)
    }
    if (url.pathname.startsWith('/docs/assets/')) {
      // 文档站静态资源（css/js/字体/marked vendor）
      const rel = path.join('docs', 'assets', url.pathname.slice('/docs/assets/'.length))
      const content = seaAssets.readAsset(rel, path.join(__dirname, '..'))
      if (content === null) {
        return sendPlain(res, 404, '404 Not Found')
      }
      const ext = path.extname(rel).toLowerCase()
      const contentType = {
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.md': 'text/markdown',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.ttf': 'font/ttf',
      }[ext] || 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': contentType })
      return res.end(content)
    }
    if (url.pathname.startsWith('/docs/readme/')) {
      // 阅读页 reader.html 的 fetch 目标（Pages 站点同路径）：功能文档 docs/readme/*.md
      // 该目录同时是 GitHub Pages 站点的文档源，改一处两边生效，供 llms.txt 引用
      const basename = path.basename(url.pathname)
      if (!basename.endsWith('.md')) {
        return sendPlain(res, 404, '404 Not Found')
      }
      const content = seaAssets.readAsset(path.join('docs', 'readme', basename), path.join(__dirname, '..'))
      if (content === null) {
        return sendPlain(res, 404, '404 Not Found')
      }
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' })
      return res.end(content)
    }
    if (url.pathname.startsWith('/docs/') && url.pathname.endsWith('.md')) {
      // 兼容旧直链：/docs/<name>.md 映射到包内 docs/readme
      const basename = path.basename(url.pathname)
      const content = seaAssets.readAsset(path.join('docs', 'readme', basename), path.join(__dirname, '..'))
      if (content === null) {
        return sendPlain(res, 404, '404 Not Found')
      }
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' })
      return res.end(content)
    }
    if (url.pathname.startsWith('/public/')) {
      const rel = url.pathname.slice('/public/'.length)
      const content = seaAssets.readAsset(path.join('public', rel), path.join(__dirname, '..'))
      if (content === null) {
        res.writeHead(404, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        return res.end('Not Found')
      }
      const ext = path.extname(rel).toLowerCase()
      const contentType = {
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.md': 'text/markdown',
        '.svg': 'image/svg+xml',
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
      return res.end(content)
    }

    logger.debug(`[INFO] Routing to file server handler\n`)
    fileServe(req, res, config)
  })
}

// 用当前 node 运行时直接执行本包入口，不依赖 u32-ls 是否在 PATH 里：
// AI 托管会话装的全局包常落在工具私有 node 目录，PATH 里没有 u32-ls，
// 原实现 execSync('start cmd /c u32-ls register') 会静默失败却照样回 ok:true（假成功）
function spawnServiceCommand(action) {
  const { spawn } = require('child_process')
  // SEA 模式：process.execPath 就是 u32-ls 本体，直接传 action
  // node 模式：当前 node 运行时 + 包内入口脚本 + action
  const args = seaAssets.IS_SEA
    ? [action]
    : [path.join(__dirname, 'index.js'), action]
  const child = spawn(process.execPath, args, {
    cwd: seaAssets.IS_SEA ? path.dirname(process.execPath) : path.join(__dirname, '..'),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

function handleServiceAPI(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, { ok: false, error: 'method-not-allowed' }, 405)
  }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', () => {
    let data
    try {
      data = JSON.parse(body || '{}')
    } catch (e) {
      logger.error(`[SERVICE-API] ERROR: invalid json body\n`)
      return sendJson(res, { ok: false, error: 'invalid-json' }, 400)
    }

    const action = data.action
    logger.debug(`[SERVICE-API] Received action: ${action}\n`)

    if (action !== 'register' && action !== 'unregister') {
      logger.error(`[SERVICE-API] ERROR: Unknown action: ${action}\n`)
      return sendJson(res, { ok: false, error: 'unknown-action' }, 400)
    }

    // systemd 单元写入 /etc/systemd/system 需要 root，网页无法提权：
    // 明确回报而不是假装成功，前端会提示用户到终端执行 sudo
    if (process.platform !== 'win32') {
      return sendJson(res, {
        ok: false,
        error: 'requires-root',
        hint: 'sudo u32-ls ' + action,
      })
    }

    try {
      spawnServiceCommand(action)
      logger.info(`[INFO] Spawned service ${action} via node runtime\n`)
      // accepted 只代表子进程已拉起，真实结果由前端轮询 /api/service-status 确认
      return sendJson(res, { ok: true, accepted: true, action })
    } catch (err) {
      logger.error(`[ERROR] Failed to spawn ${action}: ${err.message}\n`)
      return sendJson(res, { ok: false, error: err.message }, 500)
    }
  })
}

// 升级 API：POST { action: 'check' | 'download' | 'install' }
// check：手动重查（更新内部状态并返回快照）；download：手动重试下载（正常流程自动）；
// install：对缓存里的最新版 exe 拉起安装向导（下载就绪后页面上「安装新版本」按钮用）
function handleUpdateAPI(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, { ok: false, error: 'method-not-allowed' }, 405)
  }
  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', () => {
    let data
    try { data = JSON.parse(body || '{}') } catch (e) {
      return sendJson(res, { ok: false, error: 'invalid-json' }, 400)
    }
    const action = data.action
    if (action !== 'check' && action !== 'download' && action !== 'install') {
      return sendJson(res, { ok: false, error: 'unknown-action' }, 400)
    }
    const update = require('./update')

    if (action === 'check') {
      update.check(false)
        .then(s => sendJson(res, s))
        .catch(err => sendJson(res, { ok: false, error: err.message }, 502))
      return
    }
    if (action === 'download') {
      update.downloadLatest()
        .then(s => sendJson(res, s))
        .catch(err => sendJson(res, { ok: false, error: err.message }, 502))
      return
    }

    // install：优先用状态里的 downloadedFile，兜底扫缓存目录取版本最大的
    const fs = require('fs')
    const path = require('path')
    let file = data.file || update.status().file
    if (!file || !fs.existsSync(file)) {
      file = null
      try {
        const candidates = fs.readdirSync(update.UPDATE_DIR).filter(n => /^u32-local-server-setup-.*\.exe$/.test(n))
        if (candidates.length === 0) return sendJson(res, { ok: false, error: 'no-downloaded-installer' }, 400)
        // 恒留一个的约定下通常只有一个；仍按版本最大兜底
        candidates.sort((a, b) => update.compareVersions(
          (a.match(/setup-(.*)\.exe$/) || [])[1] || '0',
          (b.match(/setup-(.*)\.exe$/) || [])[1] || '0'))
        file = path.join(update.UPDATE_DIR, candidates[candidates.length - 1])
      } catch (err) {
        return sendJson(res, { ok: false, error: err.message }, 500)
      }
    }
    const r = update.install(file)
    if (!r.ok) return sendJson(res, { ok: false, error: r.error }, 500)
    return sendJson(res, r)
  })
}

module.exports = { setupRoutes }
