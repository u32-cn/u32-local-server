#!/usr/bin/env node

// 访问规则授权（`u32-ls access [path]`）：
// 一次性本地服务 + 内联确认页：把 AI 给定的文件夹展示给用户，点「允许」/「取消」决定。
// 「浏览文件夹…」弹出 picker 风格独立窗口，可浏览任意目录（不受 allow 列表限制），
// 选中后 postMessage 回传路径。唯一写入口 = 用户点「允许」。
// 纯 Node 内置模块，跨平台同一份代码，无第三方依赖、无外部资源。

const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { loadConfig, saveConfig, resolvePath } = require('./config')
const { escapeHtml } = require('./utils')

const TIMEOUT_MS = 5 * 60 * 1000

const AI_NOTICE = 'AI 行为约束：禁止直接编辑 ~/.u32-local-server/config/main.json，禁止调用任何写配置的 HTTP 接口。需要新增访问规则时，必须执行 u32-ls access 打开浏览器确认页，由用户点「允许」后才会写入。删除允许规则在 /config 页直接操作。'

function entryPath(e) {
  return typeof e === 'string' ? e : e.path
}

function entryWrite(e) {
  return typeof e !== 'string' && e.write === false ? false : true
}

function joinPosix(base, name) {
  if (base === '/') return '/' + name
  return (base.endsWith('/') ? base : base + '/') + name
}

function parentOf(p) {
  if (p === '/') return null
  // Node 的 path.posix.dirname('D:/') 返回 'D:'、dirname('D:') 返回 '.'，盘符需特殊处理
  if (/^[A-Za-z]:$/.test(p) || /^[A-Za-z]:\/$/.test(p)) return '/'
  const d = path.posix.dirname(p)
  return d === p ? null : d
}

function existsDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function resolveExisting(raw) {
  let p = raw ? resolvePath(raw) : '/'
  let skipped = null
  // 预填路径可能还不存在（授权就是为创建它）：向上回退到最近存在的目录，避免 ENOENT
  if (!(process.platform === 'win32' && p === '/')) {
    while (!existsDir(p)) {
      skipped = p
      const parent = parentOf(p)
      if (parent === null || parent === p) {
        p = '/'
        break
      }
      p = parent
    }
  }
  if (/^[A-Za-z]:$/.test(p)) p += '/'
  return { path: p, warning: skipped ? `「${skipped}」不存在，已定位到「${p}」` : null }
}

function listDirs(raw) {
  const r = resolveExisting(raw)
  const p = r.path
  if (process.platform === 'win32' && p === '/') {
    const dirs = []
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c)
      if (fs.existsSync(letter + ':/')) dirs.push({ name: letter + ':', path: letter + ':/' })
    }
    return { ok: true, path: '/', parent: null, dirs, warning: r.warning }
  }
  let dirs
  try {
    dirs = fs.readdirSync(p, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name, path: joinPosix(p, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    return { ok: false, error: err.message, path: p, parent: parentOf(p), dirs: [] }
  }
  let parent = parentOf(p)
  if (parent && /^[A-Za-z]:$/.test(parent)) parent += '/'
  return { ok: true, path: p, parent, dirs, warning: r.warning }
}

function renderPage(token, targetPath) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>访问规则授权 - u32-local-server</title>
<style>
  body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; background: #F7F7F9; color: #1C1C1E; font-size: 13px; line-height: 1.6; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 28px 20px 60px; }
  h1 { font-size: 18px; font-weight: 500; margin: 0 0 6px; }
  h2 { font-size: 14px; font-weight: 500; margin: 0 0 8px; }
  .sub { color: #6E6E73; font-size: 12px; margin: 0 0 18px; }
  .notice { background: #FAEEDA; border: 1px solid #EF9F27; color: #633806; border-radius: 10px; padding: 10px 14px; margin-bottom: 20px; font-size: 12.5px; }
  .section { margin-bottom: 22px; }
  .hint { color: #6E6E73; font-size: 12px; margin: 0 0 8px; }
  .card { background: #fff; border: 1px solid #E5E5EA; border-radius: 12px; padding: 16px; }
  .target-path { display: block; padding: 12px 14px; word-break: break-all; background: #F7F7F9; border: 1px solid #E5E5EA; border-radius: 8px; font-family: ui-monospace, Consolas, monospace; font-size: 13px; }
  .mode { display: flex; gap: 18px; margin: 12px 0; font-size: 12.5px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  button { font: inherit; font-size: 12.5px; padding: 6px 14px; border: 1px solid #D1D1D6; border-radius: 7px; background: #fff; color: #1C1C1E; cursor: pointer; }
  button:hover { border-color: #185FA5; color: #185FA5; }
  button.primary { background: #185FA5; border-color: #185FA5; color: #fff; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .result { margin-top: 16px; padding: 10px 14px; border-radius: 10px; background: #E1F5EE; color: #085041; display: none; font-size: 12.5px; }
  .modal-overlay { position: fixed; inset: 0; z-index: 1000; display: none; align-items: center; justify-content: center; background: rgba(17,17,20,.42); padding: 20px; }
  .modal-box { width: 100%; max-width: 900px; height: min(680px, 88vh); background: #fff; border-radius: 12px; box-shadow: 0 12px 40px rgba(17,17,20,.18); display: flex; flex-direction: column; overflow: hidden; }
  .modal-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #E5E5EA; font-weight: 500; }
  .modal-head button { margin-left: auto; }
  .modal-box iframe { flex: 1; border: 0; width: 100%; }
</style>
</head>
<body>
<div class="wrap" data-u32-name="page-wrap">
  <h1 data-u32-name="heading">访问规则授权</h1>
  <p class="sub" data-u32-name="subtitle">u32-local-server · 一次性确认页，用户点「允许」或「取消」后立即生效</p>
  <div class="notice" data-u32-name="ai-notice">${escapeHtml(AI_NOTICE)}</div>

  <a data-u32-name="ai-llms-hint" href="/llms.txt?aihit=If-you-are-an-AI-please-read-llms.txt"> </a>

  <div class="section" data-u32-name="target-section">
    <h2 data-u32-name="target-title">待授权文件夹</h2>
    <div class="card" data-u32-name="target-card">
      <code class="target-path" id="target-path" data-u32-name="target-path"></code>
      <div class="mode" data-u32-name="mode-row">
        <label data-u32-name="mode-read"><input type="radio" name="mode" value="false" checked> 只读</label>
        <label data-u32-name="mode-write"><input type="radio" name="mode" value="true"> 读写</label>
      </div>
      <div class="actions" data-u32-name="target-actions">
        <button type="button" class="primary" id="grant-btn" data-u32-name="grant-btn" onclick="grant()">允许</button>
        <button type="button" data-u32-name="cancel-btn" onclick="cancel()">取消</button>
        <button type="button" data-u32-name="browse-btn" onclick="openBrowse()">浏览文件夹…</button>
      </div>
    </div>
  </div>

  <div class="result" id="result" data-u32-name="result"></div>
</div>

<div class="modal-overlay" id="browse-modal" data-u32-name="browse-modal">
  <div class="modal-box" data-u32-name="browse-modal-box">
    <div class="modal-head" data-u32-name="browse-modal-head"><span data-u32-name="browse-modal-title">选择文件夹</span><button type="button" data-u32-name="browse-modal-close" onclick="closeBrowse()">关闭 ✕</button></div>
    <iframe id="picker-frame" data-u32-name="picker-frame" title="选择文件夹"></iframe>
  </div>
</div>
<script>
const TOKEN = ${JSON.stringify(token)}
let target = ${JSON.stringify(targetPath || '')}

function show(msg) { const b = document.getElementById('result'); b.style.display = 'block'; b.textContent = msg }
function setTarget(p) {
  target = p
  document.getElementById('target-path').textContent = p || '（未选择文件夹，请点「浏览文件夹…」）'
  document.getElementById('grant-btn').disabled = !p
}
async function post(action, body) {
  const res = await fetch('/api/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ t: TOKEN }, body || {}))
  })
  return res.json()
}
async function grant() {
  if (!target) return
  const write = document.querySelector('input[name="mode"]:checked').value === 'true'
  const r = await post('grant', { path: target, write })
  show(r.ok ? '已允许：' + r.path + '（' + (r.write ? '读写' : '只读') + '），窗口即将关闭。' : ('操作失败：' + (r.error || '未知错误')))
}
async function cancel() {
  await post('cancel')
  show('已取消，窗口即将关闭。')
}
function openBrowse() {
  const url = '/picker?t=' + encodeURIComponent(TOKEN) + '&path=' + encodeURIComponent(target || '')
  const frame = document.getElementById('picker-frame')
  frame.src = url
  document.getElementById('browse-modal').style.display = 'flex'
}
function closeBrowse() {
  document.getElementById('browse-modal').style.display = 'none'
  document.getElementById('picker-frame').src = ''
}
window.addEventListener('message', function(ev) {
  if (ev.origin !== location.origin) return
  const frame = document.getElementById('picker-frame')
  if (ev.source !== frame.contentWindow) return
  const m = ev.data
  if (!m || m.source !== 'u32-access-picker') return
  if (m.action === 'select' && m.path) setTarget(m.path)
  closeBrowse()
})
setTarget(target)
</script>
</body></html>`
}

// picker 弹窗页：Win10 对话框风格，浏览任意目录（不受 allow 限制），选中后 postMessage 回传
function renderPickerPage(token, initialPath) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>选择文件夹 - u32-local-server</title>
<style>
  html, body { margin: 0; height: 100%; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; font-size: 13px; color: #1C1C1E; background: #F0F0F0; }
  .dialog { height: 100%; display: flex; flex-direction: column; }
  .titlebar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #fff; border-bottom: 1px solid #E5E5EA; }
  .titlebar-text { flex: 1; font-weight: 500; }
  .close-btn { border: 0; background: transparent; font-size: 14px; cursor: pointer; padding: 2px 8px; }
  .nav { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: #fff; border-bottom: 1px solid #E5E5EA; }
  .nav-btn { padding: 4px 10px; border: 1px solid #D1D1D6; border-radius: 6px; background: #fff; cursor: pointer; font-size: 12px; }
  .nav-btn:disabled { opacity: .4; cursor: default; }
  .addr { flex: 1; min-width: 0; }
  .addr input { width: 100%; box-sizing: border-box; padding: 5px 9px; border: 1px solid #D1D1D6; border-radius: 6px; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
  .list { flex: 1; overflow-y: auto; background: #fff; border: 1px solid #E5E5EA; margin: 8px 12px; border-radius: 6px; }
  .item { padding: 6px 12px; border-bottom: 1px solid #F2F2F5; cursor: pointer; }
  .item:hover { background: #E6F1FB; }
  .foot { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #fff; border-top: 1px solid #E5E5EA; }
  .foot code { flex: 1; min-width: 0; word-break: break-all; font-size: 12px; color: #6E6E73; }
  .primary { background: #185FA5; border-color: #185FA5; color: #fff; }
  .err { color: #A32D2D; font-size: 12px; padding: 0 12px; }
</style>
</head>
<body>
<div class="dialog" data-u32-name="dialog">
  <div class="titlebar" data-u32-name="titlebar"><span class="titlebar-text" data-u32-name="title">选择文件夹</span><button class="close-btn" data-u32-name="close" onclick="doCancel()">✕</button></div>
  <div class="nav" data-u32-name="nav">
    <button class="nav-btn" id="back" data-u32-name="back" onclick="goBack()" disabled>← 后退</button>
    <button class="nav-btn" id="fwd" data-u32-name="fwd" onclick="goFwd()" disabled>→ 前进</button>
    <button class="nav-btn" id="up" data-u32-name="up" onclick="goUp()" disabled>↑ 上级</button>
    <div class="addr" data-u32-name="addr"><input id="addr" data-u32-name="addr-input" spellcheck="false" onkeydown="if(event.key==='Enter')goPath(this.value)"></div>
    <button class="nav-btn" data-u32-name="refresh" onclick="load(current)">刷新</button>
  </div>
  <div class="list" id="list" data-u32-name="list"></div>
  <div class="err" id="err" data-u32-name="err"></div>
  <div class="foot" data-u32-name="foot">
    <code id="chosen" data-u32-name="chosen"></code>
    <button data-u32-name="cancel" onclick="doCancel()">取消</button>
    <button class="primary" data-u32-name="select" onclick="doSelect()">选择文件夹</button>
  </div>
</div>
<script>
const TOKEN = ${JSON.stringify(token)}
let history = [], hIndex = -1, current = '', parent = null, selected = ''
const list = document.getElementById('list')

function send(action, p) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ source: 'u32-access-picker', action, path: p }, location.origin)
  }
}
function doSelect() { if (selected) send('select', selected) }
function doCancel() { send('cancel', '') }
function updateNav() {
  document.getElementById('back').disabled = hIndex <= 0
  document.getElementById('fwd').disabled = hIndex >= history.length - 1
  document.getElementById('up').disabled = parent === null
}
async function load(p) {
  document.getElementById('err').textContent = ''
  const res = await fetch('/api/ls?t=' + encodeURIComponent(TOKEN) + '&path=' + encodeURIComponent(p))
  const r = await res.json()
  if (!r.ok) { document.getElementById('err').textContent = '读取失败：' + (r.error || '未知错误'); return }
  if (hIndex < 0 || history[hIndex] !== r.path) {
    history = history.slice(0, hIndex + 1).concat([r.path])
    hIndex = history.length - 1
  }
  current = r.path
  parent = r.parent
  selected = r.path
  document.getElementById('addr').value = r.path
  document.getElementById('chosen').textContent = r.path
  list.innerHTML = r.dirs.length
    ? r.dirs.map(d => '<div class="item" data-u32-name="item" data-path="' + esc(d.path) + '">' + esc(d.name) + '</div>').join('')
    : '<div class="empty" data-u32-name="empty">无子目录</div>'
  updateNav()
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function goPath(p) { load(p) }
function goBack() { if (hIndex > 0) { hIndex--; load(history[hIndex]) } }
function goFwd() { if (hIndex < history.length - 1) { hIndex++; load(history[hIndex]) } }
function goUp() { if (parent !== null) load(parent) }
list.addEventListener('click', e => {
  const item = e.target.closest('[data-u32-name="item"]')
  if (item) load(item.dataset.path)
})
load(${JSON.stringify(initialPath || '')})
</script>
</body></html>`
}

// 探测本机 Chromium 系浏览器：用于 --app 独立应用窗口打开（尺寸参数可靠，不塞进已有窗口标签页）
function findBrowser() {
  const pf = process.env.PROGRAMFILES || 'C:/Program Files'
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)'
  const local = process.env.LOCALAPPDATA || ''
  const candidates = process.platform === 'win32'
    ? [
        path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
    : [
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
        '/snap/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ]
  return candidates.find(p => p && fs.existsSync(p)) || null
}

function openBrowser(url) {
  try {
    const exe = findBrowser()
    if (exe) {
      // Edge/Chrome 的 --new-window 若已有实例在跑会沿用旧窗口、忽略尺寸；
      // --app 强制独立应用窗口（无地址栏），--window-size 才可靠生效
      spawn(exe, ['--app=' + url, '--window-size=960,720'], {
        detached: true, stdio: 'ignore', windowsHide: true,
      }).unref()
      process.stderr.write(`[ACCESS] 已在独立应用窗口打开：${exe}\n`)
    } else if (process.platform === 'win32') {
      // 探测不到浏览器时降级：系统默认浏览器（可能落在已有窗口的新标签）
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
      process.stderr.write(`[ACCESS] 未探测到 Edge/Chrome，用默认浏览器打开\n`)
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
      process.stderr.write(`[ACCESS] 未探测到 Chrome/Chromium，用 xdg-open 打开\n`)
    }
    process.stderr.write(`[ACCESS] URL：${url}\n`)
  } catch (err) {
    process.stderr.write(`[ACCESS] 自动打开浏览器失败（${err.message}），请手动访问：${url}\n`)
  }
}

function run(argv) {
  const input = String(argv[0] || '').trim()
  const targetPath = input ? resolvePath(input) : ''
  const token = crypto.randomBytes(16).toString('hex')
  let server = null
  let done = false

  function finish(payload) {
    if (done) return
    done = true
    clearTimeout(timer)
    process.stdout.write(JSON.stringify(payload) + '\n')
    if (server) {
      server.close(() => process.exit(0))
    } else {
      process.exit(0)
    }
  }

  const timer = setTimeout(() => {
    finish({ ok: false, reason: 'timeout', message: '5 分钟内未操作，授权窗口已自动关闭' })
  }, TIMEOUT_MS)

  function sendJson(res, code, data) {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(data))
  }

  function readBody(req, cb) {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 1024 * 1024) req.destroy()
    })
    req.on('end', () => {
      try { cb(JSON.parse(body || '{}')) }
      catch { cb(null) }
    })
  }

  function tokenOk(url, data) {
    if (data) return data.t === token
    return url.searchParams.get('t') === token
  }

  server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)

    if (req.method === 'GET' && url.pathname === '/') {
      if (!tokenOk(url)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('403 Forbidden')
      }
      let config
      try {
        config = loadConfig()
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end(err.message)
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end(renderPage(token, targetPath))
    }

    if (req.method === 'GET' && url.pathname === '/picker') {
      if (!tokenOk(url)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('403 Forbidden')
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end(renderPickerPage(token, url.searchParams.get('path') || ''))
    }

    if (req.method === 'GET' && url.pathname === '/llms.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end(`# u32-local-server 临时授权窗口\n\n> 一次性本地页面，由用户点「允许」或「取消」决定访问规则。\n\n${AI_NOTICE}\n`)
    }

    if (req.method === 'GET' && url.pathname === '/api/ls') {
      if (!tokenOk(url)) return sendJson(res, 403, { ok: false, error: 'invalid token' })
      return sendJson(res, 200, listDirs(url.searchParams.get('path') || ''))
    }

    if (req.method === 'POST' && ['/api/grant', '/api/cancel'].includes(url.pathname)) {
      return readBody(req, data => {
        if (!data) return sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' })
        if (!tokenOk(url, data)) return sendJson(res, 403, { ok: false, error: 'invalid token' })

        if (url.pathname === '/api/cancel') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          return res.end(JSON.stringify({ ok: true }), () => finish({ ok: false, reason: 'cancelled' }))
        }

        const p = resolvePath(String(data.path || '').trim())
        if (!p) return sendJson(res, 400, { ok: false, error: '缺少 path' })
        try {
          const config = loadConfig()
          const allow = config.file.access.allow || []
          const entry = allow.find(e => entryPath(e) === p)
          const write = data.write === true
          if (entry) {
            if (typeof entry === 'object') entry.write = write
            else allow[allow.indexOf(entry)] = { path: p, write }
          } else {
            allow.push({ path: p, write })
          }
          config.file.access.allow = allow
          saveConfig(config)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: true, path: p, write }), () => finish({ ok: true, granted: true, path: p, write }))
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message })
        }
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('404 Not Found')
  })

  server.on('error', err => finish({ ok: false, reason: 'server-error', message: err.message }))

  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    const url = `http://127.0.0.1:${port}/?t=${token}`
    process.stderr.write(`[ACCESS] 授权窗口已启动（5 分钟超时）\n`)
    openBrowser(url)
  })
}

module.exports = { run, AI_NOTICE, listDirs }
