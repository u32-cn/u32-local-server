// 运行状态页（/status）与 JSON 接口（/status/api）
// 设计：首屏 SSR 完整渲染（不闪白），之后前端按间隔拉 /status/api 只做定点文本替换，
//       不重绘 DOM，滚动位置/折叠状态/选中文本都不受影响。零依赖，样式内联。

const logger = require('./logger')
const { escapeHtml } = require('./utils')
const sysinfo = require('./sysinfo')
const PACKAGE_JSON = require('../package.json')

/* ---------------- 格式化 ---------------- */
// 与首页共用 src/fmt.js：同一个数值不允许有两种写法
const { pad2, fmtBytes, fmtDuration, fmtTime, fmtNumber, fmtValue } = require('./fmt')

function pick(obj, dotted) {
  return dotted.split('.').reduce((acc, k) => (acc === null || acc === undefined ? undefined : acc[k]), obj)
}

/* ---------------- 页面区块定义 ---------------- */
// kv 区：字段为 [数据键, 中文标签]
const SECTIONS = [
  {
    id: 'app',
    title: '服务与进程',
    fields: [
      ['app.name', '应用名'],
      ['app.version', '版本'],
      ['app.description', '描述'],
      ['app.pid', '当前进程 PID'],
      ['app.ppid', '父进程 PID'],
      ['app.scriptPath', '入口脚本'],
      ['app.nodeBinary', 'Node 二进制'],
      ['app.argv0', 'argv[0]'],
      ['app.packageRoot', '包根目录'],
      ['app.cwd', '工作目录'],
      ['app.argv', '启动参数'],
      ['app.execArgv', 'execArgv'],
      ['app.isTTY', '标准输出 TTY'],
      ['server.startedAt', '进程启动时间'],
      ['uptimeSec', '已运行时长'],
    ],
  },
  {
    id: 'server',
    title: 'HTTP 服务与文件',
    fields: [
      ['server.listening', '监听状态'],
      ['server.address', '实际监听地址'],
      ['server.family', '地址族'],
      ['server.portConfig', '配置端口'],
      ['server.pidFile', 'PID 文件'],
      ['server.pidInFile', 'PID 文件中的值'],
      ['server.pidMatch', 'PID 与当前进程一致'],
      ['server.configFile', '配置文件'],
      ['server.configSizeBytes', '配置文件大小'],
      ['server.configMtimeAt', '配置最后修改'],
      ['server.logFile', '日志文件'],
      ['server.logSizeBytes', '日志大小'],
      ['server.logMtimeAt', '日志最后写入'],
    ],
  },
  {
    id: 'runtime',
    title: '运行时与 Node',
    fields: [
      ['runtime.node', 'Node 版本'],
      ['runtime.releaseName', 'release.name'],
      ['runtime.platform', 'platform'],
      ['runtime.arch', 'arch'],
      ['runtime.locale', '默认 locale'],
      ['timeZone', '时区'],
      ['tzOffsetHours', 'UTC 偏移（小时）'],
      ['runtime.heapSizeLimitBytes', 'V8 堆上限'],
      ['runtime.heapTotalAvailableBytes', 'V8 可用堆'],
      ['runtime.execPath', '可执行文件'],
    ],
  },
  {
    id: 'os',
    title: '操作系统',
    fields: [
      ['os.type', '类型'],
      ['os.platform', 'platform'],
      ['os.release', '内核版本'],
      ['os.version', '内核描述'],
      ['os.arch', '架构'],
      ['os.shell', '登录 shell'],
      ['os.cpuModel', 'CPU 型号'],
      ['os.cpuSpeedMhz', 'CPU 主频'],
      ['os.cpuLogicalCount', '逻辑核数'],
      ['os.cpuParallelism', '可用并行度'],
      ['os.loadAvg', '系统负载（1/5/15，仅 POSIX）'],
      ['os.totalMemBytes', '物理内存总量'],
      ['os.freeMemBytes', '物理内存空闲'],
      ['os.usedMemPercent', '物理内存使用率'],
      ['os.uptimeSec', '系统已运行'],
    ],
  },
  {
    id: 'proc',
    title: '进程资源',
    fields: [
      ['proc.cpuPercent', 'CPU 使用率（占单核）'],
      ['proc.rssBytes', '常驻内存 RSS'],
      ['proc.heapTotalBytes', '堆总量'],
      ['proc.heapUsedBytes', '堆已用'],
      ['proc.heapUsedPercent', '堆使用率'],
      ['proc.externalBytes', 'external 内存'],
      ['proc.arrayBuffersBytes', 'ArrayBuffers'],
      ['proc.maxRssBytes', '历史峰值 RSS'],
      ['proc.cpuUserUsec', '累计 CPU（用户态）'],
      ['proc.cpuSystemUsec', '累计 CPU（内核态）'],
      ['proc.pageFaultsMinorCount', '次要缺页次数'],
      ['proc.pageFaultsMajorCount', '主要缺页次数'],
      ['proc.fsReadCount', '磁盘读操作次数'],
      ['proc.fsWriteCount', '磁盘写操作次数'],
      ['proc.contextSwitchesVoluntaryCount', '上下文切换（主动）'],
      ['proc.contextSwitchesInvoluntaryCount', '上下文切换（被动）'],
      ['proc.signalsCount', '收到信号次数'],
    ],
  },
  {
    id: 'bridge',
    title: '浏览器桥',
    fields: [
      ['bridge.appCount', 'App 数'],
      ['bridge.instanceCount', '在线实例'],
      ['bridge.pendingPollCount', '挂起轮询'],
      ['bridge.pendingSendCount', '挂起发送'],
      ['bridge.pendingMessageCount', '积压消息'],
    ],
  },
]

// 调试级字段：默认折叠，点"全部字段"才展开。
// 判断健康度不需要 argv0 / 缺页次数 / 上下文切换这类排查用信息，全铺开会把关键指标淹掉。
const ADV_KEYS = new Set([
  'app.scriptPath', 'app.nodeBinary', 'app.argv0', 'app.packageRoot', 'app.cwd',
  'app.argv', 'app.execArgv', 'app.isTTY',
  'server.family', 'server.pidFile', 'server.pidInFile', 'server.pidMatch',
  'server.configSizeBytes', 'server.configMtimeAt', 'server.logSizeBytes', 'server.logMtimeAt',
  'runtime.releaseName', 'runtime.arch', 'runtime.locale', 'runtime.execPath','runtime.heapTotalAvailableBytes',
  'os.platform', 'os.version', 'os.shell', 'os.cpuSpeedMhz', 'os.cpuParallelism', 'os.loadAvg',
  'proc.heapTotalBytes', 'proc.externalBytes', 'proc.arrayBuffersBytes', 'proc.maxRssBytes',
  'proc.cpuUserUsec', 'proc.cpuSystemUsec', 'proc.pageFaultsMinorCount', 'proc.pageFaultsMajorCount',
  'proc.fsReadCount', 'proc.fsWriteCount', 'proc.contextSwitchesVoluntaryCount',
  'proc.contextSwitchesInvoluntaryCount', 'proc.signalsCount',
  'bridge.pendingPollCount', 'bridge.pendingSendCount', 'bridge.pendingMessageCount',
])

const METRICS_SECTION = {
  id: 'metrics',
  title: '请求指标',
  fields: [
    ['metrics.totalCount', '请求总数'],
    ['metrics.activeCount', '进行中'],
    ['metrics.errorCount', '4xx / 5xx 总数'],
  ],
}

/* ---------------- 渲染 ---------------- */
function buildFlat(snap) {
  const flat = {}
  const all = SECTIONS.concat([METRICS_SECTION])
  for (const section of all) {
    for (const [key] of section.fields) {
      if (key === 'uptimeSec') {
        flat[key] = fmtDuration(snap.uptimeSec)
        continue
      }
      flat[key] = fmtValue(key, pick(snap, key))
    }
  }
  return flat
}

function buildTables(snap) {
  return {
    'tbl-byroute': (snap.metrics.byRoute || []).map((r) => [r.key, fmtNumber(r.count)]),
    'tbl-bystatus': (snap.metrics.byStatus || []).map((r) => [r.key, fmtNumber(r.count)]),
    'tbl-bymethod': (snap.metrics.byMethod || []).map((r) => [r.key, fmtNumber(r.count)]),
    'tbl-active': (snap.activeResources || []).map((r) => [r.key, fmtNumber(r.count)]),
    'tbl-recent': (snap.metrics.recent || []).map((r) => [
      fmtTime(r.at),
      r.method,
      r.path,
      String(r.status),
      r.ms.toFixed(1) + ' ms',
    ]),
  }
}

function renderRows(fields, flat) {
  return fields
    .map(([key, label]) => {
      const live = key === 'uptimeSec' ? ' data-live="uptime"' : ''
      const adv = ADV_KEYS.has(key) ? ' adv' : ''
      const val = flat[key] === undefined ? '—' : flat[key]
      return '<div class="row' + adv + '"><div class="k">' + escapeHtml(label) + '</div>' +
        '<div class="v"><span data-k="' + escapeHtml(key) + '"' + live + '>' + escapeHtml(val) + '</span></div></div>'
    })
    .join('')
}

function cardKv(section, flat, extraClass) {
  return '<section class="card ' + (extraClass || '') + '" id="card-' + section.id + '">' +
    '<div class="card-head">' + escapeHtml(section.title) + '</div>' +
    '<div class="rows">' + renderRows(section.fields, flat) + '</div>' +
    '</section>'
}

function cardTable(id, title, columns, rows, extraClass, extraHtml) {
  const head = columns.map((c) => '<th>' + escapeHtml(c) + '</th>').join('')
  const body = rows.length
    ? rows.map((r) => '<tr>' + r.map((c) => '<td>' + escapeHtml(c === null || c === undefined ? '—' : String(c)) + '</td>').join('') + '</tr>').join('')
    : '<tr><td colspan="' + columns.length + '" class="empty">暂无数据</td></tr>'
  return '<section class="card ' + (extraClass || '') + '" id="card-' + id + '">' +
    '<div class="card-head">' + escapeHtml(title) + (extraHtml || '') + '</div>' +
    '<div class="table-wrap"><table id="' + id + '"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
    '</section>'
}

function renderPage(snap, addr) {
  const flat = buildFlat(snap)
  const tables = buildTables(snap)

  const versionRows = (snap.versions || []).map((v) => [v.key, v.value])

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>运行状态 - u32-local-server</title>
  <link rel="icon" type="image/svg+xml" href="./public/favicon.svg">
  <link rel="stylesheet" href="./public/css/base.css">
  <style>
    .wrap { max-width: 1320px; }

    .statusbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-bottom: 4px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip {
      display: inline-flex; align-items: baseline; gap: 6px;
      background: var(--card); border: 1px solid var(--line); border-radius: 8px;
      padding: 4px 10px; font-size: 12px;
    }
    .chip b { font-weight: 500; font-size: 11px; color: var(--faint); }
    .chip span { font-family: var(--mono); color: var(--ink); }
    .tools { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .upd { min-width: 128px; text-align: right; font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(430px, 1fr)); gap: 12px; align-items: start; margin-top: 14px; }
    .grid .wide { grid-column: 1 / -1; }
    .card { overflow: hidden; }

    .rows { display: flex; flex-direction: column; }
    .row {
      display: grid; grid-template-columns: 168px 1fr; gap: 10px;
      padding: 6px 18px; border-bottom: 1px solid #F2F2F5; font-size: 13px;
    }
    .row:last-child { border-bottom: none; }
    .row:hover { background: #FAFAFC; }
    .k { color: var(--dim); font-size: 12.5px; }
    .v { font-family: var(--mono); font-size: 12.5px; overflow-wrap: anywhere; }
    .v span[data-k] { cursor: copy; border-radius: 3px; padding: 0 2px; }
    .v span[data-k]:hover { background: var(--blue-soft); }
    .v span[data-k]:empty::before { content: '—'; }

    /* 调试级字段默认折叠：默认视图只留判断健康度需要的字段 */
    .row.adv { display: none; }
    body.show-adv .row.adv { display: grid; }

    .table-wrap { overflow-x: auto; max-height: 420px; overflow-y: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 6px 18px; text-align: left; border-bottom: 1px solid #F2F2F5; white-space: nowrap; }
    th {
      position: sticky; top: 0; background: #FAFAFC; color: var(--faint);
      font-size: 11px; font-weight: 500; border-bottom: 1px solid var(--line);
    }
    td { font-family: var(--mono); overflow-wrap: anywhere; }
    tr:hover td { background: #FAFAFC; }
    td.empty { text-align: center; color: var(--faint); padding: 20px; font-family: var(--sans); }

    .copy-tip {
      position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%);
      max-width: 80vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      background: var(--ink); color: #fff; font-size: 12px; font-weight: 500;
      padding: 7px 14px; border-radius: 8px; opacity: 0; transition: opacity .18s;
      pointer-events: none; z-index: 40;
    }
    .copy-tip.show { opacity: 1; }

    @media (max-width: 560px) {
      .row { grid-template-columns: 1fr; gap: 0; }
      .k { font-size: 11px; }
      .tools { width: 100%; margin-left: 0; }
      .upd { text-align: left; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="wrap topbar-in">
      <div class="brand">
        <span class="dot ok" id="live-dot"></span>u32-local-server
        <span class="ver">v${escapeHtml(PACKAGE_JSON.version)}</span>
      </div>
      <span class="addr">${escapeHtml(addr || '')}</span>
      <nav class="nav">
        <a href="./">首页</a>
        <a class="active" href="./status">状态</a>
        <a href="./config">配置</a>
        <span class="sep"></span>
        <a href="./docs" target="_blank" rel="noopener">文档 ↗</a>
      </nav>
    </div>
  </header>

  <main class="main wrap">
    <div class="statusbar">
      <div class="chips">
        <span class="chip"><b>pid</b><span data-k="app.pid">—</span></span>
        <span class="chip"><b>uptime</b><span data-live="uptime" id="uptime">—</span></span>
        <span class="chip"><b>listen</b><span data-k="server.address">—</span></span>
        <span class="chip"><b>cpu</b><span data-k="proc.cpuPercent">—</span></span>
        <span class="chip"><b>rss</b><span data-k="proc.rssBytes">—</span></span>
      </div>
      <div class="tools">
        <select id="interval" title="自动刷新间隔">
          <option value="2000">2s 刷新</option>
          <option value="5000">5s 刷新</option>
          <option value="10000">10s 刷新</option>
          <option value="0">暂停</option>
        </select>
        <button class="btn btn-sm" id="refresh" type="button">刷新</button>
        <button class="btn btn-sm" id="toggle-adv" type="button" title="显示 / 隐藏调试级字段">全部字段</button>
        <span class="upd" id="updated">—</span>
      </div>
    </div>

    <div class="grid">
      ${cardKv(SECTIONS[0], flat)}
      ${cardKv(SECTIONS[1], flat)}
      ${cardKv(SECTIONS[2], flat)}
      ${cardKv(SECTIONS[3], flat)}
      ${cardKv(SECTIONS[4], flat)}
      ${cardKv(SECTIONS[5], flat)}
      ${cardKv(METRICS_SECTION, flat)}
      ${cardTable('tbl-bymethod', '按方法', ['方法', '次数'], tables['tbl-bymethod'])}
      ${cardTable('tbl-bystatus', '按状态段', ['状态段', '次数'], tables['tbl-bystatus'])}
      ${cardTable('tbl-byroute', '按路由前缀', ['路由', '次数'], tables['tbl-byroute'])}
      ${cardTable('tbl-active', '活跃资源', ['类型', '数量'], tables['tbl-active'])}
      ${cardTable('tbl-recent', '最近请求（最多 20 条）', ['时间', '方法', '路径', '状态', '耗时'], tables['tbl-recent'], 'wide')}
      ${cardTable('tbl-versions', '依赖组件版本（process.versions）', ['组件', '版本'], versionRows, 'wide')}
    </div>
  </main>

  <footer class="pagefoot">
    <div class="wrap in">
      <span>数据源 <code>/status/api</code>（JSON，同源同脱敏）</span>
      <span>指标不含本页轮询与首页摘要请求</span>
      <span>点击任意值可复制</span>
      <div class="links">
        <a href="./llms.txt" target="_blank" rel="noopener">llms.txt</a>
        <a href="https://github.com/u32-cn/u32-local-server" target="_blank" rel="noopener">GitHub</a>
      </div>
    </div>
  </footer>
  <div class="copy-tip" id="copy-tip"></div>

<script>
const INIT_STARTED_AT = ${Number(snap.startedAt)}

let startedAt = INIT_STARTED_AT
let timer = null

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function pad2(n) { return String(n).padStart(2, '0') }

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0))
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return (d > 0 ? d + 'd ' : '') + pad2(h) + ':' + pad2(m) + ':' + pad2(s)
}

function tickUptime() {
  const text = fmtDuration((Date.now() - startedAt) / 1000)
  document.querySelectorAll('[data-live="uptime"]').forEach(el => { el.textContent = text })
}

function applyFlat(flat) {
  document.querySelectorAll('[data-k]').forEach(el => {
    const k = el.getAttribute('data-k')
    if (flat[k] !== undefined) el.textContent = flat[k]
  })
}

function rebuildTable(id, rows) {
  const table = document.getElementById(id)
  if (!table) return
  const tbody = table.querySelector('tbody')
  if (!tbody) return
  const cols = table.querySelectorAll('thead th').length
  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="' + cols + '" class="empty">暂无数据</td></tr>'
    return
  }
  tbody.innerHTML = rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c === null || c === undefined ? '—' : c) + '</td>').join('') + '</tr>').join('')
}

async function refresh() {
  try {
    const res = await fetch('./status/api', { cache: 'no-store' })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '响应异常')
    startedAt = data.startedAt
    applyFlat(data.flat || {})
    const tables = data.tables || {}
    Object.keys(tables).forEach(id => rebuildTable(id, tables[id]))
    tickUptime()
    document.getElementById('live-dot').className = 'dot ok'
    document.getElementById('updated').textContent = '更新于 ' + new Date(data.generatedAt).toLocaleTimeString()
  } catch (e) {
    document.getElementById('live-dot').className = 'dot off'
    document.getElementById('updated').textContent = '连接失败：' + (e && e.message ? e.message : e)
  }
}

function startTimer() {
  if (timer) { clearInterval(timer); timer = null }
  const ms = parseInt(document.getElementById('interval').value, 10)
  if (ms > 0) timer = setInterval(refresh, ms)
}

document.getElementById('interval').addEventListener('change', startTimer)
document.getElementById('refresh').addEventListener('click', refresh)

// 调试级字段折叠开关：默认只看常用项，排查时再展开
const advBtn = document.getElementById('toggle-adv')
advBtn.addEventListener('click', function () {
  const on = document.body.classList.toggle('show-adv')
  advBtn.textContent = on ? '常用字段' : '全部字段'
})

// 点击值复制
document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-k]')
  if (!el || !navigator.clipboard) return
  const text = el.textContent.trim()
  if (!text || text === '—') return
  navigator.clipboard.writeText(text).then(function () {
    const tip = document.getElementById('copy-tip')
    tip.textContent = '已复制：' + (text.length > 60 ? text.slice(0, 60) + '…' : text)
    tip.classList.add('show')
    clearTimeout(tip._t)
    tip._t = setTimeout(function () { tip.classList.remove('show') }, 1400)
  })
})

setInterval(tickUptime, 1000)
tickUptime()
startTimer()
refresh()
</script>
</body>
</html>`
}

/* ---------------- 入口 ---------------- */
function serve(req, res, config, server) {
  logger.debug('[STATUS] Serving status page\n')
  let snap
  try {
    snap = sysinfo.collect(config, server)
  } catch (e) {
    logger.error(`[STATUS] collect failed: ${e.message}\n`)
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('采集运行状态失败：' + e.message)
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(renderPage(snap, '127.0.0.1:' + config.port))
}

function serveApi(req, res, config, server) {
  logger.debug('[STATUS] Serving status api\n')
  let snap
  try {
    snap = sysinfo.collect(config, server)
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    return res.end(JSON.stringify({ ok: false, error: e.message }))
  }
  const body = {
    ok: true,
    generatedAt: snap.generatedAt,
    startedAt: snap.startedAt,
    uptimeSec: snap.uptimeSec,
    flat: buildFlat(snap),
    tables: buildTables(snap),
    raw: snap,
  }
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'access-control-allow-origin': '*',
  })
  res.end(JSON.stringify(body, null, 2))
}

module.exports = { serve, serveApi, renderPage }
