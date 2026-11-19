// Bridge Artifacts（桥产物临时存储）：页面侧上传大产物（截图/导出 JSON 等），
// 服务器落盘为 JSL(YM+S) 时间戳条目，AI 经短 URL 直接 GET 下载（免 base64 走 JSON 回包）。
//
// 路径：~/.u32-local-server/tmp/bridge-artifacts/<YYYY>/<MM>/<YYYYMMDD-HHMMSS-<主题名>.<ext>
//   - 「tmp/」分区 = 临时语义，用户可随时整目录清空，服务器不依赖其中内容
//   - 命名遵循 JSL 规范（rules/general/jsl.md）：年月日期层 + 时间戳单文件条目
// 元数据在内存 Map（生命周期判定用）；存储形态归 JSL，过期策略归 Map，职责分离。
// 清空三层：① 启动清空（重启即全部过期）② TTL 惰性+定时清扫（默认 7 天）③ 手动清空（CLI/UI 按钮）

const fs = require('fs')
const path = require('path')
const os = require('os')
const logger = require('./logger')

const SWEEP_INTERVAL_MS = 60 * 60 * 1000        // 定时清扫节奏（1 小时，配合 7 天 TTL）
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 产物过期时间（7 天）
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024      // 单个产物上限
const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024 * 1024 // 目录总量上限（超限 LRU 驱逐）
const MAX_NAME_CHARS = 32                       // 主题名上限（JSL 命名规则）

// artifactId → { file, contentType, bytes, createdAt, lastAccess }
const entries = new Map()

let cfg = null  // { dir, ttlMs, maxBytes, maxTotalBytes, urlPrefix }
let mimeToExt = {} // 由服务器 mime 表反查，注入于 init

// 初始化：建目录 + 启动清空（上一会话产物全为过期孤儿）；注册定时清扫
function init(config, mimeTable) {
  const root = path.join(os.homedir(), '.u32-local-server', 'tmp', 'bridge-artifacts')
  const c = (config && config.bridge && config.bridge.artifact) || {}
  cfg = {
    dir: root,
    ttlMs: positiveNum(c.ttlMs, DEFAULT_TTL_MS),
    maxBytes: positiveNum(c.maxBytes, DEFAULT_MAX_BYTES),
    maxTotalBytes: positiveNum(c.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES),
  }
  mimeToExt = {}
  for (const [ext, type] of Object.entries(mimeTable || {})) {
    if (!mimeToExt[type]) mimeToExt[type] = ext
  }
  // ① 启动清空：整个产物目录删除重建
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch (e) {
    logger.error(`[ARTIFACT] Failed to wipe ${root}: ${e.message}\n`)
  }
  fs.mkdirSync(root, { recursive: true })
  entries.clear()
  logger.info(`[ARTIFACT] Ready: ${root} (ttlMs=${cfg.ttlMs}, maxBytes=${cfg.maxBytes}, maxTotalBytes=${cfg.maxTotalBytes})\n`)
  const timer = setInterval(() => { try { sweepExpired() } catch (e) { logger.error(`[ARTIFACT] sweep error: ${e.message}\n`) } }, SWEEP_INTERVAL_MS)
  if (timer.unref) timer.unref()
}

function positiveNum(v, dft) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : dft
}

// 主题名消毒：≤32 字符、空格转 _、剔除路径非法/控制字符、缺省 artifact（JSL 命名规则）
function sanitizeName(raw) {
  let name = typeof raw === 'string' && raw ? raw : 'artifact'
  name = name.replace(/\s+/g, '_').replace(/[^\p{L}\p{N}\-_.]/gu, '').replace(/^[.\-_]+/, '')
  if (!name) name = 'artifact'
  return name.slice(0, MAX_NAME_CHARS)
}

// 生成 JSL 条目文件名：YYYYMMDD-HHMMSS-<主题名>.<ext>；同秒冲突追加 -2/-3
function buildEntryPath(name, contentType) {
  const ext = mimeToExt[contentType] || '.bin'
  const d = new Date()
  const ts = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
    + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0')
  const monthDir = path.join(cfg.dir, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'))
  fs.mkdirSync(monthDir, { recursive: true })
  let file = `${ts}-${name}${ext}`
  let n = 2
  while (fs.existsSync(path.join(monthDir, file)) || entries.has(file)) {
    file = `${ts}-${name}-${n}${ext}`
    n++
  }
  return path.join(monthDir, file)
}

// 过期清扫（惰性由 get/upload 调用、定时器兜底）：删过期文件 + 清空日期目录
function sweepExpired(now = Date.now()) {
  const deadline = now - cfg.ttlMs
  for (const [id, meta] of entries) {
    if (meta.lastAccess < deadline) removeEntry(id, meta)
  }
  pruneEmptyMonthDirs()
}

function removeEntry(id, meta) {
  try { fs.rmSync(meta.file, { force: true }) } catch (e) { /* 已被手动清空等场景：忽略 */ }
  entries.delete(id)
}

// 删除空掉的 YYYY/MM 日期目录（连同空 YYYY），避免留一串空目录
function pruneEmptyMonthDirs() {
  const yearRe = /^\d{4}$/
  const monthRe = /^\d{2}$/
  let years
  try { years = fs.readdirSync(cfg.dir) } catch (e) { return }
  for (const y of years) {
    if (!yearRe.test(y)) continue
    const yDir = path.join(cfg.dir, y)
    let months
    try { months = fs.readdirSync(yDir) } catch (e) { continue }
    for (const m of months) {
      if (!monthRe.test(m)) continue
      const mDir = path.join(yDir, m)
      try {
        if (fs.readdirSync(mDir).length === 0) fs.rmdirSync(mDir)
      } catch (e) { /* 非目录或非空：跳过 */ }
    }
    try {
      if (fs.readdirSync(yDir).length === 0) fs.rmdirSync(yDir)
    } catch (e) { /* 非空：跳过 */ }
  }
}

// 目录总量统计（以内存 Map 为准）
function totalBytes() {
  let sum = 0
  for (const meta of entries.values()) sum += meta.bytes
  return sum
}

// LRU 驱逐：总量超限时按 lastAccess 最旧先删
function evictOverTotal() {
  if (totalBytes() <= cfg.maxTotalBytes) return
  const sorted = [...entries.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess)
  for (const [id, meta] of sorted) {
    if (totalBytes() <= cfg.maxTotalBytes) break
    removeEntry(id, meta)
  }
}

// 上传：写 JSL 条目 → 登记 Map → 顺带惰性清扫 + 总量 LRU
function upload(appInstanceId, rawName, contentType, buf) {
  sweepExpired()
  const name = sanitizeName(rawName)
  const file = buildEntryPath(name, contentType)
  fs.writeFileSync(file, buf)
  const id = path.basename(file)
  entries.set(id, {
    file,
    contentType: contentType || 'application/octet-stream',
    bytes: buf.length,
    createdAt: Date.now(),
    lastAccess: Date.now(),
    appInstanceId,
  })
  evictOverTotal()
  logger.info(`[ARTIFACT] Uploaded: ${id} (${buf.length} bytes, instance=${appInstanceId})\n`)
  return { artifactId: id, bytes: buf.length, path: file }
}

// 读取：找到返回 { streamPath, contentType, bytes } 并刷新 lastAccess；找不到返回 null
function get(id) {
  const meta = entries.get(id)
  if (!meta) return null
  meta.lastAccess = Date.now()
  if (!fs.existsSync(meta.file)) { removeEntry(id, meta); return null }
  return { file: meta.file, contentType: meta.contentType, bytes: meta.bytes }
}

// 统计（首页卡片用）：以磁盘为准（含手工放进目录的文件，不只在册产物）
function stats() {
  if (!cfg) return { count: 0, bytes: 0, dir: '' }
  let files = []
  try { files = walk(cfg.dir) } catch (e) { /* 目录不存在按 0 算 */ }
  let bytes = 0
  for (const f of files) { try { bytes += fs.statSync(f).size } catch (e) { /* 竞态删除忽略 */ } }
  return { count: files.length, bytes, dir: cfg.dir }
}

// 用系统文件管理器打开临时目录（仅 Windows：explorer；其他平台不支持）
function openDir() {
  if (!cfg || !cfg.dir) return { ok: false, error: 'artifacts not initialized' }
  if (process.platform !== 'win32') return { ok: false, error: 'unsupported platform: ' + process.platform }
  try {
    const { spawn } = require('child_process')
    const child = spawn('explorer', [cfg.dir], { detached: true, stdio: 'ignore' })
    child.unref()
    return { ok: true, dir: cfg.dir }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// 手动清空：删全部文件（含手工放入、不在内存名册的）与日期目录，返回释放量
function clearAll() {
  const disk = stats()
  const freed = disk.bytes
  const count = disk.count
  for (const [id, meta] of entries) {
    try { fs.rmSync(meta.file, { force: true }) } catch (e) { /* 忽略 */ }
    entries.delete(id)
  }
  // 兜底扫盘：删掉名册之外的手工文件
  let files = []
  try { files = walk(cfg.dir) } catch (e) { /* 目录不存在 */ }
  for (const f of files) { try { fs.rmSync(f, { force: true }) } catch (e) { /* 忽略 */ } }
  pruneEmptyMonthDirs()
  logger.info(`[ARTIFACT] Cleared: ${count} file(s), ${freed} bytes freed\n`)
  return { count, bytes: freed }
}

// CLI 入口：npx u32-local-server clear-artifacts（不经 init，独立完成清空并汇报）
function clearFromCli() {
  const root = path.join(os.homedir(), '.u32-local-server', 'tmp', 'bridge-artifacts')
  if (!fs.existsSync(root)) {
    console.log(`[ARTIFACT] Nothing to clear (${root} does not exist)`)
    return
  }
  let files = []
  try { files = walk(root) } catch (e) { /* ignore */ }
  const bytes = files.reduce((s, f) => s + (fs.statSync(f).size || 0), 0)
  fs.rmSync(root, { recursive: true, force: true })
  console.log(`[ARTIFACT] Cleared ${files.length} file(s), ${(bytes / 1024 / 1024).toFixed(2)} MB freed`)
  console.log(`[ARTIFACT] Removed: ${root}`)
}

function walk(dir) {
  const out = []
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

// artifactId 白名单校验（GET 路径防穿越）：必须为 JSL 条目名格式
function isValidArtifactId(id) {
  return /^\d{8}-\d{6}-[^\s\\/]{1,64}(\.[A-Za-z0-9]+)?(-\d+)?$/.test(id)
}

module.exports = { init, upload, get, stats, clearAll, clearFromCli, openDir, isValidArtifactId, limits: () => cfg }
