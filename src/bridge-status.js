// 浏览器桥状态页（/bridge）：只读观察页，轮询 /bridge/api/pages 与 /apps 展示在线 App 与实例
// 视觉基准与首页 / 状态 / 配置一致：public/css/base.css 的顶栏、卡片、按钮、标签
const logger = require('./logger')
const { escapeHtml } = require('./utils')
const PACKAGE_JSON = require('../package.json')

const ONLINE_THRESHOLD_MS = 60000 // 与 bridge.js 惰性下线阈值一致
const DOCS_URL = 'https://u32-local-server.u32.cn/'
const GITHUB_URL = 'https://github.com/u32-cn/u32-local-server'

function renderPage(addr) {
  const version = PACKAGE_JSON.version
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>浏览器桥 - u32-local-server</title>
  <link rel="icon" type="image/svg+xml" href="./public/favicon.svg">
  <link rel="stylesheet" href="./public/css/base.css">
  <style>
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .metric { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; }
    .metric .lab { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dim); }
    .metric .lab .d { width: 6px; height: 6px; border-radius: 50%; background: var(--line-hi); }
    .metric .lab .d.ok { background: var(--green); }
    .metric .val { margin-top: 6px; font-size: 25px; font-weight: 500; letter-spacing: -.02em; line-height: 1.15; font-variant-numeric: tabular-nums; }
    .metric .val small { margin-left: 4px; font-size: 12px; font-weight: 400; letter-spacing: 0; color: var(--faint); }

    .app { margin-bottom: 12px; overflow: hidden; }
    .app-head { display: flex; align-items: center; gap: 9px; padding: 13px 18px; cursor: pointer; user-select: none; font-size: 13px; }
    .app-head:hover { background: #FAFAFB; }
    .app-head .arw { color: var(--faint); font-size: 10px; transition: transform .15s; }
    .app.open .app-head .arw { transform: rotate(90deg); }
    .app-head .nm { font-weight: 500; }
    .app-head .cnt { margin-left: auto; }
    .help { display: none; margin: 0 18px 12px; padding: 10px 12px; background: #FAFAFB; border-left: 2px solid var(--line-hi); border-radius: 0 8px 8px 0; font-size: 12px; color: var(--dim); line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
    .app.open .help { display: block; }

    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th, td { padding: 9px 18px; text-align: left; border-top: 1px solid var(--line); vertical-align: middle; }
    th { font-size: 11.5px; font-weight: 500; color: var(--faint); background: #FAFAFB; }
    tbody tr:hover { background: #FAFAFB; }
    td code { font-family: var(--mono); font-size: 11.5px; background: #F4F4F7; border-radius: 4px; padding: 1px 5px; word-break: break-all; }
    td code.id { cursor: pointer; }
    td code.id:hover { background: var(--blue-soft); color: var(--blue); }
    td a { color: var(--blue); }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot.on { background: var(--green); }
    .dot.warn { background: var(--amber); }
    .dot.off { background: var(--line-hi); }

    .empty { padding: 40px 20px; text-align: center; color: var(--dim); font-size: 13px; line-height: 1.9; }
    .empty code { font-family: var(--mono); font-size: 11.5px; background: #F4F4F7; border-radius: 4px; padding: 1px 5px; }
    .empty a { color: var(--blue); }

    .copy-tip { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: var(--ink); color: #fff; font-size: 12.5px; padding: 8px 14px; border-radius: 8px; opacity: 0; transition: opacity .2s; pointer-events: none; }
    .copy-tip.show { opacity: 1; }

    @media (max-width: 900px) { .metrics { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 620px) { .metrics { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<header class="topbar">
  <div class="wrap topbar-in">
    <div class="brand"><span class="dot ok" id="live-dot"></span>u32-local-server<span class="ver">v${version}</span></div>
    <span class="addr">${escapeHtml(addr || '')}</span>
    <nav class="nav">
      <a href="./">首页</a>
      <a href="./status">状态</a>
      <a href="./config">配置</a>
      <span class="sep"></span>
      <a href="${DOCS_URL}" target="_blank" rel="noopener">文档 ↗</a>
    </nav>
  </div>
</header>

<main class="main wrap">
  <div class="metrics">
    <div class="metric">
      <div class="lab"><span class="d" id="d-app"></span>在线 App</div>
      <div class="val" id="m-app">–<small>个</small></div>
    </div>
    <div class="metric">
      <div class="lab"><span class="d" id="d-inst"></span>在线实例</div>
      <div class="val" id="m-inst">–<small>个</small></div>
    </div>
    <div class="metric">
      <div class="lab"><span class="d" id="d-pend"></span>积压消息</div>
      <div class="val" id="m-pend">–<small>条</small></div>
    </div>
  </div>

  <div class="h">在线实例<span class="right">每 3s 自动刷新 · <span id="last-update">-</span> · <a href="./docs/bridge.md" target="_blank" rel="noopener" style="color:var(--blue)">bridge 文档</a></span></div>
  <div id="content"><div class="card empty">加载中…</div></div>
</main>

<footer class="pagefoot">
  <div class="wrap in">
    <span>u32-local-server v${version} · MIT</span>
    <div class="links">
      <a href="${DOCS_URL}" target="_blank" rel="noopener">文档站</a>
      <a href="./llms.txt" target="_blank" rel="noopener">llms.txt</a>
      <a href="${GITHUB_URL}" target="_blank" rel="noopener">GitHub</a>
    </div>
  </div>
</footer>

<div class="copy-tip" id="copy-tip">已复制</div>

<script>
const ONLINE_MS = ${ONLINE_THRESHOLD_MS}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

function ago(ts) {
  if (!ts) return '-'
  const d = Date.now() - ts
  if (d < 1000) return '刚刚'
  if (d < 60000) return Math.floor(d / 1000) + 's 前'
  if (d < 3600000) return Math.floor(d / 60000) + 'm 前'
  return Math.floor(d / 3600000) + 'h 前'
}

function dotClass(ts) { return Date.now() - ts < ONLINE_MS ? 'on' : 'warn' }

function setMetric(id, val, on) {
  document.getElementById('m-' + id).innerHTML = val + '<small>' + ({ app: '个', inst: '个', pend: '条' }[id]) + '</small>'
  document.getElementById('d-' + id).className = 'd' + (on ? ' ok' : '')
}

async function refresh() {
  let pages = [], apps = []
  try {
    const [rp, ra] = await Promise.all([
      fetch('./bridge/api/pages'), fetch('./bridge/api/apps')
    ])
    pages = await rp.json(); apps = await ra.json()
  } catch (e) {
    document.getElementById('live-dot').className = 'dot off'
    document.getElementById('content').innerHTML = '<div class="card empty">无法连接服务器</div>'
    return
  }
  document.getElementById('live-dot').className = 'dot ok'
  const totalPending = pages.reduce((s, p) => s + (p.pendingMessages || 0), 0)
  setMetric('app', apps.length, apps.length > 0)
  setMetric('inst', pages.length, pages.length > 0)
  setMetric('pend', totalPending, totalPending > 0)
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString()

  const el = document.getElementById('content')
  if (!pages.length) {
    el.innerHTML = '<div class="card empty">暂无页面连接<br>页面侧引入 <code>/public/bridge-client.js</code> 并调用 <code>U32Bridge.connect({ appId, help, onMessage })</code> 接入，详见 <a href="./docs/bridge.md">bridge 文档</a></div>'
    return
  }
  const byApp = {}
  for (const p of pages) (byApp[p.appId] = byApp[p.appId] || []).push(p)
  const appHelp = {}
  for (const a of apps) appHelp[a.appId] = a.help
  let html = ''
  for (const appId of Object.keys(byApp).sort()) {
    const list = byApp[appId]
    const help = esc(appHelp[appId] || '')
    const rows = list.map(p => {
      const urlCell = p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.url) + '</a>' : '-'
      const pend = p.pendingMessages ? ' <span class="tag tag-no">' + p.pendingMessages + ' 待下发</span>' : ''
      return '<tr>' +
        '<td><code>' + esc(p.appInstanceId.slice(0, 2)) + '</code></td>' +
        '<td><code class="id" data-copy="' + esc(p.appInstanceId) + '" title="点击复制完整 ID">' + esc(p.appInstanceId) + '</code>' + pend + '</td>' +
        '<td>' + esc(p.title || '-') + '</td>' +
        '<td>' + urlCell + '</td>' +
        '<td><span class="dot ' + dotClass(p.lastSeen) + '"></span></td>' +
        '<td>' + ago(p.connectedAt) + '</td>' +
        '<td>' + ago(p.lastSeen) + '</td>' +
      '</tr>'
    }).join('')
    html += '<div class="card app open">' +
      '<div class="app-head">' +
        '<span class="arw">▶</span>' +
        '<span class="nm">' + esc(appId) + '</span>' +
        '<span class="cnt tag tag-yes">' + list.length + ' 实例</span>' +
      '</div>' +
      '<div class="help">help: ' + (help || '-') + '</div>' +
      '<table><thead><tr><th>ID短码</th><th>实例 ID</th><th>标题</th><th>URL</th><th>在线</th><th>连接于</th><th>心跳</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
    '</div>'
  }
  el.innerHTML = html
}
refresh()
setInterval(refresh, 3000)
// App 头点击折叠/展开（事件委托，避免内联 onclick 的引号嵌套）
document.getElementById('content').addEventListener('click', function (e) {
  const head = e.target.closest('.app-head')
  if (head) { head.parentNode.classList.toggle('open'); return }
  const idEl = e.target.closest('code.id')
  if (idEl && navigator.clipboard) {
    navigator.clipboard.writeText(idEl.getAttribute('data-copy')).then(function () {
      const tip = document.getElementById('copy-tip')
      tip.textContent = '已复制 ' + idEl.getAttribute('data-copy')
      tip.classList.add('show')
      clearTimeout(tip._t)
      tip._t = setTimeout(function () { tip.classList.remove('show') }, 1500)
    })
  }
})
</script>
</body>
</html>`
}

function serve(req, res) {
  logger.debug('[BRIDGE-STATUS] Serving bridge status page\n')
  const addr = (req && req.headers && req.headers.host) || ''
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(renderPage(addr))
}

module.exports = { serve, renderPage }
