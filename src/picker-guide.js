// /picker-guide 引导页：文件选择器的三种模式配置脚本与在线试用
// 信息架构：顶栏 → 标题简介 → 三张模式卡片（说明 + 接入代码 + 试用按钮 + 回传结果）
// 设计约束：与首页/状态页同一视觉（base.css token、topbar、--card/--line），SSR 一次渲染无闪烁
// 协议来源：/picker 回传 postMessage { source:'u32-picker', action, mode, selection, ... }，弹窗选完自关

const logger = require('./logger')

// 三种模式卡片定义：URL 参数与回传协议严格对应 src/picker/page.js 与 docs/readme/picker.md
const CARDS = [
  {
    mode: 'open-file',
    title: '打开文件',
    desc: '选定一个或多个文件后回传路径与 /file/ 直链，适合「让用户挑一张图 / 一份文档」的场景。',
    params: '?mode=open-file&type=png,jpg,webp',
    winSize: [720, 520],
    code: [
      "// 1) 弹窗打开选择器",
      "var win = window.open(",
      "  'http://127.0.0.1:19527/picker?mode=open-file&type=png,jpg,webp',",
      "  'u32-picker', 'width=720,height=520')",
      "",
      "// 2) 监听回传（弹窗选完会 postMessage 给 opener 并自关）",
      "window.addEventListener('message', function (ev) {",
      "  if (ev.data && ev.data.source === 'u32-picker') {",
      "    console.log(ev.data.action, ev.data.selection)",
      "    // selection: [{ name, type, path, url }]",
      "  }",
      "})",
    ].join('\n'),
  },
  {
    mode: 'open-dir',
    title: '选择目录',
    desc: '只允许选文件夹（文件灰显），可配合 allowEmpty=1 允许空选，适合「选一个工作目录」的场景。',
    params: '?mode=open-dir',
    winSize: [720, 520],
    code: [
      "// 1) 弹窗打开选择器（目录模式）",
      "var win = window.open(",
      "  'http://127.0.0.1:19527/picker?mode=open-dir',",
      "  'u32-picker', 'width=720,height=520')",
      "",
      "// 2) 监听回传",
      "window.addEventListener('message', function (ev) {",
      "  if (ev.data && ev.data.source === 'u32-picker') {",
      "    console.log(ev.data.selection[0] && ev.data.selection[0].path)",
      "  }",
      "})",
    ].join('\n'),
  },
  {
    mode: 'save-file',
    title: '另存为',
    desc: '输入文件名并确认（同名会询问替换），回传 overwrite 标记但不落盘——实际写入由宿主调 /api/fs 完成。',
    params: '?mode=save-file',
    winSize: [720, 480],
    code: [
      "// 1) 弹窗打开选择器（另存为模式）",
      "var win = window.open(",
      "  'http://127.0.0.1:19527/picker?mode=save-file',",
      "  'u32-picker', 'width=720,height=480')",
      "",
      "// 2) 监听回传；overwrite=true 表示用户确认替换同名文件",
      "window.addEventListener('message', function (ev) {",
      "  if (ev.data && ev.data.source === 'u32-picker') {",
      "    if (ev.data.action === 'select') {",
      "      console.log(ev.data.overwrite, ev.data.selection[0].path)",
      "    }",
      "  }",
      "})",
    ].join('\n'),
  },
]

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderCards() {
  return CARDS.map((c, i) => (
    '<div class="card mode-card" data-mode="' + c.mode + '">' +
      '<div class="card-head">' +
        '<span class="no">' + (i + 1) + '</span>' +
        '<div class="card-title">' +
          '<h2>' + escapeHtml(c.title) + '</h2>' +
          '<code class="mode-tag">mode=' + c.mode + '</code>' +
        '</div>' +
        '<button class="btn btn-primary try" type="button" data-mode="' + c.mode + '" data-params="' + escapeHtml(c.params) + '" data-w="' + c.winSize[0] + '" data-h="' + c.winSize[1] + '">试用</button>' +
      '</div>' +
      '<p class="desc">' + escapeHtml(c.desc) + '</p>' +
      '<pre class="code"><code>' + escapeHtml(c.code) + '</code></pre>' +
      '<div class="result" data-result hidden><div class="result-h">回传结果</div><pre class="code"><code></code></pre></div>' +
    '</div>'
  )).join('')
}

function renderPage(config) {
  const version = require('../package.json').version
  const addr = '127.0.0.1:' + config.port
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>文件选择器 · 引导</title>
<link rel="icon" type="image/svg+xml" href="./public/favicon.svg">
<link rel="stylesheet" href="./public/css/base.css">
<style>
  .intro { margin: 0 0 18px; font-size: 13.5px; line-height: 1.7; color: var(--dim); }
  .intro a { color: var(--blue); }
  .mode-card { margin-bottom: 14px; }
  .card-head { display: flex; align-items: center; gap: 12px; }
  .card-head .no {
    width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px; background: var(--blue-soft);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 12px; color: var(--blue);
  }
  .card-title { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
  .card-title h2 { margin: 0; font-size: 15px; font-weight: 500; }
  .mode-tag { font-family: var(--mono); font-size: 11.5px; color: var(--faint); background: #F4F4F7; border-radius: 6px; padding: 2px 8px; }
  .try { flex-shrink: 0; }
  .desc { margin: 10px 0 12px; font-size: 12.5px; line-height: 1.6; color: var(--dim); }
  .code {
    margin: 0; padding: 14px 16px; background: #FAFAFC; border: 1px solid var(--line);
    border-radius: var(--radius-sm); overflow-x: auto;
    font-family: var(--mono); font-size: 12px; line-height: 1.7; color: #2C2C33;
  }
  .result { margin-top: 12px; }
  .result-h { margin-bottom: 6px; font-size: 12px; font-weight: 500; color: var(--green); }
  .result .code { border-color: var(--green-soft); }
</style>
</head>
<body>

<header class="topbar">
  <div class="wrap topbar-in">
    <div class="brand"><span class="dot ok"></span>u32-local-server<span class="ver">v${version}</span></div>
    <span class="addr">${addr}</span>
    <nav class="nav">
      <a href="./">首页</a>
      <a href="./status">状态</a>
      <a href="./config">配置</a>
      <span class="sep"></span>
      <a href="./picker">选择器</a>
      <a href="./picker-demo">演示</a>
    </nav>
  </div>
</header>

<main class="main wrap" data-u32-name="picker-guide">
  <h1>文件选择器</h1>
  <p class="intro">Win10 对话框风格的网页文件选择器，可嵌 iframe 或弹窗打开，选中结果经 <code>postMessage</code> 回传。本页展示三种典型接入配置脚本，点「试用」可立即体验完整协议；参数细节见 <a href="./docs/readme/picker.md" target="_blank" rel="noopener">picker 文档</a>。</p>

  ${renderCards()}
</main>

<footer class="pagefoot">
  <div class="wrap in">
    <span>u32-local-server v${version} · MIT</span>
    <span>/picker-guide</span>
  </div>
</footer>

<script>
(function () {
  window.addEventListener('message', function (ev) {
    var d = ev.data
    if (!d || d.source !== 'u32-picker') return
    var card = document.querySelector('.mode-card[data-mode="' + d.mode + '"]')
    if (!card) return
    var box = card.querySelector('[data-result]')
    box.hidden = false
    box.querySelector('code').textContent = JSON.stringify(d, null, 2)
  })
  document.querySelectorAll('button.try').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var w = parseInt(btn.getAttribute('data-w'), 10) || 720
      var h = parseInt(btn.getAttribute('data-h'), 10) || 520
      window.open('./picker' + btn.getAttribute('data-params'), 'u32-picker', 'width=' + w + ',height=' + h)
    })
  })
})()
</script>
</body>
</html>`
}

function serve(req, res, config) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('Method Not Allowed')
  }
  logger.debug('[PICKER-GUIDE] Serving picker guide page\n')
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'access-control-allow-origin': '*',
  })
  res.end(renderPage(config))
}

module.exports = { serve, renderPage }
