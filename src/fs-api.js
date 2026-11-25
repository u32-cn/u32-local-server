#!/usr/bin/env node

// 文件写入 API：POST /api/fs，JSON body { action, ... }
// 安全模型：
//   1. 路径权限：所有涉及的路径经 resolvePath + isAllowed/isWritable（拒绝列表优先；写操作要求路径为读写模式，
//      move/copy 源和目标都要可写；stat 只需可读）
//   2. CSRF：router.js 对 /api/fs 做 Origin 同源校验 + 全局 Host 校验；服务器只监听 127.0.0.1
// 信封格式与 picker.js 一致：{ ok: true, ... } / { ok: false, error }
// 删除为直接删除（无回收站），已与用户确认

const fs = require('fs')
const path = require('path')
const { resolvePath } = require('./config')
const { isAllowed, isWritable } = require('./permission')
const { CORS_HEADERS } = require('./utils')
const logger = require('./logger')

function sendJson(res, code, data) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS_HEADERS))
  res.end(JSON.stringify(data))
}

// 校验单个路径：解析 → 权限。mode: 'read' | 'write'。返回 { path } 或 { error, code }
function checkPath(raw, config, mode = 'write') {
  if (typeof raw !== 'string' || !raw) {
    return { error: '缺少 path 参数', code: 400 }
  }
  const p = resolvePath(raw)
  const allowed = mode === 'write' ? isWritable(p, config) : isAllowed(p, config)
  if (!allowed) {
    if (!isAllowed(p, config)) {
      return { error: `路径不在允许列表内: ${raw}。请执行 u32-ls access 弹窗，由用户确认后授权；AI 禁止直接改配置`, code: 403 }
    }
    return { error: `路径为只读，不允许写操作: ${raw}`, code: 403 }
  }
  return { path: p }
}

// write：写文件（content 为 base64），overwrite 默认 true，mkdirs 默认 false
function opWrite(data, config) {
  const t = checkPath(data.path, config)
  if (t.error) return [t.code, { ok: false, error: t.error }]
  if (typeof data.content !== 'string') {
    return [400, { ok: false, error: '缺少 content 参数（base64 字符串）' }]
  }
  const overwrite = data.overwrite !== false
  const mkdirs = data.mkdirs === true
  if (!overwrite && fs.existsSync(t.path)) {
    return [409, { ok: false, error: '目标已存在且 overwrite=false' }]
  }
  if (mkdirs) {
    fs.mkdirSync(path.posix.dirname(t.path), { recursive: true })
  }
  const buf = Buffer.from(data.content, 'base64')
  fs.writeFileSync(t.path, buf)
  logger.info(`[FS-API] write ${t.path} (${buf.length} bytes)\n`)
  return [200, { ok: true, path: t.path, size: buf.length }]
}

// append：追加内容（content 为 base64），文件不存在时创建
function opAppend(data, config) {
  const t = checkPath(data.path, config)
  if (t.error) return [t.code, { ok: false, error: t.error }]
  if (typeof data.content !== 'string') {
    return [400, { ok: false, error: '缺少 content 参数（base64 字符串）' }]
  }
  const buf = Buffer.from(data.content, 'base64')
  fs.appendFileSync(t.path, buf)
  logger.info(`[FS-API] append ${t.path} (${buf.length} bytes)\n`)
  return [200, { ok: true, path: t.path, appended: buf.length }]
}

// mkdir：建目录，recursive 默认 true
function opMkdir(data, config) {
  const t = checkPath(data.path, config)
  if (t.error) return [t.code, { ok: false, error: t.error }]
  const recursive = data.recursive !== false
  if (!recursive && fs.existsSync(t.path)) {
    return [409, { ok: false, error: '目录已存在且 recursive=false' }]
  }
  fs.mkdirSync(t.path, { recursive })
  logger.info(`[FS-API] mkdir ${t.path}\n`)
  return [200, { ok: true, path: t.path }]
}

// delete：删文件或目录（递归），直接删除无回收站
function opDelete(data, config) {
  const t = checkPath(data.path, config)
  if (t.error) return [t.code, { ok: false, error: t.error }]
  if (!fs.existsSync(t.path)) {
    return [404, { ok: false, error: '路径不存在' }]
  }
  fs.rmSync(t.path, { recursive: true })
  logger.info(`[FS-API] delete ${t.path}\n`)
  return [200, { ok: true, path: t.path }]
}

// move：移动/重命名。源和目标都要求读写权限。跨盘 rename 失败时 fallback copy+delete
function opMove(data, config) {
  return moveOrCopy(data, config, 'move')
}

// copy：复制文件/目录（递归）。源和目标都要求读写权限
function opCopy(data, config) {
  return moveOrCopy(data, config, 'copy')
}

function moveOrCopy(data, config, kind) {
  const fromRaw = kind === 'move' ? data.from : data.from
  const f = checkPath(fromRaw, config)
  if (f.error) return [f.code, { ok: false, error: `from: ${f.error}` }]
  const to = checkPath(data.to, config)
  if (to.error) return [to.code, { ok: false, error: `to: ${to.error}` }]
  if (!fs.existsSync(f.path)) {
    return [404, { ok: false, error: '源路径不存在' }]
  }
  const overwrite = data.overwrite === true
  if (!overwrite && fs.existsSync(to.path)) {
    return [409, { ok: false, error: '目标已存在且 overwrite=false' }]
  }
  if (kind === 'move') {
    try {
      if (overwrite) fs.rmSync(to.path, { recursive: true })
      fs.renameSync(f.path, to.path)
    } catch (err) {
      // EXDEV 跨盘等 rename 失败 → copy + delete
      fs.cpSync(f.path, to.path, { recursive: true, force: overwrite })
      fs.rmSync(f.path, { recursive: true })
    }
    logger.info(`[FS-API] move ${f.path} -> ${to.path}\n`)
  } else {
    fs.cpSync(f.path, to.path, { recursive: true, force: overwrite })
    logger.info(`[FS-API] copy ${f.path} -> ${to.path}\n`)
  }
  return [200, { ok: true, from: f.path, to: to.path }]
}

// stat：单路径元信息（只读操作）
function opStat(data, config) {
  const t = checkPath(data.path, config, 'read')
  if (t.error) return [t.code, { ok: false, error: t.error }]
  let st
  try {
    st = fs.statSync(t.path)
  } catch {
    return [404, { ok: false, error: '路径不存在' }]
  }
  return [200, {
    ok: true,
    path: t.path,
    type: st.isDirectory() ? 'dir' : 'file',
    size: st.size,
    mtime: st.mtime.toISOString(),
  }]
}

// 权限即时读取：配置文件 mtime 变化时才重新解析（/config 修改后无需重启即生效）
// 以磁盘为准，避免「页面改了但内存 config 是启动时快照」的不一致
let diskCache = { mtime: -1, access: null }
function readDiskConfig() {
  try {
    const { CONFIG_FILE } = require('./config')
    const mtime = fs.statSync(CONFIG_FILE).mtimeMs
    if (mtime !== diskCache.mtime) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      diskCache = {
        mtime,
        access: raw.file && raw.file.access,
      }
      logger.info(`[FS-API] Config file changed, access rules reloaded\n`)
    }
  } catch (err) {
    logger.error(`[FS-API] Failed to read config for access rules: ${err.message}\n`)
  }
  return diskCache
}

const ACTIONS = {
  write: opWrite,
  append: opAppend,
  mkdir: opMkdir,
  delete: opDelete,
  move: opMove,
  copy: opCopy,
  stat: opStat,
}

function serve(req, res, config) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed，请使用 POST /api/fs' })
  }
  let body = ''
  req.on('data', chunk => {
    body += chunk
    if (body.length > 64 * 1024 * 1024) {
      req.destroy()
    }
  })
  req.on('end', () => {
    let data
    try {
      data = JSON.parse(body)
    } catch {
      return sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' })
    }
    // 权限以磁盘最新配置为准（/config 修改后立即生效，无需重启）
    const disk = readDiskConfig()
    if (disk.access) config = Object.assign({}, config, { file: Object.assign({}, config.file, { access: disk.access }) })
    const action = data.action
    const handler = ACTIONS[action]
    if (!handler) {
      return sendJson(res, 400, { ok: false, error: `未知 action: ${action}（支持 ${Object.keys(ACTIONS).join('/')}）` })
    }
    try {
      const [code, payload] = handler(data, config)
      return sendJson(res, code, payload)
    } catch (err) {
      logger.error(`[FS-API] ${action} failed: ${err.message}\n`)
      return sendJson(res, 500, { ok: false, error: `${action} 失败: ${err.message}` })
    }
  })
}

module.exports = { serve, ACTIONS }
