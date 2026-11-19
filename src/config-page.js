const { loadConfig, saveConfig, resolvePath } = require('./config')
const logger = require('./logger')
const fs = require('fs')
const { escapeHtml } = require('./utils')
const PACKAGE_JSON = require('../package.json')

function renderPage(config) {
  // 存储值即 resolvePath 后的绝对路径，直接展示，不做 ~ 反向转换
  const display = config
  const version = PACKAGE_JSON.version
  const allowCount = display.file.access.allow.length
  const denyCount = display.file.access.deny.length
  const mimeEntries = Object.entries(display.file.mime || {}).sort((a, b) => a[0].localeCompare(b[0]))
  const mimeCount = mimeEntries.length

  const allowHtml = display.file.access.allow.map(e => {
    const p = typeof e === 'string' ? e : e.path
    const writable = typeof e === 'string' ? true : e.write !== false
    return `<div class="rule" data-type="allow" data-path="${escapeHtml(p)}" data-write="${writable}"><code>${escapeHtml(p)}</code><div class="rule-actions"><button class="mode-btn" type="button">${writable ? '读写' : '只读'}</button><button class="visit-btn" type="button">访问</button><button class="del-btn" type="button">删除</button></div></div>`
  }).join('')
  const denyHtml = display.file.access.deny.map(p =>
    `<div class="rule" data-type="deny" data-path="${escapeHtml(p)}"><code>${escapeHtml(p)}</code><div class="rule-actions"><button class="del-btn" type="button">删除</button></div></div>`
  ).join('')
  const mimeHtml = mimeEntries.map(([ext, type]) =>
    `<div class="rule" data-type="mime" data-ext="${escapeHtml(ext)}"><code>${escapeHtml(ext)}</code><code>${escapeHtml(type)}</code><div class="rule-actions"><button class="del-btn" type="button">删除</button></div></div>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>配置 - u32-local-server</title>
  <link rel="icon" type="image/svg+xml" href="./public/favicon.svg">
  <link rel="stylesheet" href="./public/css/base.css">
  <style>
    /* 顶栏与内容左对齐：config 页内容窄于全局 .wrap，覆盖成同一栅格 */
    .topbar .wrap { max-width: 940px; }
    .page { max-width: 940px; margin: 0 auto; padding: 28px 28px 20px; }

    .section { margin-bottom: 26px; }
    .section-title { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 13px; font-weight: 500; color: var(--dim); }
    .section-title .cnt { font-size: 12px; font-weight: 400; color: var(--faint); }
    .hint { margin-top: 8px; font-size: 12px; color: var(--faint); }

    .port-row {
      display: flex; align-items: center; gap: 10px; padding: 14px 16px;
      background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
    }
    .port-row label { font-size: 12.5px; color: var(--dim); }
    .port-row input[type="number"] { width: 110px; }

    .rule-list { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
    .rule-list.scroll { max-height: 400px; overflow-y: auto; }
    .rule { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #F2F2F5; }
    .rule:last-child { border-bottom: none; }
    .rule:hover { background: #FAFAFC; }
    .rule code {
      flex: 1; min-width: 0; font-family: var(--mono); font-size: 12.5px; color: var(--ink);
      overflow-wrap: anywhere;
    }
    /* MIME 行：扩展名列定宽，类型列吃掉剩余空间，避免两列各占一半把扩展名拉得很散 */
    .rule[data-type="mime"] code:first-child { flex: 0 0 120px; }
    .rule-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .rule-actions button {
      font-family: inherit; font-size: 11.5px; font-weight: 500; color: var(--dim);
      background: #fff; border: 1px solid var(--line-hi); border-radius: 7px; padding: 3px 9px; cursor: pointer;
      transition: background .12s, border-color .12s, color .12s;
    }
    .rule-actions button:hover { border-color: var(--blue); color: var(--blue); background: var(--blue-soft); }
    .rule-actions .del-btn:hover { border-color: var(--red); color: var(--red); background: var(--red-soft); }
    .empty { padding: 14px 16px; font-size: 12.5px; color: var(--faint); }

    .add-row { display: flex; gap: 8px; margin-top: 10px; }
    .add-row input[type="text"] { flex: 1; min-width: 0; }
    .add-row input.ext { flex: 0 0 110px; }

    .restart-notice { font-size: 12.5px; font-weight: 500; color: var(--amber); background: var(--amber-soft); border-radius: var(--radius-pill); padding: 2px 10px; margin-right: 4px; }

    .foot-line {
      max-width: 940px; margin: 0 auto; padding: 18px 28px 40px;
      border-top: 1px solid var(--line);
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      font-size: 12px; color: var(--faint);
    }
    .foot-line .links { margin-left: auto; display: flex; gap: 16px; }
    .foot-line a:hover { color: var(--blue); }

    .modal-overlay {
      position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
      background: rgba(17, 17, 20, .42); padding: 20px;
    }
    .modal-box { width: 100%; max-width: 560px; padding: 24px; background: #fff; border-radius: 16px; box-shadow: 0 12px 40px rgba(17, 17, 20, .18); }
    .modal-box h3 { margin: 0 0 16px; font-size: 15px; font-weight: 500; }
    .modal-path-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 12.5px; color: var(--dim); }
    .modal-path-row .arrow { flex: 0 0 auto; }
    .modal-path-row code {
      flex: 1; min-width: 0; padding: 8px 10px; word-break: break-all;
      font-family: var(--mono); font-size: 12px; background: #FAFAFC; border: 1px solid var(--line); border-radius: 8px;
    }
    .modal-warning { margin: 12px 0; padding: 8px 12px; font-size: 12.5px; color: var(--amber); background: var(--amber-soft); border-radius: 8px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

    .restart-page { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center; background: var(--bg); }
    .restart-content { max-width: 460px; padding: 32px; text-align: center; }
    .restart-content h1 { margin: 0 0 8px; font-size: 19px; font-weight: 500; }
    .restart-content p { margin: 0 0 6px; font-size: 13px; color: var(--dim); }
    .countdown { margin: 18px 0; font-size: 30px; font-weight: 500; font-variant-numeric: tabular-nums; }
    .new-url {
      display: block; margin: 16px 0; padding: 10px 14px; word-break: break-all;
      font-family: var(--mono); font-size: 12.5px; color: var(--dim);
      background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-sm);
    }

    @media (max-width: 700px) {
      .page { padding: 20px 16px; }
      .rule { flex-wrap: wrap; }
      .rule code { flex: 1 0 100%; }
      .add-row { flex-wrap: wrap; }
      .add-row input[type="text"] { flex: 1 0 100%; }
      .foot-line { padding: 18px 16px 32px; }
    }
  </style>
</head>
<body>

<header class="topbar">
  <div class="wrap topbar-in">
    <div class="brand"><span class="dot ok"></span>u32-local-server<span class="ver">v${version}</span></div>
    <nav class="nav">
      <a href="./">首页</a>
      <a href="./status">状态</a>
      <a class="active" href="./config">配置</a>
      <span class="sep"></span>
      <a href="https://u32-local-server.u32.cn/" target="_blank" rel="noopener">文档 ↗</a>
    </nav>
    <div style="display:flex;align-items:center;gap:8px">
      <span id="restart-notice" class="restart-notice" style="display:none">需要重启</span>
      <button id="restart-btn" class="btn btn-primary" type="button" onclick="restartServer()">重启服务</button>
    </div>
  </div>
</header>

<main class="page">
  <div class="section">
    <div class="section-title">服务器端口</div>
    <div class="port-row">
      <label for="port">端口</label>
      <input type="number" id="port" value="${config.port}" min="1" max="65535">
      <button class="btn" type="button" onclick="savePort()">保存</button>
    </div>
    <div class="hint">修改后需重启服务才生效；重启会中断当前所有连接。</div>
  </div>

  <div class="section">
    <div class="section-title">允许列表 <span class="cnt">${allowCount} 条</span></div>
    <div class="rule-list">
      ${allowHtml || '<div class="empty">空 = 拒绝所有文件访问</div>'}
    </div>
    <div class="add-row">
      <input type="text" id="add-allow" placeholder="例如 ~/docs 或 D:/data（自动规范化为绝对路径，默认读写）">
      <button class="btn" type="button" onclick="addRule('allow')">添加</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">拒绝列表 <span class="cnt">${denyCount} 条 · 优先级高于允许列表</span></div>
    <div class="rule-list">
      ${denyHtml || '<div class="empty">空</div>'}
    </div>
    <div class="add-row">
      <input type="text" id="add-deny" placeholder="例如 ~/secrets 或 C:/Windows（自动规范化为绝对路径）">
      <button class="btn" type="button" onclick="addRule('deny')">添加</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">MIME 类型 <span class="cnt">${mimeCount} 条 · 覆盖内置默认值</span></div>
    <div class="rule-list scroll">
      ${mimeHtml || '<div class="empty">空，使用内置默认值</div>'}
    </div>
    <div class="add-row">
      <input type="text" id="add-mime-ext" class="ext" placeholder=".ext">
      <input type="text" id="add-mime-type" placeholder="mime/type">
      <button class="btn" type="button" onclick="addMime()">添加</button>
    </div>
  </div>
</main>

<div class="foot-line">
  <span>u32-local-server v${version} · MIT</span>
  <div class="links"><a href="./">首页</a><a href="./status">状态</a><a href="./llms.txt">llms.txt</a></div>
</div>

<div id="confirm-modal" class="modal-overlay" style="display:none">
  <div class="modal-box">
    <h3>确认添加路径</h3>
    <div class="modal-path-row">
      <span>输入</span><code id="modal-input"></code>
    </div>
    <div class="modal-path-row">
      <span class="arrow">将添加</span><code id="modal-resolved"></code>
    </div>
    <div id="modal-warn" class="modal-warning" style="display:none">该路径在服务器上不存在，仍可添加（前缀规则照常生效）</div>
    <div class="modal-actions">
      <button class="btn" type="button" onclick="modalCancel()">取消</button>
      <button class="btn btn-primary" type="button" onclick="modalConfirm()">确认添加</button>
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
    modeBtn.type = 'button'
    modeBtn.textContent = '读写'
    newRule.setAttribute('data-write', 'true')
    actionsDiv.appendChild(modeBtn)
    const visitBtn = document.createElement('button')
    visitBtn.className = 'visit-btn'
    visitBtn.type = 'button'
    visitBtn.textContent = '访问'
    actionsDiv.appendChild(visitBtn)
  }

  const delBtn = document.createElement('button')
  delBtn.textContent = '删除'
  delBtn.type = 'button'
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
    '<h1>服务器正在重启</h1>' +
    '<p>服务将在新端口启动</p>' +
    '<div class="countdown"><span id="countdown">6</span> 秒</div>' +
    '<p class="new-url">' + newConfigUrl(newPort) + '</p>' +
    '<button class="btn btn-primary" type="button" onclick="jumpNow(' + newPort + ')">立即跳转</button>' +
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
    const actions = document.createElement('div')
    actions.className = 'rule-actions'
    const btn = document.createElement('button')
    btn.textContent = '删除'
    btn.type = 'button'
    btn.className = 'del-btn'
    actions.appendChild(btn)
    newRule.appendChild(code1)
    newRule.appendChild(code2)
    newRule.appendChild(actions)
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
