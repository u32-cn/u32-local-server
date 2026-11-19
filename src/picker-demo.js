// picker 演示页（/picker-demo）：以 iframe / 弹窗两种宿主方式嵌入 /picker，
// 实时展示 URL 参数拼装与 postMessage 回传结果，供宿主集成参考
const logger = require('./logger')

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

function renderPage(port) {
  const pickerBase = `http://127.0.0.1:${port}/picker`
  const snippetEsc = snippetHtml(port)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Picker 演示 - u32-local-server</title>
  <link rel="stylesheet" href="./public/css/space-grotesk.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FFFFFF; color: #000000; line-height: 1.5; font-size: 14px;
    }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 40px 20px; }
    .header { border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 24px; }
    h1 { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 5px; }
    .sub { font-size: 13px; color: #666; }
    .sub a { color: #000; font-weight: 700; text-decoration: none; border-bottom: 1px solid #000; }
    .panel { border: 1px solid #000; margin-bottom: 20px; }
    .panel-title {
      font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
      background: #F5F5F5; padding: 8px 16px; border-bottom: 1px solid #E5E5E5;
    }
    .panel-body { padding: 16px; }
    .controls { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-end; }
    .ctl { display: flex; flex-direction: column; gap: 4px; }
    .ctl label { font-size: 12px; font-weight: 700; }
    .ctl select, .ctl input[type="text"] {
      font: inherit; padding: 5px 8px; border: 1px solid #000; background: #FFF; min-width: 180px;
    }
    .chk { display: flex; align-items: center; gap: 6px; font-size: 13px; padding-bottom: 6px; }
    .chk input { width: 14px; height: 14px; accent-color: #000; }
    .embed-toggle { display: flex; gap: 0; }
    .embed-toggle button {
      font: inherit; font-size: 13px; font-weight: 700; padding: 5px 14px;
      border: 1px solid #000; background: #FFF; cursor: pointer;
    }
    .embed-toggle button + button { border-left: none; }
    .embed-toggle button.on { background: #000; color: #FFF; }
    .url-bar {
      display: flex; gap: 8px; margin-top: 14px; align-items: center;
    }
    .url-bar code {
      flex: 1; font-family: 'Space Grotesk', monospace; font-size: 12px;
      background: #F5F5F5; padding: 6px 10px; word-break: break-all; border: 1px solid #E5E5E5;
    }
    .btn {
      font: inherit; font-size: 13px; font-weight: 700; padding: 5px 14px;
      border: 1px solid #000; background: #FFF; cursor: pointer; white-space: nowrap;
    }
    .btn:hover { background: #F0F0F0; }
    .btn.primary { background: #000; color: #FFF; }
    .btn.primary:hover { background: #333; }
    .demo-split { display: grid; grid-template-columns: 1fr 380px; gap: 20px; align-items: start; }
    @media (max-width: 900px) { .demo-split { grid-template-columns: 1fr; } }
    iframe#pickerFrame {
      width: 100%; height: 560px; border: 1px solid #000; background: #F0F0F0; display: block;
    }
    .iframe-empty {
      height: 560px; border: 1px dashed #999; display: flex; align-items: center; justify-content: center;
      color: #666; font-size: 13px;
    }
    #events { display: flex; flex-direction: column; gap: 10px; max-height: 560px; overflow: auto; }
    .ev { border: 1px solid #E5E5E5; border-left: 3px solid #999; padding: 8px 10px; font-size: 12px; }
    .ev.select { border-left-color: #000; }
    .ev.cancel { border-left-color: #BBB; color: #666; }
    .ev-head { font-weight: 700; margin-bottom: 4px; display: flex; gap: 8px; align-items: center; }
    .ev-head .t { color: #999; font-weight: 400; margin-left: auto; }
    .ev pre {
      font-family: 'Space Grotesk', monospace; font-size: 11px; background: #F5F5F5;
      padding: 6px 8px; white-space: pre-wrap; word-break: break-all;
    }
    .ev a { color: #000; }
    .ev-empty { color: #666; font-size: 13px; border: 1px dashed #999; padding: 30px 16px; text-align: center; }
    pre.snippet {
      font-family: 'Space Grotesk', monospace; font-size: 12px; line-height: 1.6;
      background: #F5F5F5; padding: 14px 16px; overflow: auto; white-space: pre;
    }
    .hint { font-size: 12px; color: #666; margin-top: 8px; }
    .hint code { background: #F5F5F5; padding: 0 4px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>Picker 演示</h1>
      <div class="sub">Win10 对话框风格文件选择器 · 宿主集成演示 · 参考文档 <a href="./docs/picker.md">/docs/picker.md</a></div>
    </div>

    <div class="panel">
      <div class="panel-title">参数</div>
      <div class="panel-body">
        <div class="controls">
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
          <label class="chk"><input type="checkbox" id="chrome" checked> chrome=1（显示标题栏；iframe 嵌入可去掉）</label>
          <div class="ctl">
            <label>嵌入方式</label>
            <div class="embed-toggle">
              <button id="embIframe" class="on">iframe</button>
              <button id="embPopup">弹窗</button>
            </div>
          </div>
        </div>
        <div class="url-bar">
          <code id="urlPreview"></code>
          <a class="btn" id="openRaw" href="#" target="_blank">独立打开</a>
        </div>
        <div class="hint" id="embedHint"></div>
      </div>
    </div>

    <div class="demo-split">
      <div class="panel">
        <div class="panel-title">宿主区（iframe / 弹窗入口）</div>
        <div class="panel-body">
          <div id="hostArea"></div>
          <div style="margin-top: 12px;"><button class="btn primary" id="openPopup">弹窗打开 picker</button></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">postMessage 回传结果</div>
        <div class="panel-body">
          <div id="events"><div class="ev-empty">等待 picker 回传…<br><br>在左侧选择文件/文件夹，或取消</div></div>
          <div class="hint">事件名必须匹配 <code>source === 'u32-picker'</code>；<code>url</code> 可点击验证 /file/ 直链。</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">宿主集成最小代码</div>
      <div class="panel-body">
        <pre class="snippet">${snippetEsc}</pre>
        <div class="hint">save-file 模式仅回传目标路径与 <code>overwrite</code> 标记，不落盘；写入由宿主调用 <code>POST /api/fs</code> 完成，详见 <a href="./docs/fs-api.md">/docs/fs-api.md</a>。</div>
      </div>
    </div>
  </div>

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
  logger.debug('[PICKER-DEMO] Serving picker demo page\n')
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(renderPage(port))
}

module.exports = { serve, renderPage }
