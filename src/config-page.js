const { loadConfig, saveConfig } = require('./config')
const logger = require('./logger')
const { escapeHtml } = require('./utils')
const PACKAGE_JSON = require('../package.json')

// 访问规则：新增只能经 /access-dialog 弹窗（用户点「允许」）；删除（收紧权限）可在本页直接操作。
const ACCESS_WRITE_GUIDE = '禁止直接编辑配置文件或调用写配置的 HTTP 接口。新增访问规则必须打开 /access-dialog 授权对话框（或执行 u32-ls access），由用户点「允许」后才会写入；删除允许规则可在本页直接操作。'

function renderPage(config, addr) {
  // 存储值即 resolvePath 后的绝对路径，直接展示，不做 ~ 反向转换
  const display = config
  const version = PACKAGE_JSON.version
  const allowCount = display.file.access.allow.length
  const mimeEntries = Object.entries(display.file.mime || {}).sort((a, b) => a[0].localeCompare(b[0]))
  const mimeCount = mimeEntries.length

  const allowHtml = display.file.access.allow.map(e => {
    const p = typeof e === 'string' ? e : e.path
    const writable = typeof e === 'string' ? true : e.write !== false
    return `<div class="rule" data-type="allow" data-path="${escapeHtml(p)}"><code>${escapeHtml(p)}</code><div class="rule-actions"><span class="mode-label">${writable ? '读写' : '只读'}</span><button class="visit-btn" type="button">访问</button><button class="del-btn allow-del" type="button">删除</button></div></div>`
  }).join('')
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
    .page { max-width: 1140px; margin: 0 auto; padding: 28px 28px 20px; }

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
    .mode-label { font-size: 11.5px; font-weight: 500; color: var(--dim); padding: 3px 9px; border-radius: 7px; background: #F1F1F5; }
    .access-notice { margin: 10px 0 0; padding: 10px 14px; font-size: 12.5px; color: var(--amber); background: var(--amber-soft); border-radius: var(--radius); }
    .empty { padding: 14px 16px; font-size: 12.5px; color: var(--faint); }

    .add-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
    .add-row .guide-link { font-size: 12px; color: var(--dim); }
    .add-row .guide-link:hover { color: var(--blue); }
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
    <span class="addr">${addr || ''}</span>
    <nav class="nav">
      <a href="./">首页</a>
      <a href="./status">状态</a>
      <a class="active" href="./config">配置</a>
      <span class="sep"></span>
      <a href="./docs" target="_blank" rel="noopener">内网文档 ↗</a>
      <a href="https://u32-local-server.u32.cn/" target="_blank" rel="noopener">公网文档 ↗</a>
    </nav>
    <div style="display:flex;align-items:center;gap:8px">
      <span id="restart-notice" class="restart-notice" style="display:none">需要重启</span>
      <button id="stop-btn" class="btn btn-danger" type="button" onclick="stopServer()">停止服务</button>
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
    <div class="section-title">允许列表 <span class="cnt" id="allow-count">${allowCount} 条 · 可删除，新增走弹窗</span></div>
    <div class="rule-list" id="allow-list">
      ${allowHtml || '<div class="empty">空 = 拒绝所有文件访问</div>'}
    </div>
    <div class="add-row"><button class="btn btn-primary" type="button" onclick="addDirectory()">添加目录</button><a class="guide-link" href="./access-guide">接入指引 ↗</a></div>
    <div class="access-notice">点「添加目录」弹出授权对话框，由用户选目录并确认；删除本页直接操作、即时生效。${escapeHtml(ACCESS_WRITE_GUIDE)}</div>
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

<footer class="pagefoot">
  <div class="wrap in">
    <span>u32-local-server v${version} · MIT</span>
    <div class="links">
      <a href="./docs" target="_blank" rel="noopener">内网文档站</a>
      <a href="https://u32-local-server.u32.cn/" target="_blank" rel="noopener">公网文档站</a>
      <a href="./llms.txt" target="_blank" rel="noopener">llms.txt</a>
      <a href="https://github.com/u32-cn/u32-local-server" target="_blank" rel="noopener">GitHub</a>
    </div>
  </div>
</footer>

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
// 弹出授权对话框（主服务 /access-dialog）：用户选目录并点「允许」后写入 allow；
// 弹窗屏幕居中；关闭后自动刷新页面同步允许列表（/config 页本身不提供新增入口）
function addDirectory() {
  const w = 560, h = 480
  const x = Math.max(0, (screen.width - w) / 2 + (screen.availLeft || 0))
  const y = Math.max(0, (screen.availHeight - h) / 2 + (screen.availTop || 0))
  const win = window.open('./access-dialog', 'u32-access-dialog', 'width=' + w + ',height=' + h + ',left=' + x + ',top=' + y)
  if (win) win.focus()
  const timer = setInterval(() => {
    if (win.closed) {
      clearInterval(timer)
      location.reload()
    }
  }, 500)
}
// 删除允许规则＝收紧权限，直接删、即时生效，无需用户弹窗授权
async function removeAllow(p, ruleEl) {
  const result = await api('POST', { action: 'removeAllow', path: p })
  if (result && ruleEl) {
    ruleEl.remove()
    const list = ruleEl.parentElement
    if (!list.querySelector('.rule')) list.innerHTML = '<div class="empty">空 = 拒绝所有文件访问</div>'
    const cnt = document.getElementById('allow-count')
    if (cnt) cnt.textContent = document.querySelectorAll('#allow-list .rule').length + ' 条 · 可删除，新增走弹窗'
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
async function stopServer() {
  if (!confirm('确定停止服务吗？停止后本页面将无法访问，可通过托盘图标、开始菜单快捷方式或终端 u32-ls start 重新启动。')) return
  const result = await api('POST', { action: 'stop' })
  if (result) showStoppedPage()
}
function showStoppedPage() {
  document.body.innerHTML = '<div class="restart-page">' +
    '<div class="restart-content">' +
    '<h1>服务已停止</h1>' +
    '<p>本页面由服务提供，服务停止后已无法访问。</p>' +
    '<p>重新启动方式：托盘图标菜单、开始菜单快捷方式，或终端执行 <code>u32-ls start</code></p>' +
    '</div>' +
    '</div>'
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
// 事件委托：允许列表删除（收紧权限，直接删）+ MIME 删除 + 允许列表「访问」；删除前 confirm 防误删
document.addEventListener('click', function(e) {
  const del = e.target.closest('.del-btn')
  if (del) {
    const rule = del.closest('.rule')
    if (!rule) return
    if (rule.dataset.type === 'allow') {
      const label = (rule.querySelector('code') || {}).textContent || rule.dataset.path
      if (!confirm('确定删除允许目录「' + label + '」吗？删除后该目录（含子目录）将立即无法访问。')) return
      removeAllow(rule.dataset.path, rule)
    }
    else if (rule.dataset.type === 'mime') {
      if (!confirm('确定删除 MIME 映射「' + rule.dataset.ext + '」吗？')) return
      removeMime(rule.dataset.ext, rule)
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

      // 访问规则写入口已迁移到 /access-dialog 弹窗；这里一律拒绝并给出引导（含给 AI 的禁令）
      if (['add', 'remove', 'setAllowWrite', 'resolvePath'].includes(data.action)) {
        logger.error(`[CONFIG-API] Rejected access-rule write action: ${data.action}\n`)
        res.writeHead(410, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end(`410 Gone: 新增访问规则请打开 /access-dialog 弹窗；删除请用 removeAllow。${ACCESS_WRITE_GUIDE}`)
      }

      const config = loadConfig()

      // 删除允许列表条目＝收紧权限，无需弹窗授权，直接删
      if (data.action === 'removeAllow') {
        const p = require('./config').resolvePath(String(data.path || '').trim())
        config.file.access.allow = (config.file.access.allow || []).filter(e =>
          (typeof e === 'string' ? e : e.path) !== p
        )
        saveConfig(config)
        logger.debug(`[CONFIG-API] Removed allow rule: ${p}\n`)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        return res.end(JSON.stringify({ ok: true, path: p }))
      }

      if (data.action === 'addMime') {
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
          triggerDaemonCmd('restart')
        }, 100)
      } else if (data.action === 'stop') {
        // 停止服务：先应答前端，再自我终止（页面由本服务提供，停止后页面即失效）
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': '*',
        })
        res.end(JSON.stringify({ ok: true }))
        setTimeout(() => {
          logger.info(`[INFO] Triggering server stop...\n`)
          triggerDaemonCmd('stop')
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

// 触发 daemon 命令（restart/stop）：用绝对路径构造命令行，不经 PATH 查找。
// spawn 自身运行时（node 直跑用 process.argv[1] 脚本绝对路径；SEA 用 exe + 命令参数）。
// Windows 必须经 `start` 间接层：中间 cmd 立即退出，真实 daemon 进程父链断裂，
// 否则 daemon taskkill /T 杀服务进程树时会把自己（服务进程的孩子）一并杀掉。
// detached + unref：本服务进程被 daemon kill 后子命令仍能存活。
function triggerDaemonCmd(cmd) {
  const { spawn } = require('child_process')
  const { IS_SEA } = require('./sea-assets')
  try {
    // SEA 模式：argv = [exe, cmd, ...]；node 直跑：argv = [node, 脚本绝对路径, cmd]
    const target = IS_SEA
      ? `"${process.execPath}" ${cmd}`
      : `"${process.execPath}" "${process.argv[1]}" ${cmd}`
    let child
    if (process.platform === 'win32') {
      child = spawn('cmd.exe', ['/d', '/s', '/c', `start "" ${target}`], {
        detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true
      })
    } else {
      // 非 Windows：daemon 用 SIGTERM kill 单进程，无进程树问题，直接 spawn
      const args = IS_SEA ? [cmd] : [process.argv[1], cmd]
      child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' })
    }
    child.on('error', (err) => {
      logger.error(`[ERROR] Failed to trigger ${cmd}: ${err.message}\n`)
    })
    child.unref()
  } catch (err) {
    logger.error(`[ERROR] Failed to trigger ${cmd}: ${err.message}\n`)
  }
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
  res.end(renderPage(config, (req.headers && req.headers.host) || ''))
}

module.exports = { serve }
