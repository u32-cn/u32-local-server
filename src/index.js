#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const { loadConfig, saveConfig, resolveConfig, CONFIG_FILE } = require('./config')
const logger = require('./logger')
const fileLogger = require('./file-logger')

const PID_FILE = path.join(os.homedir(), '.u32-local-server', 'server.pid')

const PACKAGE_JSON = require('../package.json')
const VERSION = PACKAGE_JSON.version

const cmd = process.argv[2]

if (cmd === '-v' || cmd === '--version' || cmd === 'version') {
  console.log(`u32-local-server v${VERSION}`)
  return
}

if (cmd === '-h' || cmd === '--help' || cmd === 'help') {
  logger.info(`u32-local-server v${VERSION}

本地 HTTP 文件服务器 + CORS 代理

功能特性：
  • 文件服务          通过 HTTP 访问本地文件系统
  • CORS 代理         绕过跨域限制，代理请求任意 URL
  • 权限控制          允许列表/拒绝列表保护文件访问
  • 配置管理          Web 界面可视化配置
  • 浏览器桥          AI 与浏览器页面间长轮询消息桥
  • 跨平台支持        Windows/Linux/macOS

Usage: u32-ls <command>

Commands:
  start            Start the background server              启动后台服务器
  stop             Stop the server                          停止服务器
  restart          Restart the server                       重启服务器
  status           Show server status                       查看服务器状态
  logs [options]   View server logs                         查看服务器日志
  url <path>       Get the URL for a local file/directory  获取本地文件/目录的URL
  open [path]      Open home page or file in browser       打开首页或指定文件（无参数打开首页）
  copy-url <path>  Copy URL to clipboard                    复制URL到剪贴板
  register         Register auto-start service              注册开机自启动服务（Windows添加右键菜单）
  unregister       Unregister auto-start service            取消注册开机自启动服务
  version, -v, --version  Show version number               显示版本号

Logs Options:
  -n, --lines <num>   Show last N lines (default: 20)        显示最后N行日志（默认：20）
  -f, --follow        Follow log output (like tail -f)      跟踪日志输出（类似 tail -f）
  --all               Show all logs                         显示所有日志
  --level <level>     Filter by log level                   按日志级别过滤（debug, info, error）

Options:
  -h, --help       Show this help message                   显示此帮助信息
  -v, --version    Show version number                      显示版本号
  `)
  return
}

if (cmd === 'start' || cmd === 'stop' || cmd === 'restart' || cmd === 'status' || cmd === 'logs') {
  const { run } = require('./daemon')
  run(cmd, process.argv.slice(3))
  return
}

if (cmd === 'url') {
  const { run } = require('./cmd-url')
  run(process.argv.slice(3))
  return
}
if (cmd === 'open') {
  const { run } = require('./cmd-open')
  run(process.argv.slice(3))
  return
}
if (cmd === 'copy-url') {
  const { run } = require('./cmd-copy-url')
  run(process.argv.slice(3))
  return
}
if (cmd === 'register' || cmd === 'unregister') {
  const { run } = require('./cmd-service')
  run(process.argv.slice(2))
  return
}
if (cmd === 'clear-artifacts') {
  // 手动清空桥产物临时目录（第三层清空：用户随时可清；路径自带 tmp/ 临时语义）
  require('./artifacts').clearFromCli()
  return
}

const http = require('http')
const { serve: fileServe } = require('./file-server')
const { proxy } = require('./proxy')
const { serve: configServe } = require('./config-page')
const { serve: homeServe } = require('./home-page')
const { serve: proxyPageServe } = require('./proxy-page')
const { serve: bridgeStatusServe } = require('./bridge-status')
const { serve: pickerDemoServe } = require('./picker-demo')
const pickerServe = require('./picker')
const { setupRoutes } = require('./router')

let server = null
let shutdownTimeout = null

async function gracefulShutdown(signal) {
  if (shutdownTimeout) {
    return
  }

  const timestamp = new Date().toISOString()
  const logFile = fileLogger.LOG_FILE

  try {
    fs.appendFileSync(logFile, `[${timestamp}] [INFO] Received ${signal} signal, initiating graceful shutdown\n`)
  } catch (err) {}

  shutdownTimeout = setTimeout(() => {
    try {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] [ERROR] Shutdown timeout, forcing exit\n`)
    } catch (err) {}
    process.exit(1)
  }, 5000)

  try {
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          try {
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] [INFO] HTTP server closed\n`)
          } catch (err) {}
          resolve()
        })
      })
    }

    try {
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE)
        try {
          fs.appendFileSync(logFile, `[${new Date().toISOString()}] [INFO] PID file removed: ${PID_FILE}\n`)
        } catch (err) {}
      }
    } catch (err) {}

    await new Promise(resolve => setTimeout(resolve, 100))

    try {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] [INFO] Shutdown complete\n`)
    } catch (err) {}
  } catch (err) {
    try {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] [ERROR] Error during shutdown: ${err.message}\n`)
    } catch (e) {}
  } finally {
    clearTimeout(shutdownTimeout)
    process.exit(0)
  }
}

function setupGlobalErrorHandlers() {
  const logFile = fileLogger.LOG_FILE

  process.on('uncaughtException', (err) => {
    const timestamp = new Date().toISOString()
    const log = `[${timestamp}] [FATAL] Uncaught Exception: ${err.message}\n${err.stack}\n`
    
    try {
      fs.appendFileSync(logFile, log)
    } catch (e) {}
    
    try {
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE)
      }
    } catch (e) {}
    
    setTimeout(() => process.exit(1), 100)
  })

  process.on('unhandledRejection', (reason, promise) => {
    const timestamp = new Date().toISOString()
    const log = `[${timestamp}] [ERROR] Unhandled Promise Rejection\nReason: ${reason}\n`
    
    try {
      fs.appendFileSync(logFile, log)
    } catch (e) {}
  })

  process.on('beforeExit', (code) => {
    const timestamp = new Date().toISOString()
    try {
      fs.appendFileSync(logFile, `[${timestamp}] [INFO] Process beforeExit with code ${code}\n`)
    } catch (err) {}
  })
}

function startServer() {
  fileLogger.setupLogFile()
  setupGlobalErrorHandlers()

  logger.info(`[INFO] Loading config from: ${CONFIG_FILE}\n`)
  const rawConfig = loadConfig()
  const config = resolveConfig(rawConfig)
  logger.info(`[INFO] Config loaded successfully\n`)
  logger.info(`[INFO]   Port: ${config.port}\n`)
  logger.info(`[INFO]   Allow rules: ${(config.file.access.allow || []).map(e => typeof e === "string" ? e : e.path).join(', ') || '(empty)'}\n`)
  logger.info(`[INFO]   Deny rules: ${(config.file.access.deny || []).join(', ') || '(empty)'}\n`)

  server = http.createServer()
  setupRoutes(server, fileServe, proxy, configServe, homeServe, proxyPageServe, bridgeStatusServe, pickerServe, pickerDemoServe, config)

  server.on('error', (err) => {
    logger.error(`[ERROR] Server error: ${err.message}\n`)
    process.exit(1)
  })

  logger.info(`[INFO] Starting HTTP server on 127.0.0.1:${config.port} ...\n`)
  server.listen(config.port, '127.0.0.1', () => {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true })
    fs.writeFileSync(PID_FILE, String(process.pid))
    logger.info(`[SUCCESS] Server started successfully\n`)
    logger.info(`[SUCCESS] PID file written: ${PID_FILE} (PID ${process.pid})\n`)
    logger.info(`[SUCCESS] Listening on http://127.0.0.1:${config.port}\n`)
  })

  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
}

startServer()
