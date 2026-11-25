#!/usr/bin/env node

// picker 只读 API：GET /picker/api/{roots,ls,stat}
// 权限统一走 permission.js 允许列表（isAllowed/isWritable，拒绝列表优先）
//   roots → { ok, roots: [{ path, name, write }] }
//   ls?path=<posix 绝对路径> → { ok, path, parent, write, entries: [{ name, type, typeLabel, size, mtime }] }
//   stat?path=<posix 绝对路径> → { ok, path, type, typeLabel, size, mtime, exists }

const fs = require('fs')
const { resolvePath } = require('../config')
const { isAllowed, isWritable } = require('../permission')
const { CORS_HEADERS } = require('../utils')
const logger = require('../logger')

const API_PREFIX = '/picker/api/'

// 扩展名 → Windows「类型」列文案（近似映射，未知扩展名兜底为「XXX 文件」）
const TYPE_LABELS = {
  exe: '应用程序', msi: 'Windows Installer 程序包', bat: 'Windows 批处理文件', cmd: 'Windows 命令脚本',
  lnk: '快捷方式', ps1: 'PowerShell 脚本',
  zip: '压缩(zipped)文件夹', rar: 'RAR 压缩文件', '7z': '7Z 压缩文件', tar: 'TAR 文件', gz: 'GZIP 压缩文件', tgz: 'GZIP 压缩文件',
  pdf: 'PDF 文档',
  doc: 'Microsoft Word 文档', docx: 'Microsoft Word 文档',
  xls: 'Microsoft Excel 工作表', xlsx: 'Microsoft Excel 工作表', csv: 'CSV 文件',
  ppt: 'Microsoft PowerPoint 演示文稿', pptx: 'PowerPoint 演示文稿',
  txt: '文本文档', md: 'Markdown 文件', markdown: 'Markdown 文件', log: '日志文件',
  json: 'JSON 源文件', jsonc: 'JSON 源文件', xml: 'XML 文件', yaml: 'YAML 文件', yml: 'YAML 文件',
  js: 'JavaScript 文件', mjs: 'JavaScript 文件', cjs: 'JavaScript 文件', ts: 'TypeScript 文件', tsx: 'TypeScript 文件',
  html: 'HTML 文件', htm: 'HTML 文件', css: 'CSS 文件', scss: 'Sass 文件',
  py: 'Python 文件', sh: 'Shell 脚本', go: 'Go 源文件', rs: 'Rust 源文件', java: 'Java 源文件',
  c: 'C 源文件', h: 'C 头文件', cpp: 'C++ 源文件', hpp: 'C++ 头文件',
  jpg: 'JPG 文件', jpeg: 'JPEG 文件', png: 'PNG 文件', gif: 'GIF 文件', bmp: '位图图像',
  webp: 'WebP 图像', svg: 'SVG 文件', ico: '图标', tif: 'TIFF 图像', tiff: 'TIFF 图像', avif: 'AVIF 图像',
  mp4: 'MP4 视频', webm: 'WebM 视频', mov: 'MOV 视频', avi: 'AVI 视频', mkv: 'MKV 视频',
  mp3: 'MP3 音频', wav: 'WAV 音频', ogg: 'OGG 音频', flac: 'FLAC 音频', aac: 'AAC 音频', m4a: 'M4A 音频',
  woff: '字体文件', woff2: '字体文件', ttf: '字体文件', otf: '字体文件',
  glb: 'GLB 3D 模型', gltf: 'glTF 文件', obj: 'OBJ 3D 模型', stl: 'STL 3D 模型',
  epub: 'EPUB 电子书', rtf: 'RTF 文档', wasm: 'WebAssembly 文件',
}

function extOf(name) {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

// 类型列文案：目录固定「文件夹」，文件按扩展名映射，无扩展名回落「文件」
function typeLabelOf(name, isDir) {
  if (isDir) return '文件夹'
  const ext = extOf(name)
  if (!ext) return '文件'
  return TYPE_LABELS[ext] || ext.toUpperCase() + ' 文件'
}

// 盘符裸根（S:）会被 fs 解释为该盘的「当前工作目录」，统一补成 S:/ 指向盘根
function normalizeDrive(p) {
  return /^[a-zA-Z]:$/.test(p) ? p + '/' : p
}

function sendJson(res, code, data) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS_HEADERS))
  res.end(JSON.stringify(data))
}

// 目录名展示：取末段，根目录（如 D:/ 或 /）回退为完整路径
function rootDisplayName(p) {
  const trimmed = p.replace(/\/+$/, '')
  if (!trimmed) return p
  const segs = trimmed.split('/')
  return segs[segs.length - 1] || p
}

// 允许列表根目录（配置加载时已 resolvePath，可直接使用）
function getRoots(config) {
  return (config.file.access.allow || []).map(e => {
    const p = typeof e === 'string' ? e : e.path
    return { path: p, name: rootDisplayName(p), write: isWritable(p, config) }
  })
}

function handleRoots(res, config) {
  return sendJson(res, 200, { ok: true, roots: getRoots(config) })
}

function handleLs(res, url, config) {
  const raw = url.searchParams.get('path') || ''
  const dirPath = normalizeDrive(resolvePath(raw))
  if (!dirPath) {
    return sendJson(res, 200, { ok: true, roots: getRoots(config) })
  }
  if (!isAllowed(dirPath, config)) {
    return sendJson(res, 403, { ok: false, error: '路径不在允许列表内，请执行 u32-ls access 弹窗由用户授权；AI 禁止直接改配置' })
  }
  let stat
  try {
    stat = fs.statSync(dirPath)
  } catch {
    return sendJson(res, 404, { ok: false, error: '路径不存在' })
  }
  if (!stat.isDirectory()) {
    return sendJson(res, 400, { ok: false, error: '不是目录' })
  }
  let names
  try {
    names = fs.readdirSync(dirPath)
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: '读取目录失败: ' + err.message })
  }
  const entries = []
  for (const name of names) {
    try {
      const st = fs.statSync(dirPath.replace(/\/+$/, '') + '/' + name)
      const isDir = st.isDirectory()
      entries.push({
        name,
        type: isDir ? 'dir' : 'file',
        typeLabel: typeLabelOf(name, isDir),
        size: st.size,
        mtime: st.mtime.toISOString(),
      })
    } catch {
      // stat 失败的条目（权限/符号链接悬空等）跳过，与 HTML 目录列表行为一致
    }
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })
  // parent：上一级目录路径，已在允许列表内才返回（null 表示不可再向上）
  const trimmed = dirPath.replace(/\/+$/, '')
  const parent = trimmed.includes('/') ? trimmed.slice(0, trimmed.lastIndexOf('/')) : ''
  const parentAllowed = parent && isAllowed(parent, config) ? parent : null
  logger.debug(`[PICKER-API] ls ${dirPath}: ${entries.length} entries\n`)
  return sendJson(res, 200, {
    ok: true,
    path: dirPath,
    parent: parentAllowed,
    write: isWritable(dirPath, config),
    entries,
  })
}

// stat：保存模式的覆盖检测与完整路径校验（只读，不要求写权限）
function handleStat(res, url, config) {
  const raw = url.searchParams.get('path') || ''
  if (!raw) {
    return sendJson(res, 400, { ok: false, error: '缺少 path 参数' })
  }
  const p = normalizeDrive(resolvePath(raw))
  if (!isAllowed(p, config)) {
    return sendJson(res, 403, { ok: false, error: '路径不在允许列表内，请执行 u32-ls access 弹窗由用户授权；AI 禁止直接改配置' })
  }
  let st
  try {
    st = fs.statSync(p)
  } catch {
    return sendJson(res, 200, { ok: true, path: p, exists: false })
  }
  const isDir = st.isDirectory()
  return sendJson(res, 200, {
    ok: true,
    path: p,
    exists: true,
    type: isDir ? 'dir' : 'file',
    typeLabel: typeLabelOf(p, isDir),
    size: st.size,
    mtime: st.mtime.toISOString(),
  })
}

function serve(req, res, url, config) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' })
  }
  const name = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : ''
  if (name === 'roots') return handleRoots(res, config)
  if (name === 'ls') return handleLs(res, url, config)
  if (name === 'stat') return handleStat(res, url, config)
  return sendJson(res, 404, { ok: false, error: 'Not Found' })
}

module.exports = { serve, getRoots, typeLabelOf, API_PREFIX }
