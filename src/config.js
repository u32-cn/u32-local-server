#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const { toPosix } = require('./posix-path')
const logger = require('./logger')

const CONFIG_DIR = path.join(os.homedir(), '.u32-local-server', 'config')
const CONFIG_FILE = path.join(CONFIG_DIR, 'main.json')

function resolvePath(p) {
  let result = p
  if (p.startsWith('~/')) {
    result = path.join(os.homedir(), p.slice(2))
  }
  result = toPosix(result)
  if (/^\/[a-zA-Z]:/.test(result)) {
    result = result.slice(1)
  }
  return result
}

function getDefaultConfig() {
  return {
    port: 19527,
    file: {
      access: {
        allow: []
      },
      mime: {
        '.html': 'text/html', '.htm': 'text/html',
        '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.jsx': 'text/jsx',
        '.json': 'application/json', '.jsonc': 'application/json', '.xml': 'application/xml',
        '.txt': 'text/plain', '.log': 'text/plain', '.md': 'text/markdown; charset=utf-8', '.markdown': 'text/markdown', '.tex': 'text/x-tex', '.latex': 'text/x-latex', '.csv': 'text/csv',
        '.yaml': 'text/yaml', '.yml': 'text/yaml',
        '.ini': 'text/plain', '.toml': 'text/plain', '.properties': 'text/plain', '.env': 'text/plain', '.conf': 'text/plain', '.cfg': 'text/plain',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
        '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
        '.tiff': 'image/tiff', '.tif': 'image/tiff',
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
        '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip', '.tar': 'application/x-tar',
        '.gz': 'application/gzip', '.tgz': 'application/gzip',
        '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed',
        '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
        '.wasm': 'application/wasm',
        '.webmanifest': 'application/manifest+json',
        '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
        '.geojson': 'application/geo+json',
        '.sh': 'text/x-shellscript',
        '.py': 'text/x-python', '.ts': 'text/x-typescript', '.tsx': 'text/tsx', '.vue': 'text/x-vue',
        '.sql': 'application/sql',
        '.php': 'text/x-php',
        '.c': 'text/x-c', '.h': 'text/x-c', '.cpp': 'text/x-c++', '.hpp': 'text/x-c++', '.cc': 'text/x-c++', '.cxx': 'text/x-c++',
        '.java': 'text/x-java',
        '.go': 'text/x-go',
        '.rs': 'text/x-rust',
        '.epub': 'application/epub+zip',
        '.rtf': 'application/rtf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }
    },
    // 浏览器桥产物临时存储（~/.u32-local-server/tmp/bridge-artifacts，JSL(YM+S) 条目）
    bridge: {
      artifact: {
        ttlMs: 7 * 24 * 60 * 60 * 1000,        // 产物过期时间（默认 7 天）
        maxBytes: 64 * 1024 * 1024,            // 单个产物上限
        maxTotalBytes: 1024 * 1024 * 1024,     // 目录总量上限（超限 LRU 驱逐）
      }
    },
    proxy: {}
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    logger.info(`[CONFIG] Config file not found, creating default: ${CONFIG_FILE}\n`)
    saveConfig(getDefaultConfig())
    logger.info(`[CONFIG] Default config created successfully\n`)
  }
  logger.info(`[CONFIG] Loading config from: ${CONFIG_FILE}\n`)
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  } catch (err) {
    // 抛出带指向性的错误（含文件路径），CLI 与配置页均能看到；否则只见到 "Startup timeout"
    throw new Error(`配置文件解析失败: ${CONFIG_FILE}\n原始错误: ${err.message}\n请修正 JSON 语法，或删除该文件后重启以重建默认配置`)
  }
  logger.info(`[CONFIG] Config loaded successfully\n`)
  // 一次性迁移：旧格式 → 新格式
  // 1) allow 字符串条目 → { path, write: true }（存量路径默认读写）
  // 2) 条目路径统一 resolvePath（~/ 展开为绝对路径）
  // 3) 删除已废弃的 file.write 开关（写权限改由路径级 write 字段控制）
  // 4) deny（拒绝列表）已废弃：迁移时直接丢弃
  const access = raw.file && raw.file.access
  if (access) {
    const before = JSON.stringify(access.allow)
    const migrateEntry = (e) => {
      if (typeof e === 'string') return { path: resolvePath(e), write: true }
      return { path: resolvePath(e.path), write: e.write !== false }
    }
    const dedupePaths = (list) => {
      const seen = new Set()
      return list.filter(e => !seen.has(e.path) && seen.add(e.path))
    }
    access.allow = dedupePaths((access.allow || []).map(migrateEntry))
    if (access.deny !== undefined) {
      delete access.deny
      logger.info(`[CONFIG] Dropped deprecated deny list (feature removed)\n`)
    }
    if (JSON.stringify(access.allow) !== before) {
      saveConfig(raw)
      logger.info(`[CONFIG] Migrated access rules to allow entries { path, write }\n`)
    }
  }
  if (raw.file && raw.file.write !== undefined) {
    delete raw.file.write
    saveConfig(raw)
    logger.info(`[CONFIG] Removed deprecated file.write switch (write permission now per-path)\n`)
  }
  return raw
}

function resolveConfig(config) {
  const resolved = JSON.parse(JSON.stringify(config))
  resolved.file.access.allow = (resolved.file.access.allow || []).map(e =>
    typeof e === 'string' ? { path: resolvePath(e), write: true } : Object.assign({}, e, { path: resolvePath(e.path) })
  )
  logger.info(`[CONFIG] Resolved ${resolved.file.access.allow.length} allow rules\n`)
  return resolved
}

function saveConfig(config) {
  logger.info(`[CONFIG] Saving config to: ${CONFIG_FILE}\n`)
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  logger.info(`[CONFIG] Config saved successfully\n`)
}

// 实时配置：按配置文件 mtime 缓存，文件一变就重载，供长驻服务每次请求取用。
// 与 loadConfig 的区别：loadConfig 带迁移写入，适合启动/CLI；这里只读，失败回退上一份好配置。
let liveCache = { mtime: -1, config: null }
function getLiveConfig() {
  try {
    const mtime = fs.statSync(CONFIG_FILE).mtimeMs
    if (!liveCache.config || mtime !== liveCache.mtime) {
      liveCache = { mtime, config: resolveConfig(loadConfig()) }
    }
    return liveCache.config
  } catch (err) {
    logger.error(`[CONFIG] Failed to reload config: ${err.message}\n`)
    return liveCache.config
  }
}

module.exports = { loadConfig, saveConfig, resolveConfig, resolvePath, getLiveConfig, CONFIG_FILE, CONFIG_DIR, getDefaultConfig }
