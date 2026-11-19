// 系统信息采集层：/status 页面与 /status/api 的唯一数据源
// 约定：数值字段用带单位的后缀命名（Bytes / Sec / Ms / Usec / Percent / At / Count / Mhz），
//       展示层按后缀统一格式化，避免格式化逻辑散落在采集代码里。
// 每个采集块独立 try/catch：单项失败只标注该项不可用，绝不让整页 500。

const fs = require('fs')
const os = require('os')
const path = require('path')

const PACKAGE_JSON = require('../package.json')
const { CONFIG_FILE } = require('./config')
const fileLogger = require('./file-logger')

const PKG_ROOT = path.join(__dirname, '..')
const PID_FILE = path.join(os.homedir(), '.u32-local-server', 'server.pid')
// 进程启动时刻：uptime 单调递增，用一次计算即可，后续取同一常量保证稳定
const PROC_STARTED_AT = Date.now() - process.uptime() * 1000

/* ---------------- CPU 使用率采样 ---------------- */
// cpuUsage 是累计值，必须两次取样求差；采样器常驻但 unref，不阻止进程退出
let cpuPercent = null
let lastCpu = process.cpuUsage()
let lastHr = process.hrtime.bigint()

function sampleCpu() {
  const cpu = process.cpuUsage()
  const hr = process.hrtime.bigint()
  const deltaUsec = cpu.user - lastCpu.user + (cpu.system - lastCpu.system)
  const elapsedUsec = Number(hr - lastHr) / 1000
  if (elapsedUsec > 0) {
    // 多线程时可能 >100%，即"占单核百分比"，不截断
    cpuPercent = Math.round((deltaUsec / elapsedUsec) * 1000) / 10
  }
  lastCpu = cpu
  lastHr = hr
}

const cpuTimer = setInterval(sampleCpu, 2000)
if (cpuTimer.unref) cpuTimer.unref()

/* ---------------- 请求指标 ---------------- */
const metrics = {
  totalCount: 0,
  activeCount: 0,
  errorCount: 0,
  byMethod: {},
  byStatus: {},
  byRoute: {},
  recent: [],
}

const ROUTE_KEYS = new Set(['file', 'proxy', 'bridge', 'picker', 'config', 'docs', 'api', 'public', 'status', 'llms.txt'])
const RECENT_MAX = 20

function pathnameOf(rawUrl) {
  return String(rawUrl || '/').split('?')[0]
}

function routeKey(rawUrl) {
  const p = pathnameOf(rawUrl)
  if (p === '/') return '/'
  const seg = p.split('/')[1] || ''
  return '/' + (ROUTE_KEYS.has(seg) ? seg : '(其他)')
}

// 由 router 在请求入口调用（一处钩子）。观察类轮询不计数，否则指标被观察行为本身污染
const IGNORED_POLL_PATHS = new Set(['/status', '/api/summary', '/api/service-status'])
function recordRequest(req, res) {
  const p = pathnameOf(req.url)
  if (IGNORED_POLL_PATHS.has(p) || p.startsWith('/status/')) return

  const t0 = process.hrtime.bigint()
  metrics.totalCount++
  metrics.activeCount++
  metrics.byMethod[req.method] = (metrics.byMethod[req.method] || 0) + 1

  let done = false
  const finish = () => {
    if (done) return
    done = true
    metrics.activeCount = Math.max(0, metrics.activeCount - 1)
    const code = res.statusCode || 0
    const bucket = Math.floor(code / 100) + 'xx'
    metrics.byStatus[bucket] = (metrics.byStatus[bucket] || 0) + 1
    if (code >= 400) metrics.errorCount++
    const rk = routeKey(req.url)
    metrics.byRoute[rk] = (metrics.byRoute[rk] || 0) + 1
    const maskedPath = maskPath(p)
    metrics.recent.unshift({
      method: req.method,
      path: maskedPath.length > 90 ? maskedPath.slice(0, 90) + '…' : maskedPath,
      status: code,
      ms: Math.round((Number(process.hrtime.bigint() - t0) / 1e6) * 10) / 10,
      at: Date.now(),
    })
    if (metrics.recent.length > RECENT_MAX) metrics.recent.length = RECENT_MAX
  }
  res.on('finish', finish)
  res.on('close', finish)
}

/* ---------------- 采集工具 ---------------- */
// 路径脱敏：家目录前缀替换为 ~，避免输出里带出用户名
const HOME_DIR = os.homedir()
function maskPath(p) {
  if (!p) return p
  const s = String(p)
  const lower = s.toLowerCase()
  const home = HOME_DIR.toLowerCase()
  if (lower === home) return '~'
  if (lower.startsWith(home + path.sep) || lower.startsWith(home + '/')) return '~' + s.slice(HOME_DIR.length)
  return s
}

function statSafe(file) {
  try {
    return fs.statSync(file)
  } catch {
    return null
  }
}

function bytesLabel(n) {
  if (!Number.isFinite(n)) return null
  return n
}

function toCountMap(obj) {
  return Object.keys(obj)
    .map((k) => ({ key: k, count: obj[k] }))
    .sort((a, b) => b.count - a.count)
}

/* ---------------- 主采集入口 ---------------- */
function collect(config, server) {
  const now = Date.now()
  const snap = {
    generatedAt: now,
    startedAt: PROC_STARTED_AT,
    uptimeSec: Math.floor(process.uptime()),
    timeZone: null,
    tzOffsetHours: -new Date().getTimezoneOffset() / 60,
    app: {},
    server: {},
    runtime: {},
    versions: [],
    os: {},
    proc: {},
    resource: {},
    metrics: {},
    bridge: {},
    activeResources: [],
  }

  /* 应用 */
  try {
    snap.app = {
      name: PACKAGE_JSON.name,
      version: PACKAGE_JSON.version,
      description: PACKAGE_JSON.description || '',
      pid: process.pid,
      ppid: process.ppid,
      scriptPath: maskPath(process.argv[1] || '(未知)'),
      nodeBinary: maskPath(process.execPath),
      argv0: maskPath(process.argv0),
      packageRoot: maskPath(PKG_ROOT),
      cwd: maskPath(process.cwd()),
      argv: maskPath(process.argv.slice(2).join(' ')) || '(无)',
      execArgv: process.execArgv.join(' ') || '(无)',
      isTTY: !!process.stdout.isTTY,
    }
  } catch (e) {
    snap.app = { error: e.message }
  }

  /* 服务端 / 配置文件 / 日志 */
  try {
    let addr = null
    try {
      addr = server && server.address ? server.address() : null
    } catch {}
    const cfgStat = statSafe(CONFIG_FILE)
    const logStat = statSafe(fileLogger.LOG_FILE)
    let pidInFile = null
    try {
      pidInFile = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10)
    } catch {}
    snap.server = {
      listening: !!(server && server.listening),
      address: addr ? (typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`) : '未监听',
      family: addr && addr.family ? String(addr.family) : '',
      portConfig: config && config.port,
      configFile: maskPath(CONFIG_FILE),
      configMtimeAt: cfgStat ? cfgStat.mtimeMs : null,
      configSizeBytes: cfgStat ? cfgStat.size : null,
      logFile: maskPath(fileLogger.LOG_FILE),
      logSizeBytes: logStat ? logStat.size : null,
      logMtimeAt: logStat ? logStat.mtimeMs : null,
      pidFile: maskPath(PID_FILE),
      pidInFile: Number.isFinite(pidInFile) ? pidInFile : '未写入',
      pidMatch: Number.isFinite(pidInFile) ? pidInFile === process.pid : false,
      startedAt: PROC_STARTED_AT,
    }
  } catch (e) {
    snap.server = { error: e.message }
  }

  /* 运行时 */
  try {
    const v8 = require('v8')
    const opts = Intl.DateTimeFormat().resolvedOptions()
    snap.timeZone = opts.timeZone || null
    snap.runtime = {
      node: process.version,
      releaseName: process.release && process.release.name,
      platform: process.platform,
      arch: process.arch,
      locale: opts.locale || '',
      heapSizeLimitBytes: v8.getHeapStatistics().heap_size_limit,
      heapTotalAvailableBytes: v8.getHeapStatistics().total_available_size,
      execPath: maskPath(process.execPath),
    }
    snap.versions = Object.keys(process.versions)
      .sort()
      .map((k) => ({ key: k, value: process.versions[k] }))
  } catch (e) {
    snap.runtime = { error: e.message }
  }

  /* 操作系统 */
  try {
    const cpus = os.cpus ? os.cpus() : []
    let parallelism = null
    try {
      parallelism = typeof os.availableParallelism === 'function' ? os.availableParallelism() : null
    } catch {}
    const total = os.totalmem()
    const free = os.freemem()
    const load = process.platform === 'win32' ? null : os.loadavg()
    snap.os = {
      type: os.type(),
      platform: os.platform(),
      release: os.release(),
      version: typeof os.version === 'function' ? os.version() : '',
      arch: os.arch(),
      shell: process.env.SHELL || process.env.COMSPEC || '',
      cpuModel: cpus.length ? String(cpus[0].model).trim() : '',
      cpuSpeedMhz: cpus.length ? cpus[0].speed : null,
      cpuLogicalCount: cpus.length,
      cpuParallelism: parallelism,
      loadAvg: load ? load.map((n) => Math.round(n * 100) / 100).join(' / ') : null,
      totalMemBytes: total,
      freeMemBytes: free,
      usedMemPercent: total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : null,
      uptimeSec: Math.floor(os.uptime()),
    }
  } catch (e) {
    snap.os = { error: e.message }
  }

  /* 进程资源 */
  try {
    const m = process.memoryUsage()
    const limit = snap.runtime.heapSizeLimitBytes || 0
    const ru = typeof process.resourceUsage === 'function' ? process.resourceUsage() : null
    snap.proc = {
      rssBytes: m.rss,
      heapTotalBytes: m.heapTotal,
      heapUsedBytes: m.heapUsed,
      heapUsedPercent: limit > 0 ? Math.round((m.heapUsed / limit) * 1000) / 10 : null,
      externalBytes: m.external,
      arrayBuffersBytes: m.arrayBuffers,
      cpuPercent: cpuPercent,
      cpuUserUsec: ru ? ru.userCPUTime : null,
      cpuSystemUsec: ru ? ru.systemCPUTime : null,
      maxRssBytes: ru ? ru.maxRSS * 1024 : null,
      pageFaultsMinorCount: ru ? ru.minorPageFault : null,
      pageFaultsMajorCount: ru ? ru.majorPageFault : null,
      fsReadCount: ru ? ru.fsRead : null,
      fsWriteCount: ru ? ru.fsWrite : null,
      contextSwitchesVoluntaryCount: ru ? ru.voluntaryContextSwitches : null,
      contextSwitchesInvoluntaryCount: ru ? ru.involuntaryContextSwitches : null,
      signalsCount: ru ? ru.signalsCount : null,
    }
    // 活跃资源（Node 17+）：比 _getActiveHandles 稳定，只返回类型字符串
    if (typeof process.getActiveResourcesInfo === 'function') {
      const map = {}
      for (const name of process.getActiveResourcesInfo()) map[name] = (map[name] || 0) + 1
      snap.activeResources = toCountMap(map)
    }
  } catch (e) {
    snap.proc = { error: e.message }
  }

  /* 请求指标 */
  try {
    snap.metrics = {
      totalCount: metrics.totalCount,
      activeCount: metrics.activeCount,
      errorCount: metrics.errorCount,
      byMethod: toCountMap(metrics.byMethod),
      byStatus: toCountMap(metrics.byStatus),
      byRoute: toCountMap(metrics.byRoute),
      recent: metrics.recent.slice(0, RECENT_MAX),
    }
  } catch (e) {
    snap.metrics = { error: e.message }
  }

  /* 浏览器桥（懒加载，避免采集层与桥模块互相牵连） */
  try {
    const bridge = require('./bridge')
    snap.bridge = typeof bridge.counts === 'function' ? bridge.counts() : { note: '当前版本未提供统计' }
  } catch (e) {
    snap.bridge = { error: e.message }
  }

  return snap
}

module.exports = { collect, recordRequest, PROC_STARTED_AT }
