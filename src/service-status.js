// 服务注册状态探测（只读）
// 用途：首页运维卡与 GET /api/service-status 显示"开机自启 / 右键菜单"是否已注册。
// 约束：
//   - 只返回布尔与平台名，不返回注册表路径以外的任何信息，不读环境变量/用户名/家目录（沿用 /status 的脱敏红线）
//   - 只做查询，绝不写入注册表或文件系统
//   - 查询走 execFileSync 参数数组，不拼 shell 字符串，无注入面

const fs = require('fs')
const { execFileSync } = require('child_process')

// 与 cmd-service.js 保持一致的键位（改动需两处同步）
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const RUN_VALUE = 'U32LocalServer'
const MENU_KEY = 'HKCU\\Software\\Classes\\*\\shell\\U32Open'
const SYSTEMD_FILE = '/etc/systemd/system/u32-local-server.service'

// 探测要 fork reg.exe（约 20~40ms），短缓存避免前端轮询每次都拉起进程
const CACHE_TTL_MS = 1500
let cache = null
let cacheAt = 0

function regQuery(key) {
  try {
    return execFileSync('reg', ['query', key], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    // 键不存在与被安全策略拦截都走这里：无法区分，交由调用方按"未注册"展示
    return null
  }
}

function detectWindows() {
  const runOut = regQuery(RUN_KEY)
  const menuOut = regQuery(MENU_KEY)
  return {
    platform: 'win32',
    autostart: runOut ? new RegExp('\\b' + RUN_VALUE + '\\b').test(runOut) : false,
    contextMenu: !!menuOut,
    // 探测本身失败（reg.exe 不可用或被拦截）时置 true，前端可提示"状态未知"
    degraded: runOut === null && menuOut === null,
  }
}

function detectLinux() {
  let autostart = false
  try {
    autostart = fs.existsSync(SYSTEMD_FILE)
  } catch {}
  return { platform: 'linux', autostart, contextMenu: false, degraded: false }
}

function detect() {
  const now = Date.now()
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache
  let result
  try {
    result = process.platform === 'win32' ? detectWindows() : detectLinux()
  } catch {
    result = { platform: process.platform, autostart: false, contextMenu: false, degraded: true }
  }
  cache = result
  cacheAt = now
  return result
}

// 注册/取消注册后调用，让下一次查询绕过缓存
function invalidate() {
  cache = null
  cacheAt = 0
}

module.exports = { detect, invalidate }
