const { loadConfig, saveConfig, resolvePath } = require('./config')
const logger = require('./logger')
const fs = require('fs')
const { escapeHtml } = require('./utils')

function renderPage(config) {
  // 存储值即 resolvePath 后的绝对路径，直接展示，不做 ~ 反向转换
  const display = config
  const allowHtml = display.file.access.allow.map(e => {
    const p = typeof e === 'string' ? e : e.path
    const writable = typeof e === 'string' ? true : e.write !== false
    return `<div class="rule" data-type="allow" data-path="${escapeHtml(p)}" data-write="${writable}"><code>${escapeHtml(p)}</code><div class="rule-actions"><button class="mode-btn">${writable ? '读写' : '只读'}</button><button class="visit-btn"><i class="fas fa-external-link-alt"></i> 访问</button><button class="del-btn">删除</button></div></div>`
  }).join('')
  const denyHtml = display.file.access.deny.map(p =>
    `<div class="rule" data-type="deny" data-path="${escapeHtml(p)}"><code>${escapeHtml(p)}</code><button class="del-btn">删除</button></div>`
  ).join('')
  const mimeEntries = Object.entries(display.file.mime || {}).sort((a, b) => a[0].localeCompare(b[0]))
  const mimeHtml = mimeEntries.map(([ext, type]) =>
    `<div class="rule" data-type="mime" data-ext="${escapeHtml(ext)}"><code>${escapeHtml(ext)}</code><code>${escapeHtml(type)}</code><button class="del-btn">删除</button></div>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>u32-local-server config</title>
  <link rel="stylesheet" href="./public/css/space-grotesk.css">
  <link rel="stylesheet" href="./public/css/all.min.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FFFFFF;
      color: #000000;
      line-height: 1.5;
      font-size: 14px;
    }

    .container {
      max-width: 1000px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .header {
      border-bottom: 2px solid #000000;
      padding-bottom: 20px;
      margin-bottom: 40px;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 5px;
    }

    .tagline {
      font-size: 13px;
      color: #666;
      font-weight: 400;
    }

    .restart-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
    }

    .restart-btn:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .home-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
    }

    .home-btn:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .restart-notice {
      color: #DC2626;
      font-weight: 700;
      font-size: 13px;
      margin-right: 15px;
    }

    .section {
      margin-bottom: 50px;
    }

    .section-title {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #E5E5E5;
    }

    .port-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      padding: 15px;
      border: 1px solid #000000;
    }

    .port-row input[type="number"] {
      padding: 8px 12px;
      border: 1px solid #000000;
      font-family: 'Space Grotesk', monospace;
      font-size: 14px;
      width: 100px;
    }

    .rule-list {
      border: 1px solid #000000;
      margin-bottom: 15px;
    }

    .rule {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 15px;
      border-bottom: 1px solid #E5E5E5;
    }

    .rule:last-child {
      border-bottom: none;
    }

    .rule:hover {
      background: #F5F5F5;
    }

    .rule code {
      flex: 1;
      font-family: 'Space Grotesk', monospace;
      background: #F5F5F5;
      padding: 4px 8px;
      font-size: 13px;
      border: 1px solid #E5E5E5;
    }

    .rule-actions {
      display: flex;
      gap: 8px;
    }

    .visit-btn {
      padding: 8px 12px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .visit-btn:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .add-row {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }

    .add-row input {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid #000000;
      font-family: 'Space Grotesk', monospace;
      font-size: 14px;
    }

    button {
      padding: 10px 20px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    button:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .rule button {
      padding: 8px 12px;
      font-size: 13px;
    }

    .empty {
      padding: 12px 15px;
      color: #999;
      font-style: italic;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border: 1px solid #000000;
      text-decoration: none;
      color: #000000;
      font-weight: 700;
      margin-top: 30px;
      transition: all 0.2s;
    }

    .back-link:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .restart-page {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Space Grotesk', sans-serif;
    }

    .restart-content {
      text-align: center;
      max-width: 500px;
      padding: 40px;
    }

    .restart-icon {
      font-size: 64px;
      margin-bottom: 20px;
      color: #000000;
    }

    .restart-content h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 15px;
    }

    .restart-content p {
      font-size: 16px;
      color: #666;
      margin-bottom: 10px;
    }

    .countdown {
      font-size: 32px;
      font-weight: 700;
      color: #000000;
      margin: 20px 0;
    }

    .new-url {
      font-family: 'Space Grotesk', monospace;
      background: #F5F5F5;
      padding: 10px 15px;
      border: 1px solid #E5E5E5;
      display: inline-block;
      margin: 20px 0;
      font-size: 14px;
      word-break: break-all;
    }

    .jump-btn {
      padding: 12px 24px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .jump-btn:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-box {
      background: #FFFFFF;
      border: 2px solid #000000;
      max-width: 560px;
      width: 90%;
      padding: 30px;
    }

    .modal-box h3 {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 20px;
    }

    .modal-path-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .modal-path-row .arrow {
      font-weight: 700;
      flex: 0 0 auto;
    }

    .modal-path-row code {
      flex: 1;
      font-family: 'Space Grotesk', monospace;
      background: #F5F5F5;
      padding: 8px 10px;
      font-size: 13px;
      border: 1px solid #E5E5E5;
      word-break: break-all;
    }

    .modal-warning {
      color: #DC2626;
      font-weight: 700;
      font-size: 13px;
      margin: 15px 0;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="header-content">
        <div>
          <div class="logo">u32-local-server</div>
          <div class="tagline">配置管理</div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <a href="./" class="home-btn"><i class="fas fa-home"></i> 首页</a>
          <span id="restart-notice" class="restart-notice" style="display: none;">⚠️ 需要重启</span>
          <button id="restart-btn" class="restart-btn" onclick="restartServer()">
            <i class="fas fa-sync"></i> 重启
          </button>
        </div>
      </div>
    </header>

    <div class="section">
      <div class="section-title">服务器端口</div>
      <div class="port-row">
        <label>Port:</label>
        <input type="number" id="port" value="${config.port}">
        <button onclick="savePort()">保存</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">允许列表</div>
      <div class="rule-list">
        ${allowHtml || '<div class="empty">(空 = 拒绝所有文件访问)</div>'}
      </div>
      <div class="add-row">
        <input type="text" id="add-allow" placeholder="e.g. ~/docs or D:/data (自动规范化为绝对路径，默认读写)">
        <button onclick="addRule('allow')">添加</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">拒绝列表（优先级更高）</div>
      <div class="rule-list">
        ${denyHtml || '<div class="empty">(empty)</div>'}
      </div>
      <div class="add-row">
        <input type="text" id="add-deny" placeholder="e.g. ~/secrets or C:/Windows (自动规范化为绝对路径)">
        <button onclick="addRule('deny')">添加</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">MIME Types</div>
      <div class="rule-list">
        ${mimeHtml || '<div class="empty">(empty, using defaults)</div>'}
      </div>
      <div class="add-row">
        <input type="text" id="add-mime-ext" placeholder=".ext" style="flex: 0.3;">
        <input type="text" id="add-mime-type" placeholder="mime/type">
        <button onclick="addMime()">添加</button>
      </div>
    </div>

    <a href="./" class="back-link"><i class="fas fa-arrow-left"></i> 返回首页</a>
  </div>

  <div id="confirm-modal" class="modal-overlay" style="display:none">
    <div class="modal-box">
      <h3>确认添加路径</h3>
      <div class="modal-path-row">
        <span>输入</span><code id="modal-input"></code>
      </div>
      <div class="modal-path-row">
        <span class="arrow">→ 将添加</span><code id="modal-resolved"></code>
      </div>
      <div id="modal-warn" class="modal-warning" style="display:none">⚠️ 该路径在服务器上不存在，仍可添加（前缀规则照常生效）</div>
      <div class="modal-actions">
        <button onclick="modalCancel()">取消</button>
        <button onclick="modalConfirm()">确认添加</button>
      </div>
    </div>
  </div>

<script>
let needsRestart = false
const RENDERED_PORT = ${config.port}

// 配置页地址：直连本机（当前端口=渲染时端口）时换用新端口；经反向代理访问时保持当前地址不变
function newConfigUrl(newPort) {
  const u = new URL('./config', location.href)
  if (location.port === String(RENDERED_PORT)) u.port = String(newPort)
  return u.href
}

function showRestartNotice() {
  needsRestart = true
  document.getElementById('restart-notice').style.display = 'inline'
}

async function api(method, body) {
  const res = await fetch('./config/api', {
    method, headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  })
  if (!res.ok) { const t = await res.text(); alert(t); return null }
  return res.json()
}
function appendRuleDom(type, ruleList, pathVal) {
  const emptyMsg = ruleList.querySelector('.empty')
  if (emptyMsg) emptyMsg.remove()
  const newRule = document.createElement('div')
  newRule.className = 'rule'
  newRule.setAttribute('data-type', type)
  newRule.setAttribute('data-path', pathVal)
  const code = document.createElement('code')
  code.textContent = pathVal

  const actionsDiv = document.createElement('div')
  actionsDiv.className = 'rule-actions'

  if (type === 'allow') {
    const modeBtn = document.createElement('button')
    modeBtn.className = 'mode-btn'
    modeBtn.textContent = '读写'
    newRule.setAttribute('data-write', 'true')
    actionsDiv.appendChild(modeBtn)
    const visitBtn = document.createElement('button')
    visitBtn.className = 'visit-btn'
    visitBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> 访问'
    actionsDiv.appendChild(visitBtn)
  }

  const delBtn = document.createElement('button')
  delBtn.textContent = '删除'
  delBtn.className = 'del-btn'
  actionsDiv.appendChild(delBtn)

  newRule.appendChild(code)
  newRule.appendChild(actionsDiv)
  ruleList.appendChild(newRule)
}

async function addRule(type) {
  const input = document.getElementById('add-' + type)
  const val = input.value.trim()
  if (!val) return
  // 先让服务端规范化路径，需转换时弹窗由用户确认
  const r = await api('POST', { action: 'resolvePath', path: val })
  if (!r) return
  if (r.resolved !== val) {
    pendingAdd = { type, resolved: r.resolved, exists: r.exists }
    document.getElementById('modal-input').textContent = val
    document.getElementById('modal-resolved').textContent = r.resolved
    document.getElementById('modal-warn').style.display = r.exists ? 'none' : 'block'
    document.getElementById('confirm-modal').style.display = 'flex'
  } else {
    submitAdd(type, r.resolved)
  }
}

let pendingAdd = null

function modalCancel() {
  pendingAdd = null
  document.getElementById('confirm-modal').style.display = 'none'
}

async function modalConfirm() {
  if (!pendingAdd) return modalCancel()
  const { type, resolved } = pendingAdd
  pendingAdd = null
  document.getElementById('confirm-modal').style.display = 'none'
  await submitAdd(type, resolved)
}

async function submitAdd(type, resolvedPath) {
  const input = document.getElementById('add-' + type)
  const result = await api('POST', { action: 'add', type, path: resolvedPath })
  if (result) {
    if (result.added === false) {
      alert('该规则已存在（规范化后）：' + resolvedPath)
    } else {
      const ruleList = input.parentElement.previousElementSibling
      appendRuleDom(type, ruleList, resolvedPath)
      showRestartNotice()
    }
    input.value = ''
  }
}
// 删除按钮不携带路径参数，事件从 .rule 节点的 data-* 属性读取，避免路径拼进 JS 字符串造成注入
async function removeRule(ruleType, path, ruleEl) {
  const result = await api('POST', { action: 'remove', type: ruleType, path })
  if (result) {
    if (ruleEl) {
      ruleEl.remove()
    }
    showRestartNotice()
  }
}
// 切换允许条目的 只读/读写 模式：fs-api 按磁盘 mtime 缓存读取，立即生效无需重启
async function toggleWrite(ruleEl) {
  const p = ruleEl.dataset.path
  const writable = ruleEl.dataset.write === 'true'
  const result = await api('POST', { action: 'setAllowWrite', path: p, write: !writable })
  if (result) {
    ruleEl.dataset.write = String(!writable)
    ruleEl.querySelector('.mode-btn').textContent = !writable ? '读写' : '只读'
  }
}
async function savePort() {
  const port = parseInt(document.getElementById('port').value)
  if (!validPort(port)) { alert('端口必须是 1-65535 的整数'); return }
  await api('POST', { action: 'setPort', port })
  showRestartNotice()
}
async function restartServer() {
  const port = parseInt(document.getElementById('port').value)
  if (!validPort(port)) { alert('端口必须是 1-65535 的整数'); return }
  await api('POST', { action: 'restart', port })
  showRestartingPage(port)
}
function validPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}
function showRestartingPage(newPort) {
  const html = '<div class="restart-page">' +
    '<div class="restart-content">' +
    '<div class="restart-icon"><i class="fas fa-sync fa-spin"></i></div>' +
    '<h1>服务器正在重启...</h1>' +
    '<p>服务器将在新端口启动</p>' +
    '<div class="countdown"><span id="countdown">6</span> 秒</div>' +
    '<p class="new-url">' + newConfigUrl(newPort) + '</p>' +
    '<button class="jump-btn" onclick="jumpNow(' + newPort + ')">立即跳转</button>' +
    '</div>' +
    '</div>'
  document.body.innerHTML = html

  let seconds = 6
  const countdownEl = document.getElementById('countdown')
  const timer = setInterval(() => {
    seconds--
    countdownEl.textContent = seconds
    if (seconds <= 0) {
      clearInterval(timer)
      jumpNow(newPort)
    }
  }, 1000)
}
function jumpNow(port) {
  window.location.href = newConfigUrl(port)
}
function visitPath(path) {
  const encodedPath = encodeURIComponent(path)
  window.location.href = './file/' + encodedPath
}
async function addMime() {
  const extInput = document.getElementById('add-mime-ext')
  const mimeInput = document.getElementById('add-mime-type')
  const ext = extInput.value.trim()
  const mime = mimeInput.value.trim()
  if (!ext || !mime) return
  const result = await api('POST', { action: 'addMime', ext, mime })
  if (result) {
    const ruleList = mimeInput.parentElement.previousElementSibling
    const emptyMsg = ruleList.querySelector('.empty')
    if (emptyMsg) {
      emptyMsg.remove()
    }
    const newRule = document.createElement('div')
    newRule.className = 'rule'
    newRule.setAttribute('data-type', 'mime')
    newRule.setAttribute('data-ext', ext)
    const code1 = document.createElement('code')
    code1.textContent = ext
    const code2 = document.createElement('code')
    code2.textContent = mime
    const btn = document.createElement('button')
    btn.textContent = 'Del'
    btn.className = 'del-btn'
    newRule.appendChild(code1)
    newRule.appendChild(code2)
    newRule.appendChild(btn)
    ruleList.appendChild(newRule)
    extInput.value = ''
    mimeInput.value = ''
    showRestartNotice()
  }
}
async function removeMime(ext, ruleEl) {
  const result = await api('POST', { action: 'removeMime', ext })
  if (result) {
    if (ruleEl) {
      ruleEl.remove()
    }
    showRestartNotice()
  }
}
// 事件委托：统一处理服务端渲染与动态添加的规则按钮
document.addEventListener('click', function(e) {
  const mode = e.target.closest('.mode-btn')
  if (mode) {
    const rule = mode.closest('.rule')
    if (rule && rule.dataset.type === 'allow') toggleWrite(rule)
    return
  }
  const del = e.target.closest('.del-btn')
  if (del) {
    const rule = del.closest('.rule')
    if (!rule) return
    if (rule.dataset.type === 'mime') {
      removeMime(rule.dataset.ext, rule)
    } else {
      removeRule(rule.dataset.type, rule.dataset.path, rule)
    }
    return
  }
  const visit = e.target.closest('.visit-btn')
  if (visit) {
    const rule = visit.closest('.rule')
    if (rule && rule.dataset.path) visitPath(rule.dataset.path)
  }
})
</script>
</body></html>`
}

function handleApi(req, res) {
  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', () => {
    try {
      const data = JSON.parse(body)
      logger.debug(`[CONFIG-API] Received action: ${data.action}\n`)
      const config = loadConfig()

      if (data.action === 'resolvePath') {
        const resolved = resolvePath(String(data.path || '').trim())
        let exists = null
        try { exists = fs.existsSync(resolved) } catch (e) { exists = false }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        return res.end(JSON.stringify({ ok: true, resolved, exists }))
      } else if (data.action === 'add') {
        const arr = data.type === 'allow' ? config.file.access.allow : config.file.access.deny
        const resolved = resolvePath(String(data.path || '').trim())
        // allow 条目存为 { path, write }，默认读写；deny 保持字符串
        const toEntry = (p) => data.type === 'allow' ? { path: p, write: true } : p
        const pathOf = (e) => typeof e === 'string' ? e : e.path
        let added = false
        if (!arr.some(e => pathOf(e) === resolved)) {
          arr.push(toEntry(resolved))
          added = true
          logger.debug(`[CONFIG-API] Added ${data.type} rule: ${resolved}\n`)
        } else {
          logger.debug(`[CONFIG-API] Rule already exists: ${resolved}\n`)
        }
        saveConfig(config)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        res.end(JSON.stringify({ ok: true, added, resolved }))
      } else if (data.action === 'remove') {
        if (data.type === 'allow') {
          config.file.access.allow = config.file.access.allow.filter(p => p !== data.path)
          logger.debug(`[CONFIG-API] Removed allow rule: ${data.path}\n`)
        } else {
          config.file.access.deny = config.file.access.deny.filter(p => p !== data.path)
          logger.debug(`[CONFIG-API] Removed deny rule: ${data.path}\n`)
        }
        saveConfig(config)
        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        res.end(JSON.stringify({ ok: true }))
      } else if (data.action === 'addMime') {
        if (!config.file.mime) config.file.mime = {}
        const ext = data.ext.startsWith('.') ? data.ext : '.' + data.ext
        config.file.mime[ext] = data.mime
        logger.debug(`[CONFIG-API] Added MIME type: ${ext} -> ${data.mime}\n`)
        saveConfig(config)
        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        res.end(JSON.stringify({ ok: true }))
      } else if (data.action === 'removeMime') {
        if (config.file.mime) {
          delete config.file.mime[data.ext]
          logger.debug(`[CONFIG-API] Removed MIME type: ${data.ext}\n`)
        }
        saveConfig(config)
        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        res.end(JSON.stringify({ ok: true }))
      } else if (data.action === 'setAllowWrite') {
        // 切换允许条目的 只读/读写 模式：fs-api 每次请求按配置文件 mtime 缓存读取，改完立即生效，无需重启
        const resolved = resolvePath(String(data.path || '').trim())
        const entry = (config.file.access.allow || []).find(e => typeof e === 'object' && e.path === resolved)
        if (!entry) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          return res.end(`allow rule not found: ${data.path}`)
        }
        entry.write = data.write === true
        saveConfig(config)
        logger.debug(`[CONFIG-API] Allow rule write=${entry.write}: ${resolved}\n`)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        res.end(JSON.stringify({ ok: true, path: resolved, write: entry.write }))
      } else if (data.action === 'setPort' || data.action === 'restart') {
        // 端口校验：页面传空得到 null（NaN 序列化），手输超范围值也在此拦截，避免坏配置导致服务起不来
        const port = Number(data.port)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          logger.error(`[CONFIG-API] ERROR: invalid port: ${data.port}\n`)
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          return res.end(`invalid port: ${data.port} (must be integer 1-65535)`)
        }
        config.port = port
        logger.debug(`[CONFIG-API] Updated port: ${port}\n`)
        saveConfig(config)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        res.end(JSON.stringify({ ok: true }))
        if (data.action !== 'restart') return
        logger.debug(`[CONFIG-API] Restarting server with port: ${port}\n`)

        setTimeout(() => {
          logger.info(`[INFO] Triggering server restart...\n`)
          const { execSync } = require('child_process')
          try {
            if (process.platform === 'win32') {
              execSync('start cmd /c u32-ls restart', { stdio: 'ignore' })
            } else {
              execSync('u32-ls restart &', { stdio: 'ignore' })
            }
          } catch (err) {
            logger.error(`[ERROR] Failed to trigger restart: ${err.message}\n`)
          }
        }, 100)
      } else {
        logger.error(`[CONFIG-API] ERROR: Unknown action: ${data.action}\n`)
        res.writeHead(400, { 
          'Content-Type': 'text/plain',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        res.end('unknown action')
      }
    } catch (e) {
      logger.error(`[CONFIG-API] ERROR: ${e.message}\n`)
      res.writeHead(400, { 
        'Content-Type': 'text/plain',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'access-control-allow-headers': '*',
      })
      res.end(e.message)
    }
  })
}

function serve(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (url.pathname === '/config/api' && req.method === 'POST') {
    logger.debug(`[CONFIG-PAGE] Handling API request\n`)
    return handleApi(req, res)
  }

  logger.debug(`[CONFIG-PAGE] Serving config page\n`)
  let config
  try {
    config = loadConfig()
  } catch (err) {
    // 配置损坏时返回明确错误页，而不是让异常冒泡触发 uncaughtException 杀掉整个服务
    logger.error(`[CONFIG-PAGE] ${err.message}\n`)
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end(err.message)
  }
  res.writeHead(200, { 
    'Content-Type': 'text/html; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'access-control-allow-headers': '*',
  })
  res.end(renderPage(config))
}

module.exports = { serve }
