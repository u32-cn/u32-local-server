// 运行状态页（/status）与 JSON 接口（/status/api）
// 设计：首屏 SSR 完整渲染（不闪白），之后前端按间隔拉 /status/api 只做定点文本替换，
//       不重绘 DOM，滚动位置/折叠状态/选中文本都不受影响。零依赖，样式内联。

const logger = require('./logger')
const { escapeHtml } = require('./utils')
const sysinfo = require('./sysinfo')
const PACKAGE_JSON = require('../package.json')

/* ---------------- 格式化 ---------------- */
function pad2(n) {
  return String(n).padStart(2, '0')
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return (i === 0 ? String(Math.round(v)) : v.toFixed(v >= 100 ? 0 : 1)) + ' ' + units[i]
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0))
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return (d > 0 ? d + 'd ' : '') + pad2(h) + ':' + pad2(m) + ':' + pad2(s)
}

function fmtTime(ms) {
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  return (
    d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
    pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
  )
}

function fmtNumber(n) {
  if (!Number.isFinite(n)) return null
  return n.toLocaleString('en-US')
}

// 按字段名后缀统一格式化：采集层只负责给数值，单位语义写在键名里
function fmtValue(key, v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'number') {
    const suffix = key.split('.').pop()
    if (/Bytes$/.test(suffix)) return fmtBytes(v)
    if (/At$/.test(suffix)) return fmtTime(v)
    if (/Percent$/.test(suffix)) return v.toFixed(1) + '%'
    if (/Mhz$/.test(suffix)) return fmtNumber(v) + ' MHz'
    if (/Sec$/.test(suffix)) return fmtDuration(v)
    if (/Ms$/.test(suffix)) return v.toFixed(1) + ' ms'
    if (/Usec$/.test(suffix)) return (v / 1e6).toFixed(3) + ' s'
    if (/Count$/.test(suffix)) return fmtNumber(v)
    if (/Hours$/.test(suffix)) return (v >= 0 ? '+' : '') + v
    return String(v)
  }
  return String(v)
}

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
      const val = flat[key] === undefined ? '—' : flat[key]
      return '<div class="row"><div class="k">' + escapeHtml(label) + '</div>' +
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

function renderPage(snap) {
  const flat = buildFlat(snap)
  const tables = buildTables(snap)

  const versionRows = (snap.versions || []).map((v) => [v.key, v.value])

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>运行状态 - u32-local-server</title>
  <link rel="stylesheet" href="./public/css/space-grotesk.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FFFFFF; color: #000000; line-height: 1.5; font-size: 13px;
    }
    .mono { font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace; }

    .topbar { position: sticky; top: 0; z-index: 20; background: #FFFFFF; border-bottom: 2px solid #000000; }
    .topbar-inner {
      max-width: 1320px; margin: 0 auto; padding: 10px 20px;
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
    .brand .ver { font-weight: 400; color: #666; font-size: 12px; }
    .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: #DDD; }
    .dot.on { background: #16A34A; }
    .dot.off { background: #DC2626; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { border: 1px solid #000000; padding: 2px 8px; font-size: 12px; white-space: nowrap; }
    .chip b { font-weight: 700; color: #666; margin-right: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .tools { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .tools select, .tools button, .tools a.btn {
      font-family: inherit; font-size: 12px; border: 1px solid #000000; background: #FFFFFF;
      color: #000000; padding: 4px 10px; cursor: pointer; text-decoration: none; line-height: 1.4;
    }
    .tools button:hover, .tools a.btn:hover, .tools select:hover { background: #000000; color: #FFFFFF; }
    .upd { font-size: 12px; color: #666; min-width: 130px; text-align: right; }

    main { max-width: 1320px; margin: 0 auto; padding: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(430px, 1fr)); gap: 16px; align-items: start; }
    .grid .wide { grid-column: 1 / -1; }

    .card { border: 1px solid #E5E5E5; background: #FFFFFF; overflow: hidden; }
    .card-head {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
      padding: 9px 14px; border-bottom: 1px solid #000000; background: #FAFAFA;
    }
    .card-head .hint { margin-left: auto; font-size: 11px; font-weight: 400; color: #999; text-transform: none; letter-spacing: 0; }
    .rows { display: flex; flex-direction: column; }
    .row { display: grid; grid-template-columns: 170px 1fr; gap: 10px; padding: 6px 14px; border-bottom: 1px solid #F2F2F2; }
    .row:last-child { border-bottom: none; }
    .row:hover { background: #FAFAFA; }
    .k { color: #666; }
    .v { overflow-wrap: anywhere; }
    .v span[data-k] { cursor: copy; }
    .v span[data-k]:hover { background: #F0F0F0; }
    .v span[data-k]:empty::before { content: '—'; }

    .table-wrap { overflow-x: auto; max-height: 420px; overflow-y: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 6px 14px; text-align: left; border-bottom: 1px solid #F2F2F2; white-space: nowrap; }
    th { position: sticky; top: 0; background: #FAFAFA; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; border-bottom: 1px solid #E5E5E5; }
    td { overflow-wrap: anywhere; }
    tr:hover td { background: #FAFAFA; }
    td.empty { text-align: center; color: #999; padding: 20px; }

    .copy-tip {
      position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%);
      background: #000000; color: #FFFFFF; font-size: 12px; font-weight: 700;
      padding: 7px 14px; opacity: 0; transition: opacity 0.18s; pointer-events: none; z-index: 40;
      max-width: 80vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .copy-tip.show { opacity: 1; }
    .foot { max-width: 1320px; margin: 0 auto; padding: 0 20px 40px; font-size: 12px; color: #666; }
    .foot code { background: #F5F5F5; padding: 1px 5px; }
    @media (max-width: 560px) {
      .row { grid-template-columns: 1fr; gap: 0; }
      .k { font-size: 11px; }
      .tools { margin-left: 0; width: 100%; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <span class="dot" id="live-dot"></span>
        <span>u32-local-server</span>
        <span class="ver">v${escapeHtml(PACKAGE_JSON.version)}</span>
      </div>
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
        <button id="refresh">刷新</button>
        <a class="btn" href="./">首页</a>
        <span class="upd" id="updated">—</span>
      </div>
    </div>
  </div>

  <main>
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
  <div class="foot">
    数据源 <code>/status/api</code>（JSON，同源同脱敏）· 指标不含本页自身的轮询请求 · 点击值可复制
  </div>
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
    document.getElementById('live-dot').className = 'dot on'
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
  res.end(renderPage(snap))
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
