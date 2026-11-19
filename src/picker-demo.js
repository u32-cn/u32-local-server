// picker 演示页（/picker-demo）：以 iframe / 弹窗两种宿主方式嵌入 /picker，
// 实时展示 URL 参数拼装与 postMessage 回传结果，供宿主集成参考
// 视觉基准与首页 / 状态 / 配置 / 浏览器桥一致：public/css/base.css
const logger = require('./logger')
const PACKAGE_JSON = require('../package.json')

const GITHUB_URL = 'https://github.com/u32-cn/u32-local-server'

// 最小宿主集成示例（展示在页面底部的代码块，与页面自身逻辑一致）
function snippetHtml(port) {
  const SNIPPET = `// 宿主集成示例：监听 picker 的 postMessage 回传
window.addEventListener('message', (ev) => {
  const m = ev.data
  if (!m || m.source !== 'u32-picker') return
  if (m.action === 'select') {
    console.log(m.mode, m.selection[0].path)  // 服务器端 POSIX 绝对路径
    if (m.overwrite) { /* save-file 同名替换：宿主自行调 /api/fs 写入 */ }
  }
  // action === 'cancel'：用户取消（弹窗宿主无需处理，窗口已自关）
})

// iframe 嵌入
const iframe = document.createElement('iframe')
iframe.src = 'http://127.0.0.1:${port}/picker?mode=open-file'
document.body.appendChild(iframe)

// 或弹窗嵌入（回传后 picker 自动关闭）
window.open('http://127.0.0.1:${port}/picker?mode=open-file')`
  return SNIPPET.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

function renderPage(port, addr) {
  const version = PACKAGE_JSON.version
  const pickerBase = `http://127.0.0.1:${port}/picker`
  const snippetEsc = snippetHtml(port)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文件选择器演示 - u32-local-server</title>
  <link rel="icon" type="image/svg+xml" href="./public/favicon.svg">
  <link rel="stylesheet" href="./public/css/base.css">
  <style>
    .ctl-row { display: flex; gap: 18px; flex-wrap: wrap; align-items: flex-end; padding: 16px 18px; }
    .ctl { display: flex; flex-direction: column; gap: 6px; }
    .ctl label { font-size: 12px; color: var(--dim); }
    .ctl select, .ctl input[type="text"] { min-width: 190px; }
    .chk { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--dim); padding-bottom: 8px; }
    .chk input { width: 14px; height: 14px; accent-color: var(--blue); }

    .seg { display: inline-flex; border: 1px solid var(--line-hi); border-radius: 8px; overflow: hidden; }
    .seg button { font-family: inherit; font-size: 12.5px; padding: 5px 14px; border: 0; background: #fff; color: var(--dim); cursor: pointer; }
    .seg button + button { border-left: 1px solid var(--line-hi); }
    .seg button.on { background: var(--blue); color: #fff; }

    .url-row { display: flex; gap: 8px; align-items: center; padding: 0 18px 16px; }
    .url-row code { flex: 1; font-family: var(--mono); font-size: 12px; background: #F7F7F9; border: 1px solid var(--line); border-radius: 8px; padding: 7px 11px; word-break: break-all; color: var(--dim); }
    .hint { padding: 0 18px 16px; font-size: 12px; color: var(--faint); line-height: 1.7; }
    .hint code { font-family: var(--mono); font-size: 11.5px; background: #F4F4F7; border-radius: 4px; padding: 1px 5px; }
    .hint a { color: var(--blue); }

    .split { display: grid; grid-template-columns: 1fr 380px; gap: 12px; align-items: start; }
    @media (max-width: 980px) { .split { grid-template-columns: 1fr; } }
    .body { padding: 16px 18px; }
    iframe#pickerFrame { width: 100%; height: 560px; border: 1px solid var(--line); border-radius: 8px; background: #F0F0F0; display: block; }
    .iframe-empty { height: 560px; border: 1px dashed var(--line-hi); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--faint); font-size: 12.5px; }

    #events { display: flex; flex-direction: column; gap: 8px; max-height: 500px; overflow: auto; }
    .ev { border: 1px solid var(--line); border-left: 2px solid var(--line-hi); border-radius: 8px; padding: 9px 11px; font-size: 12px; background: #fff; }
    .ev.select { border-left-color: var(--blue); }
    .ev.cancel { border-left-color: var(--faint); color: var(--dim); }
    .ev-head { display: flex; gap: 8px; align-items: center; font-weight: 500; margin-bottom: 5px; }
    .ev-head .t { margin-left: auto; color: var(--faint); font-weight: 400; }
    .ev pre { font-family: var(--mono); font-size: 11px; background: #F7F7F9; border-radius: 6px; padding: 7px 9px; margin: 0; white-space: pre-wrap; word-break: break-all; color: var(--dim); }
    .ev a { display: inline-block; margin-top: 6px; color: var(--blue); font-size: 11.5px; }
    .ev-empty { color: var(--faint); font-size: 12.5px; border: 1px dashed var(--line-hi); border-radius: 8px; padding: 34px 16px; text-align: center; line-height: 1.9; }

    pre.snippet { font-family: var(--mono); font-size: 12px; line-height: 1.7; background: #F7F7F9; border-radius: 8px; padding: 14px 16px; margin: 0; overflow: auto; color: #243044; }
    .foot-note { padding: 12px 18px 16px; font-size: 12px; color: var(--faint); line-height: 1.7; }
    .foot-note code { font-family: var(--mono); font-size: 11.5px; background: #F4F4F7; border-radius: 4px; padding: 1px 5px; }
    .foot-note a { color: var(--blue); }
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
      <a href="./config">配置</a>
      <span class="sep"></span>
      <a href="./docs" target="_blank" rel="noopener">内网文档 ↗</a>
      <a href="https://u32-local-server.u32.cn/" target="_blank" rel="noopener">公网文档 ↗</a>
    </nav>
  </div>
</header>

<main class="main wrap">
  <div class="h">参数<span class="right">Win10 对话框风格 · 宿主集成演示 · <a href="./docs/picker.md" target="_blank" rel="noopener" style="color:var(--blue)">picker 文档</a></span></div>
  <div class="card">
    <div class="ctl-row">
      <div class="ctl">
        <label for="mode">mode 模式</label>
        <select id="mode">
          <option value="open-file">open-file — 打开文件</option>
          <option value="open-dir">open-dir — 选择文件夹</option>
          <option value="save-file">save-file — 另存为</option>
        </select>
      </div>
      <div class="ctl">
        <label for="type">type 类型过滤</label>
        <input type="text" id="type" placeholder="如 *.jpg; *.png（留空不过滤）" size="30">
      </div>
      <label class="chk"><input type="checkbox" id="allowEmpty"> allowEmpty=1（open-file 文件名留空＝选当前文件夹）</label>
      <label class="chk"><input type="checkbox" id="chrome" checked> chrome=1（显示标题栏）</label>
      <div class="ctl">
        <label>嵌入方式</label>
        <div class="seg">
          <button id="embIframe" class="on">iframe</button>
          <button id="embPopup">弹窗</button>
        </div>
      </div>
    </div>
    <div class="url-row">
      <code id="urlPreview"></code>
      <a class="btn" id="openRaw" href="#" target="_blank" rel="noopener">独立打开</a>
    </div>
    <div class="hint" id="embedHint"></div>
  </div>

  <div class="split">
    <div class="card">
      <div class="card-head">宿主区<span class="right">iframe / 弹窗入口</span></div>
      <div class="body">
        <div id="hostArea"></div>
        <div style="margin-top: 12px;"><button class="btn btn-primary" id="openPopup">弹窗打开 picker</button></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head">回传结果<span class="right">postMessage</span></div>
      <div class="body">
        <div id="events"><div class="ev-empty">等待 picker 回传…<br>在左侧选择文件/文件夹，或取消</div></div>
      </div>
      <div class="hint">事件名必须匹配 <code>source === 'u32-picker'</code>；<code>url</code> 可点击验证 /file/ 直链。</div>
    </div>
  </div>

  <div class="h">宿主集成最小代码<span class="right">copy 即用</span></div>
  <div class="card">
    <div class="body" style="padding:14px 18px"><pre class="snippet">${snippetEsc}</pre></div>
    <div class="foot-note">save-file 模式仅回传目标路径与 <code>overwrite</code> 标记，不落盘；写入由宿主调用 <code>POST /api/fs</code> 完成，详见 <a href="./docs/fs-api.md" target="_blank" rel="noopener">fs-api 文档</a>。</div>
  </div>
</main>

<footer class="pagefoot">
  <div class="wrap in">
    <span>u32-local-server v${version} · MIT</span>
    <div class="links">
      <a href="./docs" target="_blank" rel="noopener">内网文档站</a>
      <a href="https://u32-local-server.u32.cn/" target="_blank" rel="noopener">公网文档站</a>
      <a href="./llms.txt" target="_blank" rel="noopener">llms.txt</a>
      <a href="${GITHUB_URL}" target="_blank" rel="noopener">GitHub</a>
    </div>
  </div>
</footer>

<script>
const PICKER_BASE = ${JSON.stringify(pickerBase)}
let embed = 'iframe'

const els = {
  mode: document.getElementById('mode'),
  type: document.getElementById('type'),
  allowEmpty: document.getElementById('allowEmpty'),
  chrome: document.getElementById('chrome'),
  urlPreview: document.getElementById('urlPreview'),
  openRaw: document.getElementById('openRaw'),
  hostArea: document.getElementById('hostArea'),
  openPopup: document.getElementById('openPopup'),
  embIframe: document.getElementById('embIframe'),
  embPopup: document.getElementById('embPopup'),
  embedHint: document.getElementById('embedHint'),
  events: document.getElementById('events'),
}

function buildPickerUrl() {
  const p = new URLSearchParams()
  p.set('mode', els.mode.value)
  if (els.type.value.trim()) p.set('type', els.type.value.trim())
  if (els.allowEmpty.checked) p.set('allowEmpty', '1')
  if (!els.chrome.checked) p.set('chrome', '0')
  return PICKER_BASE + '?' + p.toString()
}

let frame = null
function renderHost() {
  const url = buildPickerUrl()
  els.embIframe.classList.toggle('on', embed === 'iframe')
  els.embPopup.classList.toggle('on', embed === 'popup')
  els.embedHint.innerHTML = embed === 'iframe'
    ? 'iframe 宿主：picker 经 <code>parent.postMessage</code> 回传本页。'
    : '弹窗宿主：点击下方按钮 <code>window.open</code> 打开，picker 回传 <code>opener</code> 后自动关闭。'
  if (embed === 'iframe') {
    els.hostArea.innerHTML = '<iframe id="pickerFrame" src="' + url + '"></iframe>'
  } else {
    els.hostArea.innerHTML = '<div class="iframe-empty">iframe 已隐藏 — 使用下方按钮以弹窗方式打开</div>'
  }
}

function refreshUrl() {
  const url = buildPickerUrl()
  els.urlPreview.textContent = url
  els.openRaw.href = url
  if (embed === 'iframe') {
    const f = document.getElementById('pickerFrame')
    if (f) f.src = url
  }
}

els.mode.addEventListener('change', refreshUrl)
els.type.addEventListener('input', refreshUrl)
els.allowEmpty.addEventListener('change', refreshUrl)
els.chrome.addEventListener('change', refreshUrl)
els.openPopup.addEventListener('click', () => window.open(buildPickerUrl(), 'u32-picker-demo', 'width=820,height=620'))
els.embIframe.addEventListener('click', () => { embed = 'iframe'; renderHost(); refreshUrl() })
els.embPopup.addEventListener('click', () => { embed = 'popup'; renderHost(); refreshUrl() })

window.addEventListener('message', (ev) => {
  const m = ev.data
  if (!m || m.source !== 'u32-picker') return
  const empty = els.events.querySelector('.ev-empty')
  if (empty) empty.remove()
  const div = document.createElement('div')
  div.className = 'ev ' + m.action
  const time = new Date().toLocaleTimeString()
  let head = '<span>' + m.action + '</span><span>mode=' + m.mode + '</span>'
  if (m.overwrite !== undefined) head += '<span>overwrite=' + m.overwrite + '</span>'
  head += '<span class="t">' + time + '</span>'
  let body = '<pre>' + JSON.stringify(m, null, 2).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>'
  if (m.action === 'select' && m.selection && m.selection[0] && m.selection[0].url) {
    body += '<a href="' + m.selection[0].url + '" target="_blank">打开 /file/ 直链：' + m.selection[0].path + '</a>'
  }
  div.innerHTML = head + body
  els.events.prepend(div)
})

renderHost()
refreshUrl()
</script>
</body>
</html>`
}

function serve(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('Method Not Allowed')
  }
  const port = req.socket.localPort
  const addr = (req.headers && req.headers.host) || ''
  logger.debug('[PICKER-DEMO] Serving picker demo page\n')
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(renderPage(port, addr))
}

module.exports = { serve, renderPage }
