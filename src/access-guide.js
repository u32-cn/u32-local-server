// /access-guide 引导页：/access-dialog 授权对话框的接入配置与在线试用
// 信息架构与视觉同 /picker-guide：顶栏 → 标题简介 → 接入方式卡片（说明 + 代码 + 试用按钮 + 结果）
// 试用直接弹窗打开 /access-dialog（token 服务端签发，本页不接触），授权完成后轮询允许列表展示 diff

const logger = require('./logger')

const CARDS = [
  {
    key: 'dialog',
    title: '授权对话框',
    desc: '用户选目录、点「允许」即写入允许列表（只读/读写可选），即时生效。安全模型：token 只内嵌对话框页面、单次有效；禁外站 iframe，只能弹窗/直接打开。',
    code: [
      "// 弹窗打开授权对话框（推荐：独立窗口带地址栏，用户可见 127.0.0.1）",
      "var win = window.open('http://127.0.0.1:19527/access-dialog', 'u32-access-dialog', 'width=800,height=720')",
      "",
      "// 可选：预填待授权目录（路径不存在时对话框自动回退到最近存在的上级）",
      "window.open('http://127.0.0.1:19527/access-dialog?path=' + encodeURIComponent('D:/data'), 'u32-access-dialog', 'width=800,height=720')",
      "",
      "// 授权完成无事件回传；宿主可轮询 /api/summary 的 allowCount 或 /config/api 感知变化",
    ].join('\n'),
  },
  {
    key: 'cli',
    title: '终端命令（薄壳）',
    desc: 'u32-ls access [path] 与弹窗打开完全等价：仅用浏览器打开对话框，不再起任何临时服务。适合 AI 引导用户执行。',
    code: [
      "# 预填目录",
      "u32-ls access D:/data",
      "",
      "# 不带路径：对话框显示「未选择」，用户点「浏览文件夹…」自选",
      "u32-ls access",
    ].join('\n'),
  },
  {
    key: 'link',
    title: '外部宿主给链接',
    desc: '外部页面（AI 客户端等）只需给用户一个链接。URL 只允许 path 参数，不得拼接任何 token——token 由对话框页面加载时服务端签发。',
    code: [
      "<a href=\"http://127.0.0.1:19527/access-dialog?path=D%3A%2Fdata\" target=\"_blank\">授权访问 D:/data</a>",
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
    '<div class="card mode-card" data-key="' + c.key + '">' +
      '<div class="card-head">' +
        '<span class="no">' + (i + 1) + '</span>' +
        '<div class="card-title"><h2>' + escapeHtml(c.title) + '</h2></div>' +
        (c.key === 'dialog' ? '<button class="btn btn-primary try" type="button">试用</button>' : '') +
      '</div>' +
      '<div class="card-body">' +
        '<p class="desc">' + escapeHtml(c.desc) + '</p>' +
        '<pre class="code"><code>' + escapeHtml(c.code) + '</code></pre>' +
        '<div class="result" data-result hidden><div class="result-h">授权后的允许列表（与打开前对比）</div><pre class="code"><code></code></pre></div>' +
      '</div>' +
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
<title>访问规则授权 · 引导</title>
<link rel="icon" type="image/svg+xml" href="./public/favicon.svg">
<link rel="stylesheet" href="./public/css/base.css">
<style>
  .main h1 { margin: 0 0 10px; font-size: 19px; font-weight: 500; letter-spacing: -.01em; }
  .intro { margin: 0 0 18px; font-size: 13.5px; line-height: 1.7; color: var(--dim); }
  .intro a { color: var(--blue); }
  .mode-card { margin-bottom: 14px; }
  .card-head { padding: 14px 18px; }
  .card-head .no {
    width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px; background: var(--blue-soft);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 12px; color: var(--blue);
  }
  .card-title { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
  .card-title h2 { margin: 0; font-size: 15px; font-weight: 500; }
  .try { flex-shrink: 0; }
  .card-body { padding: 0 18px 16px; }
  .desc { margin: 12px 0; font-size: 12.5px; line-height: 1.6; color: var(--dim); }
  .code {
    margin: 0; padding: 14px 16px; background: #FAFAFC; border: 1px solid var(--line);
    border-radius: var(--radius-sm); overflow-x: auto;
    font-family: var(--mono); font-size: 12px; line-height: 1.7; color: #2C2C33;
  }
  .result { margin-top: 12px; }
  .result-h { margin-bottom: 6px; font-size: 12px; font-weight: 500; color: var(--green); }
  .result .code { border-color: var(--green-soft); white-space: pre-wrap; }

  .notice { margin: 0 0 18px; padding: 10px 14px; font-size: 12.5px; color: var(--amber); background: var(--amber-soft); border-radius: var(--radius); }
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
      <a href="./docs" target="_blank" rel="noopener">内网文档 ↗</a>
      <a href="https://u32-local-server.u32.cn/" target="_blank" rel="noopener">公网文档 ↗</a>
    </nav>
  </div>
</header>

<main class="main wrap" data-u32-name="access-guide">
  <h1>访问规则授权</h1>
  <p class="intro">授权对话框 <code>/access-dialog</code> 是新增允许目录的唯一写入口：用户选目录、点「允许」即写入，即时生效。删除允许目录在 <a href="./config">/config 页</a>直接操作。机制细节见 <a href="./docs/readme/access.md" target="_blank" rel="noopener">access 文档</a>。</p>
  <div class="notice">AI 行为约束：禁止直接编辑配置文件、禁止直接调用 /access-dialog/api/grant（无页面内 token 必 403）。需要新增授权时只能引导用户打开本对话框。</div>

  ${renderCards()}
</main>

<footer class="pagefoot">
  <div class="wrap in">
    <span>u32-local-server v${version} · MIT</span>
    <span>/access-guide</span>
  </div>
</footer>

<script>
(function () {
  var opened = false
  var before = null

  function fetchAllowCount() {
    return fetch('./api/summary').then(function (r) { return r.json() }).then(function (d) {
      return d.allowCount
    })
  }

  function showResult(text) {
    var box = document.querySelector('[data-result]')
    if (!box) return
    box.hidden = false
    box.querySelector('code').textContent = text
  }

  function poll(count0) {
    var tries = 0
    var timer = setInterval(function () {
      tries++
      fetchAllowCount().then(function (n) {
        if (n !== count0 || tries > 120) {
          clearInterval(timer)
          showResult('允许列表条数：' + count0 + ' → ' + n + '\\n明细见 /config 页允许列表（或重新打开本页再次试用对比）。')
        }
      }).catch(function () {})
    }, 1000)
  }

  // 居中弹窗：按屏幕计算左上角坐标（双屏下以当前窗口所在屏为基准）
  function openCentered(url, name) {
    var w = 800, h = 720
    var s = window.screen
    var x = Math.max(0, (s.width - w) / 2 + (s.availLeft || 0))
    var y = Math.max(0, (s.availHeight - h) / 2 + (s.availTop || 0))
    window.open(url, name, 'width=' + w + ',height=' + h + ',left=' + x + ',top=' + y)
  }

  document.querySelectorAll('button.try').forEach(function (btn) {
    btn.addEventListener('click', function () {
      fetchAllowCount().then(function (n) {
        poll(n)
        openCentered('./access-dialog', 'u32-access-dialog')
      })
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
  logger.debug('[ACCESS-GUIDE] Serving access guide page\n')
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(renderPage(config))
}

module.exports = { serve, renderPage }
