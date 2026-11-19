const fs = require('fs')
const path = require('path')
const os = require('os')

const LOG_DIR = path.join(os.homedir(), '.u32-local-server', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'server.log')
const MAX_SIZE = 2 * 1024 * 1024
const MAX_BACKUPS = 10

function setupLogFile() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

function rotateLogs() {
  for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
    const old = path.join(LOG_DIR, `server.log.${i}`)
    const newPath = path.join(LOG_DIR, `server.log.${i + 1}`)
    if (fs.existsSync(old)) {
      if (i === MAX_BACKUPS - 1) {
        fs.unlinkSync(old)
      } else {
        fs.renameSync(old, newPath)
      }
    }
  }
  if (fs.existsSync(LOG_FILE)) {
    fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'server.log.1'))
  }
}

function writeToFile(message) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true })
    }
  } catch (err) {
  }

  try {
    const stats = fs.statSync(LOG_FILE)
    if (stats.size >= MAX_SIZE) {
      rotateLogs()
    }
  } catch (err) {
  }

  // 日志是观测手段，写失败（盘满/文件被占用）不能放大为主业务故障，静默丢弃
  try {
    fs.appendFileSync(LOG_FILE, message)
  } catch (err) {
  }
}

function formatLog(level, message) {
  const timestamp = new Date().toISOString()
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`
}

module.exports = {
  setupLogFile,
  writeToFile,
  formatLog,
  LOG_FILE
}
