// 目录清单 u32-dir-listing（`.u32-dir.json`）：动态现场生成、静态预生成实体文件，双实现同格式
// 规范文档：docs/readme/dir-listing.md（遵循 AI 工作仓库 json-file-format.md 信封规范）
// 动态端点纯内存生成直接返回，不向磁盘写任何文件

const fs = require('fs')
const path = require('path')
const { isAllowed, isWritable } = require('./permission')

const MAGIC = 'u32-dir-listing'
const SUPPORTED_VERSION = 1
const FILE_NAME = '.u32-dir.json'

// 目录内排序（version 1 语义约定）：目录在前，同级 localeCompare(zh) 升序
function sortEntries(entries) {
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })
}

// 收集目录条目（buildListing/buildStaticListing 共用）：stat 失败的条目跳过
function collectEntries(dirPath) {
  const entries = []
  for (const name of fs.readdirSync(dirPath)) {
    try {
      const st = fs.statSync(path.join(dirPath, name))
      const isDir = st.isDirectory()
      entries.push({
        name,
        type: isDir ? 'dir' : 'file',
        sizeBytes: isDir ? null : st.size,
        mtime: st.mtime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      })
    } catch {
      // stat 失败的条目（权限/悬空符号链接等）跳过，与 HTML 目录列表行为一致
    }
  }
  sortEntries(entries)
  return entries
}

// 现场生成一份清单（纯内存，不落盘）。dirPath 为 POSIX 风格绝对目录路径，须已通过 isAllowed 校验
// 不含 path/parent 字段：静态实体文件会被发布到公网，写本机路径泄露目录结构（且无消费方依赖）
function buildListing(dirPath, config) {
  const { version } = require('../package.json')
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  return {
    magic: MAGIC,
    version: SUPPORTED_VERSION,
    meta: {
      author: 'vtxf',
      created: now,
      updated: now,
      generator: 'u32-local-server@' + version,
      title: '目录清单',
      'u32-origin': 'dynamic',
    },
    data: {
      writable: isWritable(dirPath, config),
      entries: collectEntries(dirPath),
    },
  }
}

// 静态预生成用：无 allow 上下文，writable 固定 false；不含 path/parent（发布到公网不泄露本机路径）
// opts.created 用于覆写既有实体文件时保留原 created（规范：写入后永不修改）
function buildStaticListing(dirPath, opts = {}) {
  const { version } = require('../package.json')
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  return {
    magic: MAGIC,
    version: SUPPORTED_VERSION,
    meta: {
      author: 'vtxf',
      created: opts.created || now,
      updated: now,
      generator: 'u32-ls gen-dir-listing@' + version,
      title: '目录清单',
      'u32-origin': 'static',
    },
    data: {
      writable: false,
      entries: collectEntries(dirPath),
    },
  }
}

// 读取目录内的实体清单文件并校验 magic@version。
// 返回 { ok: true, listing } 或 { ok: false, error }（错误信息含实际 magic@version，按读取契约不兜底）
function readEntityListing(dirPath) {
  const file = path.join(dirPath, FILE_NAME)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (err) {
    return { ok: false, error: '读取实体清单文件失败: ' + err.message }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { ok: false, error: '实体清单文件不是合法 JSON: ' + err.message }
  }
  const actualMagic = parsed && typeof parsed === 'object' ? parsed.magic : undefined
  const actualVersion = parsed && typeof parsed === 'object' ? parsed.version : undefined
  if (actualMagic !== MAGIC) {
    return { ok: false, error: `实体清单文件 magic 不符：期望 ${MAGIC}，实际 ${actualMagic}` }
  }
  if (actualVersion !== SUPPORTED_VERSION) {
    return { ok: false, error: `实体清单文件 ${MAGIC}@${actualVersion} 无对应解析器（支持版本：${SUPPORTED_VERSION}）` }
  }
  return { ok: true, listing: parsed }
}

module.exports = { MAGIC, SUPPORTED_VERSION, FILE_NAME, buildListing, buildStaticListing, readEntityListing, sortEntries }
