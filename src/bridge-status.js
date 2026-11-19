// 浏览器桥状态页（/bridge）：只读观察页，轮询 /bridge/api/pages 与 /apps 展示在线 App 与实例
const logger = require('./logger')
const { escapeHtml } = require('./utils')

const ONLINE_THRESHOLD_MS = 60000 // 与 bridge.js 惰性下线阈值一致

function renderPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>浏览器桥状态 - u32-local-server</title>
  <link rel="stylesheet" href="./public/css/space-grotesk.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FFFFFF;
      color: #000000;
      line-height: 1.5;
      font-size: 14px;
    }
    .wrap { max-width: 1000px; margin: 0 auto; padding: 40px 20px; }
    .header { border-bottom: 2px solid #000000; padding-bottom: 20px; margin-bottom: 40px; }
    h1 { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 5px; }
    .sub { font-size: 13px; color: #666; font-weight: 400; }
    .sub a { color: #000000; font-weight: 700; text-decoration: none; border-bottom: 1px solid #000000; }
    .status-bar {
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      border: 1px solid #000000; background: #FFFFFF; padding: 12px 16px; margin-bottom: 30px;
      font-weight: 700;
    }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot.on { background: #000000; }
    .dot.off { background: #DDD; }
    .dot.warn { background: #888; }
    .refresh-note { margin-left: auto; font-size: 12px; color: #666; font-weight: 400; }
    .section-title {
      font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
      margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #E5E5E5;
    }
    .app {
      border: 1px solid #000000; background: #FFFFFF; margin-bottom: 14px;
    }
    .app-head {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 12px 16px; cursor: pointer; user-select: none;
    }
    .app-head:hover { background: #F5F5F5; }
    .arrow { color: #666; font-size: 12px; transition: transform 0.15s; }
    .app.open .arrow { transform: rotate(90deg); }
    .app-name { font-weight: 700; }
    .badge {
      font-size: 12px; background: #FFFFFF; border: 1px solid #000000;
      padding: 1px 8px; font-weight: 700; color: #000000;
    }
    .help-box {
      display: none; margin: 0 16px 12px; padding: 10px 12px;
      background: #F5F5F5; border-left: 3px solid #000000;
      font-size: 12px; color: #333; white-space: pre-wrap; word-break: break-all;
    }
    .app.open .help-box { display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 16px; text-align: left; border-top: 1px solid #E5E5E5; }
    th { font-size: 12px; color: #666; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border-top: none; background: #F5F5F5; }
    td code {
      font-family: 'Space Grotesk', monospace; font-size: 12px;
      background: #F5F5F5; padding: 1px 5px; word-break: break-all;
    }
    td code.id { cursor: pointer; border-bottom: 1px dashed #999; }
    td code.id:hover { background: #000000; color: #FFFFFF; }
    td a { color: #000000; }
    .empty {
      border: 1px dashed #999; background: #FFFFFF; padding: 40px 20px;
      text-align: center; color: #666;
    }
    .empty code { background: #F5F5F5; padding: 1px 5px; }
    .copy-tip {
      position: fixed; left: 50%; bottom: 30px; transform: translateX(-50%);
      background: #000000; color: #FFFFFF; font-size: 13px; font-weight: 700;
      padding: 8px 16px; opacity: 0; transition: opacity 0.2s; pointer-events: none;
    }
    .copy-tip.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>浏览器桥状态</h1>
    <div class="sub">AI 与浏览器页面间的消息桥 · 只读观察页 · ID短码 = 实例 ID 前 2 字符（不区分大小写），多实例时用它指定操作对象 · 参考文档 <a href="./docs/bridge.md">/docs/bridge.md</a></div>
    <div class="status-bar">
      <span class="stat" id="stat">加载中…</span>
      <span class="refresh-note">每 3s 自动刷新 · <span id="last-update">-</span></span>
    </div>
    <div class="section-title">在线实例</div>
    <div id="content"><div class="empty">加载中…</div></div>
  </div>
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

async function refresh() {
  let pages = [], apps = []
  try {
    const [rp, ra] = await Promise.all([
      fetch('./bridge/api/pages'), fetch('./bridge/api/apps')
    ])
    pages = await rp.json(); apps = await ra.json()
  } catch (e) {
    document.getElementById('stat').innerHTML = '<span class="dot off"></span> 无法连接服务器'
    return
  }
  const totalPending = pages.reduce((s, p) => s + (p.pendingMessages || 0), 0)
  document.getElementById('stat').innerHTML =
    '<span class="dot ' + (pages.length ? 'on' : 'off') + '"></span> ' +
    apps.length + ' 个 App · ' + pages.length + ' 个在线实例 · ' + totalPending + ' 条积压消息'
  document.getElementById('last-update').textContent = new Date().toLocaleTimeString()

  const el = document.getElementById('content')
  if (!pages.length) {
    el.innerHTML = '<div class="empty">暂无页面连接<br><br>页面侧引入 <code>/public/bridge-client.js</code> 并调用 <code>U32Bridge.connect({ appId, help, onMessage })</code> 接入，详见 <a href="./docs/bridge.md">bridge 文档</a></div>'
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
      const url = p.url ? esc(p.url) : '-'
      const urlCell = p.url ? '<a href="' + esc(p.url) + '" target="_blank">' + url + '</a>' : '-'
      const pend = p.pendingMessages ? ' <span class="badge">' + p.pendingMessages + ' 待下发</span>' : ''
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
    html += '<div class="app open">' +
      '<div class="app-head">' +
        '<span class="arrow">▶</span>' +
        '<span class="app-name">' + esc(appId) + '</span>' +
        '<span class="badge">' + list.length + ' 实例</span>' +
      '</div>' +
      '<div class="help-box">help: ' + (help || '-') + '</div>' +
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
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(renderPage())
}

module.exports = { serve, renderPage }
