// 首页：启动服务后打开的第一个页面
// 信息架构固定为四层：顶栏 → 状态带 → 六宫格入口 → 运维行 →（折叠）AI 指令 / 常用命令
// 设计约束：
//   - 首屏一屏装完，不放产品介绍类文案（介绍归文档站 https://u32-local-server.u32.cn/）
//   - 首屏 SSR 渲染真实数据，不闪白；之后前端每 5s 拉 /api/summary 定点替换
//   - 只展示计数与布尔，路径/主机名等敏感信息一律不出现在页面上

const logger = require('./logger')
const PACKAGE_JSON = require('../package.json')
const { fmtDuration, fmtBytes } = require('./fmt')
const summary = require('./summary')

const DOCS_URL = 'https://u32-local-server.u32.cn/'
const GITHUB_URL = 'https://github.com/u32-cn/u32-local-server'

// 六个功能入口：顺序即视觉顺序，路径保持相对写法以兼容反向代理子路径
const ENTRIES = [
  {
    name: '文件访问', rel: './file/', desc: '浏览允许列表内的目录与文件，支持目录列表与直链下载',
    icon: '<path d="M3 7h5l2 2h11v10H3z"/>',
  },
  {
    name: '文件选择器', rel: './picker', desc: 'Win10 风格对话框，可嵌 iframe，支持打开 / 选目录 / 另存为',
    icon: '<path d="M5 3l14 8-6 1 3 6-3 1-3-6-4 4z"/>',
  },
  {
    name: 'CORS 代理', rel: './proxy/', desc: '绕过跨域限制，转发任意 HTTP/HTTPS 请求',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.5 3 3.5 15 0 18M12 3c-3.5 3-3.5 15 0 18"/>',
  },
  {
    name: '浏览器桥', rel: './bridge', desc: 'AI 与页面间的长轮询消息通道，可查看在线实例与指令',
    icon: '<path d="M9 3v6M15 3v6M6 9h12v3a6 6 0 0 1-12 0z"/><path d="M12 18v3"/>',
  },
  {
    name: '运行状态', rel: './status', desc: '进程、内存、请求指标与最近请求明细',
    icon: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  },
  {
    name: '配置', rel: './config', desc: '端口、允许 / 拒绝列表、MIME 类型覆盖',
    icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>',
  },
]

const AI_PROMPTS = [
  '先读 llms.txt，然后用浏览器桥控制页面',
  '先读 llms.txt，然后读取本地文件内容',
  '先读 llms.txt，然后用 CORS 代理抓取网页内容',
  '先读 llms.txt，然后用文件写入 API 创建文件',
  '先读 llms.txt，然后用文件选择器让我选择本地文件或文件夹',
  '先读 llms.txt，然后告诉我这个服务能做什么',
]

const COMMANDS = [
  ['u32-ls start', '后台启动'],
  ['u32-ls stop', '停止服务'],
  ['u32-ls status', '查看运行状态'],
  ['u32-ls open', '浏览器打开首页'],
]

function renderEntries() {
  return ENTRIES.map((e) => (
    '<div class="tile">' +
      '<a class="tile-hit" href="' + e.rel + '" aria-label="打开' + e.name + '"></a>' +
      '<div class="tile-top">' +
        '<span class="ic-box"><svg viewBox="0 0 24 24">' + e.icon + '</svg></span>' +
        '<span class="name">' + e.name + '</span>' +
      '</div>' +
      '<div class="path">' + e.rel + '</div>' +
      '<div class="desc">' + e.desc + '</div>' +
      '<button class="copy" type="button" data-rel="' + e.rel + '">复制</button>' +
    '</div>'
  )).join('')
}

function renderPrompts() {
  return AI_PROMPTS.map((p, i) => (
    '<div class="pr"><span class="i">' + (i + 1) + '</span>' +
    '<span class="t">' + p + '</span>' +
    '<button type="button" data-copy="' + p.replace(/"/g, '&quot;') + '">复制</button></div>'
  )).join('')
}

function renderCommands() {
  return COMMANDS.map(([cmd, desc]) => (
    '<div class="cm"><code>' + cmd + '</code><span>' + desc + '</span></div>'
  )).join('')
}

function renderPage(config, snap) {
  const version = PACKAGE_JSON.version
  const addr = '127.0.0.1:' + config.port
  const svc = snap.services
  const autoTag = svc.autostart
    ? '<span class="tag tag-yes" data-svc="autostart">已注册</span>'
    : '<span class="tag tag-no" data-svc="autostart">未注册</span>'
  const menuTag = svc.contextMenu
    ? '<span class="tag tag-yes" data-svc="menu">已注册</span>'
    : '<span class="tag tag-no" data-svc="menu">未注册</span>'

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>u32-local-server</title>
<link rel="icon" type="image/svg+xml" href="./public/favicon.svg">
<link rel="stylesheet" href="./public/css/base.css">
<style>
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .metric { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; }
  .metric .lab { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dim); }
  .metric .lab .d { width: 6px; height: 6px; border-radius: 50%; background: var(--line-hi); }
  .metric .lab .d.ok { background: var(--green); }
  .metric .val { margin-top: 6px; font-size: 25px; font-weight: 500; letter-spacing: -.02em; line-height: 1.15; font-variant-numeric: tabular-nums; }
  .metric .val small { margin-left: 4px; font-size: 12px; font-weight: 400; letter-spacing: 0; color: var(--faint); }

  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .tile {
    position: relative; display: flex; flex-direction: column; gap: 4px; min-height: 126px;
    padding: 18px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
    transition: border-color .15s, box-shadow .15s, transform .15s;
  }
  .tile:hover { border-color: #C9D6F5; box-shadow: 0 2px 10px rgba(37, 99, 235, .07); transform: translateY(-1px); }
  .tile-hit { position: absolute; inset: 0; border-radius: inherit; }
  .tile-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .ic-box { width: 32px; height: 32px; border-radius: 9px; background: var(--blue-soft); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ic-box svg { width: 16px; height: 16px; stroke: var(--blue); fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .name { font-size: 14px; font-weight: 500; }
  .path { margin-left: 42px; font-family: var(--mono); font-size: 11.5px; color: var(--faint); }
  .desc { margin-top: auto; font-size: 12.5px; line-height: 1.5; color: var(--dim); }
  .copy {
    position: absolute; top: 16px; right: 14px; z-index: 2; opacity: 0;
    font-family: inherit; font-size: 11px; color: var(--dim); background: #F4F4F7;
    border: none; border-radius: 6px; padding: 3px 8px; cursor: pointer; transition: opacity .15s, background .15s, color .15s;
  }
  .tile:hover .copy { opacity: 1; }
  .copy:hover { background: var(--blue); color: #fff; }
  .copy.done { background: var(--green-soft); color: var(--green); opacity: 1; }

  .ops { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .op { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; }
  .op-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 13.5px; font-weight: 500; }
  .op-head svg { width: 16px; height: 16px; stroke: var(--dim); fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12.5px; color: var(--dim); }
  .row .k { min-width: 76px; color: var(--faint); }
  .btns { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }

  details { margin-top: 12px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  details + details { margin-top: 10px; }
  summary { display: flex; align-items: center; gap: 9px; padding: 14px 18px; font-size: 13px; font-weight: 500; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary .chev { width: 14px; height: 14px; stroke: var(--faint); fill: none; stroke-width: 2; flex-shrink: 0; transition: transform .15s; }
  details[open] summary .chev { transform: rotate(90deg); }
  summary .n { margin-left: auto; font-size: 12px; font-weight: 400; color: var(--faint); }
  details[open] summary { border-bottom: 1px solid var(--line); }
  .d-body { padding: 12px 18px 16px; }
  .lead { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding: 8px 12px; background: #FAFAFC; border: 1px solid var(--line); border-radius: var(--radius-sm); font-family: var(--mono); font-size: 12px; color: var(--dim); }
  .lead span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lead button { font-family: inherit; font-size: 11.5px; color: var(--dim); background: #fff; border: 1px solid var(--line-hi); border-radius: 6px; padding: 2px 9px; cursor: pointer; flex-shrink: 0; }
  .lead button:hover { color: var(--blue); border-color: var(--blue); }
  .pr { display: flex; align-items: center; gap: 11px; padding: 7px 0; border-bottom: 1px solid #F2F2F5; font-size: 13px; }
  .pr:last-child { border-bottom: none; }
  .pr .i { width: 14px; flex-shrink: 0; font-family: var(--mono); font-size: 11px; color: var(--faint); }
  .pr .t { flex: 1; }
  .pr button { font-family: inherit; font-size: 11.5px; color: var(--faint); background: none; border: none; border-radius: 5px; padding: 2px 6px; cursor: pointer; }
  .pr button:hover { background: var(--blue-soft); color: var(--blue); }
  .cm { display: flex; align-items: center; gap: 14px; padding: 7px 0; border-bottom: 1px solid #F2F2F5; font-size: 13px; }
  .cm:last-child { border-bottom: none; }
  .cm code { font-size: 12px; background: #F4F4F7; border-radius: 6px; padding: 2px 8px; color: #2C2C33; }
  .cm span { font-size: 12.5px; color: var(--dim); }
  .more { margin-top: 12px; font-size: 12.5px; color: var(--faint); }
  .more a { color: var(--blue); }

  @media (max-width: 900px) {
    .metrics { grid-template-columns: repeat(2, 1fr); }
    .tiles { grid-template-columns: 1fr; }
    .ops { grid-template-columns: 1fr; }
    .copy { opacity: 1; }
  }
</style>
</head>
<body>

<header class="topbar">
  <div class="wrap topbar-in">
    <div class="brand"><span class="dot ok" id="live-dot"></span>u32-local-server<span class="ver">v${version}</span></div>
    <span class="addr">${addr}</span>
    <nav class="nav">
      <a class="active" href="./">首页</a>
      <a href="./status">状态</a>
      <a href="./config">配置</a>
      <span class="sep"></span>
      <a href="${DOCS_URL}" target="_blank" rel="noopener">文档 ↗</a>
    </nav>
  </div>
</header>

<main class="main wrap">
  <section class="metrics">
    <div class="metric">
      <div class="lab"><span class="d ok"></span>运行时长</div>
      <div class="val" data-live="uptime">${fmtDuration(snap.uptimeSec)}</div>
    </div>
    <div class="metric">
      <div class="lab"><span class="d"></span>允许路径</div>
      <div class="val"><span data-k="allowCount">${snap.allowCount}</span><small>条</small></div>
    </div>
    <div class="metric">
      <div class="lab"><span class="d"></span>桥在线实例</div>
      <div class="val"><span data-k="bridge.instances">${snap.bridge.instances}</span><small>个</small></div>
    </div>
    <div class="metric">
      <div class="lab"><span class="d"></span>临时产物</div>
      <div class="val"><span data-k="artifacts.size">${fmtBytes(snap.artifacts.bytes) || '0 B'}</span><small>· <span data-k="artifacts.count">${snap.artifacts.count}</span> 个</small></div>
    </div>
  </section>

  <div class="alert alert-err" id="alert-allow" ${snap.allowCount > 0 ? 'hidden' : ''}>
    <svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16v.5"/></svg>
    <span class="grow"><b>允许列表为空</b>，所有文件访问都会被拒绝。</span>
    <a class="act" href="./config">去配置</a>
  </div>

  <div class="alert alert-warn" id="alert-auto" ${svc.autostart ? 'hidden' : ''}>
    <svg class="ic" viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg>
    <span class="grow"><b>开机自启未注册</b>，系统重启后服务不会自动拉起。</span>
    <a class="act" href="#" id="alert-auto-act">立即注册</a>
  </div>

  <div class="h">入口</div>
  <div class="tiles">
    ${renderEntries()}
  </div>

  <div class="h">运维</div>
  <div class="ops">
    <div class="op">
      <div class="op-head">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>系统集成
      </div>
      <div class="row"><span class="k">开机自启</span><span data-svc-wrap="autostart">${autoTag}</span></div>
      <div class="row"><span class="k">右键菜单</span><span data-svc-wrap="menu">${menuTag}</span></div>
      <div class="btns">
        <button class="btn btn-primary" type="button" data-svc-action="register">注册服务</button>
        <button class="btn" type="button" data-svc-action="unregister">取消注册</button>
      </div>
    </div>
    <div class="op">
      <div class="op-head">
        <svg viewBox="0 0 24 24"><path d="M3 7h5l2 2h11v10H3z"/><path d="M8 14h8"/></svg>临时产物
      </div>
      <div class="row"><span class="k">当前占用</span><span data-k="artifacts.text">${fmtBytes(snap.artifacts.bytes) || '0 B'} · ${snap.artifacts.count} 个文件</span></div>
      <div class="row"><span class="k">清理策略</span>7 天过期 · 重启清空</div>
      <div class="btns">
        <button class="btn" type="button" id="art-open">打开目录</button>
        <button class="btn btn-danger" type="button" id="art-clear">清空全部</button>
      </div>
    </div>
  </div>

  <details>
    <summary>
      <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>接入 AI
      <span class="n">${AI_PROMPTS.length} 条指令</span>
    </summary>
    <div class="d-body">
      <div class="lead">
        <span>http://localhost:${config.port}/llms.txt</span>
        <button type="button" data-copy-llms>复制地址</button>
      </div>
      ${renderPrompts()}
    </div>
  </details>

  <details>
    <summary>
      <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>常用命令
      <span class="n">${COMMANDS.length} 条</span>
    </summary>
    <div class="d-body">
      ${renderCommands()}
      <div class="more">完整命令见 <a href="./docs/cli.md" target="_blank" rel="noopener">CLI 文档</a></div>
    </div>
  </details>
</main>

<footer class="pagefoot">
  <div class="wrap in">
    <span>u32-local-server v${version} · MIT</span>
    <span>PID ${snap.pid}</span>
    <div class="links">
      <a href="${DOCS_URL}" target="_blank" rel="noopener">文档站</a>
      <a href="./llms.txt" target="_blank" rel="noopener">llms.txt</a>
      <a href="${GITHUB_URL}" target="_blank" rel="noopener">GitHub</a>
    </div>
  </div>
</footer>

<script>window.__INIT__ = ${JSON.stringify(snap)}</script>
<script src="./public/js/home.js"></script>
</body>
</html>`
}

function serve(req, res, config) {
  logger.debug('[HOME-PAGE] Serving home page\n')
  let snap
  try {
    snap = summary.collect(config)
  } catch (e) {
    logger.error(`[HOME-PAGE] summary failed: ${e.message}\n`)
    snap = {
      generatedAt: Date.now(), port: config.port, pid: process.pid, uptimeSec: 0,
      allowCount: 0, denyCount: 0, bridge: { apps: 0, instances: 0 },
      artifacts: { count: 0, bytes: 0 },
      services: { platform: process.platform, autostart: false, contextMenu: false, degraded: true },
    }
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'access-control-allow-headers': '*',
  })
  res.end(renderPage(config, snap))
}

module.exports = { serve, renderPage }
