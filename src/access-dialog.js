// 访问规则授权对话框（/access-dialog）：主服务内 SSR 页面，替代旧 `u32-ls access` 一次性服务。
// 唯一新增 allow 写入口 = 用户在本页点「允许」。
// 安全模型：
// - token 由服务端生成，只内嵌在本页 HTML（无单独领 token 接口；URL 不带 token）
// - 写请求必须带 X-Access-Token 自定义头（跨域发不出去）+ token 单次消耗 + 10 分钟过期
// - 响应头 X-Frame-Options: DENY + CSP frame-ancestors 'self'：外部网页嵌不了 iframe，
//   只能弹窗/直接打开（地址栏 127.0.0.1 可见），防 clickjacking
// - Host 校验与写接口 Origin 校验由 router.js 全局层完成（DNS rebinding / CSRF）
// 浏览目录不受 allow 列表限制：授权页正是要给未授权目录授权。
// 纯 Node 内置模块，跨平台同一份代码。

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { loadConfig, saveConfig, resolvePath } = require('./config')
const { escapeHtml } = require('./utils')
const logger = require('./logger')

const TOKEN_TTL_MS = 10 * 60 * 1000
// token 池上限：防御性的小内存护栏，正常使用远远用不到
const TOKEN_MAX = 32

// { token: expiresAt }
const tokens = new Map()

function issueToken() {
  const now = Date.now()
  // 清过期
  for (const [t, exp] of tokens) {
    if (exp < now) tokens.delete(t)
  }
  while (tokens.size >= TOKEN_MAX) {
    tokens.delete(tokens.keys().next().value)
  }
  const token = crypto.randomBytes(32).toString('hex')
  tokens.set(token, now + TOKEN_TTL_MS)
  return token
}

function consumeToken(token) {
  if (!token || typeof token !== 'string') return false
  const exp = tokens.get(token)
  if (!exp || exp < Date.now()) return false
  tokens.delete(token)
  return true
}

const AI_NOTICE = 'AI 行为约束：禁止直接编辑 ~/.u32-local-server/config/main.json，禁止直接调用本写接口。需要新增访问规则时，只能引导用户打开 /access-dialog（或执行 u32-ls access），由用户点「允许」后写入。删除允许规则在 /config 页直接操作。'

// —— 目录浏览（从旧 cmd-access.js 迁移，行为一致） ——

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

// —— 页面 ——

function renderPage(targetPath) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>添加访问目录 - u32-local-server</title>
<style>
  body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; background: #F7F7F9; color: #1C1C1E; font-size: 13px; line-height: 1.6; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 28px 20px 60px; }
  h1 { font-size: 18px; font-weight: 500; margin: 0 0 6px; }
  h2 { font-size: 14px; font-weight: 500; margin: 0 0 8px; }
  .sub { color: #6E6E73; font-size: 12px; margin: 0 0 18px; }
  .notice { background: #FAEEDA; border: 1px solid #EF9F27; color: #633806; border-radius: 10px; padding: 10px 14px; margin-bottom: 20px; font-size: 12.5px; }
  .section { margin-bottom: 22px; }
  .card { background: #fff; border: 1px solid #E5E5EA; border-radius: 12px; padding: 16px; }
  .target-path { display: block; padding: 12px 14px; word-break: break-all; background: #F7F7F9; border: 1px solid #E5E5EA; border-radius: 8px; font-family: ui-monospace, Consolas, monospace; font-size: 13px; }
  .mode { display: flex; gap: 18px; margin: 12px 0; font-size: 12.5px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  button { font: inherit; font-size: 12.5px; padding: 6px 14px; border: 1px solid #D1D1D6; border-radius: 7px; background: #fff; color: #1C1C1E; cursor: pointer; }
  button:hover { border-color: #185FA5; color: #185FA5; }
  button.primary { background: #185FA5; border-color: #185FA5; color: #fff; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .result { margin-top: 16px; padding: 10px 14px; border-radius: 10px; background: #E1F5EE; color: #085041; display: none; font-size: 12.5px; }
  .result.err { background: #FBE9E9; color: #6E1414; }
  .warning { margin-top: 10px; padding: 8px 12px; border-radius: 8px; background: #FAEEDA; color: #633806; font-size: 12px; display: none; }
  .modal-overlay { position: fixed; inset: 0; z-index: 1000; display: none; align-items: center; justify-content: center; background: rgba(17,17,20,.42); padding: 20px; }
  .modal-box { width: 100%; max-width: 900px; height: min(680px, 88vh); background: #fff; border-radius: 12px; box-shadow: 0 12px 40px rgba(17,17,20,.18); display: flex; flex-direction: column; overflow: hidden; }
  .modal-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #E5E5EA; font-weight: 500; }
  .modal-head button { margin-left: auto; }
  .modal-box iframe { flex: 1; border: 0; width: 100%; }
</style>
</head>
<body>
<div class="wrap">
  <h1>添加访问目录</h1>
  <p class="sub">u32-local-server · 由用户确认后写入允许列表，token 单次有效（10 分钟内未操作请刷新本页）</p>
  <div class="notice">${escapeHtml(AI_NOTICE)}</div>

  <a href="/llms.txt?aihit=If-you-are-an-AI-please-read-llms.txt"> </a>

  <div class="section">
    <h2>待授权文件夹</h2>
    <div class="card">
      <code class="target-path" id="target-path"></code>
      <div class="warning" id="warning"></div>
      <div class="mode">
        <label><input type="radio" name="mode" value="false" checked> 只读</label>
        <label><input type="radio" name="mode" value="true"> 读写</label>
      </div>
      <div class="actions">
        <button type="button" class="primary" id="grant-btn" onclick="grant()">允许</button>
        <button type="button" onclick="closeWindow()">取消</button>
        <button type="button" onclick="openBrowse()">浏览文件夹…</button>
      </div>
    </div>
  </div>

  <div class="result" id="result"></div>
</div>

<div class="modal-overlay" id="browse-modal">
  <div class="modal-box">
    <div class="modal-head"><span>选择文件夹</span><button type="button" onclick="closeBrowse()">关闭 ✕</button></div>
    <iframe id="browse-frame" title="选择文件夹"></iframe>
  </div>
</div>
<script>
const TOKEN = "__U32_ACCESS_TOKEN__"
let target = ${JSON.stringify(targetPath || '')}

function show(msg, isErr) {
  const b = document.getElementById('result')
  b.style.display = 'block'
  b.classList.toggle('err', !!isErr)
  b.textContent = msg
}
function setTarget(p) {
  target = p
  document.getElementById('target-path').textContent = p || '（未选择文件夹，请点「浏览文件夹…」）'
  document.getElementById('grant-btn').disabled = !p
}
async function grant() {
  if (!target) return
  const write = document.querySelector('input[name="mode"]:checked').value === 'true'
  try {
    const res = await fetch('/access-dialog/api/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Token': TOKEN },
      body: JSON.stringify({ path: target, write })
    })
    const r = await res.json()
    if (r.ok) {
      show('已允许：' + r.path + '（' + (r.write ? '读写' : '只读') + '）。可关闭本窗口；/config 页已同步可见。')
    } else {
      show('操作失败：' + (r.error || '未知错误') + '（token 可能已过期，请刷新本页重试）', true)
    }
  } catch (e) {
    show('请求失败：' + e.message, true)
  }
}
function closeWindow() { window.close() }
function openBrowse() {
  // token 经同源 iframe src 传给浏览页（iframe src 不进历史、外部页面读不到，不破坏安全模型）
  const frame = document.getElementById('browse-frame')
  frame.src = '/access-dialog/browse?t=' + encodeURIComponent(TOKEN) + '&path=' + encodeURIComponent(target || '')
  document.getElementById('browse-modal').style.display = 'flex'
}
function closeBrowse() {
  document.getElementById('browse-modal').style.display = 'none'
  document.getElementById('browse-frame').src = ''
}
window.addEventListener('message', function(ev) {
  if (ev.origin !== location.origin) return
  const frame = document.getElementById('browse-frame')
  if (ev.source !== frame.contentWindow) return
  const m = ev.data
  if (!m || m.source !== 'u32-access-picker') return
  if (m.action === 'select' && m.path) setTarget(m.path)
  closeBrowse()
})
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
async function loadWarning() {
  try {
    const res = await fetch('/access-dialog/api/ls?t=' + encodeURIComponent(TOKEN) + '&path=' + encodeURIComponent(target || ''))
    if (!res.ok) return
    const r = await res.json()
    if (r.warning) {
      const w = document.getElementById('warning')
      w.textContent = r.warning
      w.style.display = 'block'
    }
  } catch {}
}
setTarget(target)
if (target) loadWarning()
</script>
</body></html>`
}

// 浏览器内嵌页（同源 iframe 用）：Win10 对话框风格，浏览任意目录，选中后 postMessage 回传
function renderBrowsePage(initialPath) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>选择文件夹 - u32-local-server</title>
<style>
  html, body { margin: 0; height: 100%; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; font-size: 13px; color: #1C1C1E; background: #F0F0F0; }
  .dialog { height: 100%; display: flex; flex-direction: column; }
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
<div class="dialog">
  <div class="nav">
    <button class="nav-btn" id="back" onclick="goBack()" disabled>← 后退</button>
    <button class="nav-btn" id="fwd" onclick="goFwd()" disabled>→ 前进</button>
    <button class="nav-btn" id="up" onclick="goUp()" disabled>↑ 上级</button>
    <div class="addr"><input id="addr" spellcheck="false" onkeydown="if(event.key==='Enter')goPath(this.value)"></div>
    <button class="nav-btn" onclick="load(current)">刷新</button>
  </div>
  <div class="list" id="list"></div>
  <div class="err" id="err"></div>
  <div class="foot">
    <code id="chosen"></code>
    <button onclick="doCancel()">取消</button>
    <button class="primary" onclick="doSelect()">选择文件夹</button>
  </div>
</div>
<script>
const TOKEN = new URLSearchParams(location.search).get('t') || ''
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
  const res = await fetch('/access-dialog/api/ls?t=' + encodeURIComponent(TOKEN) + '&path=' + encodeURIComponent(p || ''))
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
    ? r.dirs.map(d => '<div class="item" data-path="' + esc(d.path) + '">' + esc(d.name) + '</div>').join('')
    : '<div class="empty">无子目录</div>'
  updateNav()
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function goPath(p) { load(p) }
function goBack() { if (hIndex > 0) { hIndex--; load(history[hIndex]) } }
function goFwd() { if (hIndex < history.length - 1) { hIndex++; load(history[hIndex]) } }
function goUp() { if (parent !== null) load(parent) }
list.addEventListener('click', e => {
  const item = e.target.closest('[data-path]')
  if (item) load(item.dataset.path)
})
load(${JSON.stringify(initialPath || '')})
</script>
</body></html>`
}

// —— HTTP 处理 ——

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

function readBody(req, cb) {
  let body = ''
  req.on('data', chunk => {
    body += chunk
    if (body.length > 64 * 1024) req.destroy()
  })
  req.on('end', () => {
    try { cb(JSON.parse(body || '{}')) }
    catch { cb(null) }
  })
}

function entryPath(e) {
  return typeof e === 'string' ? e : e.path
}

function serve(req, res, url) {
  // 禁 iframe（外部 clickjacking 防线）；本页需要被 /config 与自身同源 iframe 使用
  const frameGuard = {
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'self'",
    'Cache-Control': 'no-store',
  }

  if (req.method === 'GET' && url.pathname === '/access-dialog') {
    const token = issueToken()
    const rawPath = url.searchParams.get('path') || ''
    const targetPath = rawPath ? resolvePath(rawPath) : ''
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, frameGuard))
    return res.end(renderPage(targetPath).replace('"__U32_ACCESS_TOKEN__"', JSON.stringify(token)))
  }

  if (req.method === 'GET' && url.pathname === '/access-dialog/browse') {
    // 同源 iframe 内嵌页：无需 token（只读浏览 API 另校验），禁外站嵌由 frameGuard 兜底
    const rawPath = url.searchParams.get('path') || ''
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, frameGuard))
    return res.end(renderBrowsePage(rawPath ? resolvePath(rawPath) : ''))
  }

  if (req.method === 'GET' && url.pathname === '/access-dialog/api/ls') {
    const token = url.searchParams.get('t') || ''
    const exp = tokens.get(token)
    if (!exp || exp < Date.now()) return sendJson(res, 403, { ok: false, error: 'invalid token' })
    return sendJson(res, 200, listDirs(url.searchParams.get('path') || ''))
  }

  if (req.method === 'POST' && url.pathname === '/access-dialog/api/grant') {
    return readBody(req, data => {
      if (!data) return sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' })
      // token 校验：请求头优先（跨域发不出自定义头，这是 CSRF 核心防线），兜底允许 body.t
      const token = req.headers['x-access-token'] || data.t
      if (!consumeToken(token)) {
        logger.error('[ACCESS-DIALOG] Rejected grant: invalid/expired token\n')
        return sendJson(res, 403, { ok: false, error: 'invalid or expired token' })
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
        logger.info(`[ACCESS-DIALOG] Granted: ${p} (${write ? 'write' : 'read'})\n`)
        sendJson(res, 200, { ok: true, path: p, write })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message })
      }
    })
  }

  sendJson(res, 404, { ok: false, error: 'not found' })
}

module.exports = { serve }
