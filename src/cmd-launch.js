#!/usr/bin/env node

// 单入口命令（安装包唯一快捷方式 `u32-local-server` 点击时执行）：
// 启动服务 + 拉起系统托盘，两者均幂等（已在跑就不重复）。
// 仅 Windows 有托盘；Linux/macOS 等同 `start`。

const fs = require('fs')
const path = require('path')
const os = require('os')
const { loadConfig } = require('./config')
const { startServerInBackground } = require('./daemon')

const PID_FILE = path.join(os.homedir(), '.u32-local-server', 'server.pid')

function isServerAlive() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10)
    if (!pid) return false
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function run() {
  const config = loadConfig()

  if (isServerAlive()) {
    process.stdout.write(`[LAUNCH] Service already running: http://127.0.0.1:${config.port}\n`)
  } else {
    process.stdout.write('[LAUNCH] Starting service...\n')
    startServerInBackground()
      .then(() => process.stdout.write(`[LAUNCH] Service started: http://127.0.0.1:${config.port}\n`))
      .catch(err => process.stderr.write(`[LAUNCH] Failed to start service: ${err.message}\n`))
  }

  if (process.platform === 'win32') {
    require('./cmd-tray').run()
  }
}

module.exports = { run }
