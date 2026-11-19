const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { tail } = require('./tail-util')
const { loadConfig } = require('./config')

const PID_FILE = path.join(os.homedir(), '.u32-local-server', 'server.pid')
const LOG_DIR = path.join(os.homedir(), '.u32-local-server', 'logs')
const STARTUP_TIMEOUT = 5000

function run(cmd, argv) {
  switch(cmd) {
    case 'start':
      cmdStart()
      break
    case 'stop':
      cmdStop()
      break
    case 'restart':
      cmdRestart()
      break
    case 'status':
      cmdStatus()
      break
    case 'logs':
      cmdLogs(argv)
      break
  }
}

function startServerInBackground() {
  return new Promise((resolve, reject) => {
    const logFile = path.join(LOG_DIR, 'server.log')
    let child

    // 记录本次启动时刻：日志是追加的，启动检测只认此时刻之后写入的行，
    // 防止上一次遗留的 "Server started successfully" 让失败的启动误判成功
    const startTs = Date.now()

    try {
      fs.mkdirSync(LOG_DIR, { recursive: true })

      // 子进程 stderr 直接追加进日志文件：启动失败的真实原因（如配置解析错误）可被用户查到
      const logFd = fs.openSync(logFile, 'a')
      child = spawn(process.execPath, [process.argv[1]], {
        detached: true,
        stdio: ['ignore', 'ignore', logFd],
        windowsHide: true
      })

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn child process: ${err.message}`))
      })

      waitForStartup(logFile, STARTUP_TIMEOUT, startTs).then(() => {
        // PID 文件由服务器子进程在 listen 成功后统一写入（index.js），
        // daemon 不重复写，避免双重写入者与竞态
        child.unref()
        resolve({ pid: child.pid, logFile })
      }).catch((err) => {
        child.kill()
        reject(new Error(`${err.message} (查看真实原因: ${logFile})`))
      })
    } catch (err) {
      reject(new Error(`Failed to start server: ${err.message}`))
    }
  })
}

function cmdStart() {
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim())
    if (isProcessRunning(pid)) {
      console.error(`Server is already running (PID ${pid})`)
      console.error(`Use "u32-ls stop" to stop it first`)
      process.exit(1)
    } else {
      fs.unlinkSync(PID_FILE)
    }
  }

  console.log('Starting server...')

  startServerInBackground().then(({ pid, logFile }) => {
    const config = loadConfig()
    console.log(`Server started successfully (PID ${pid})`)
    console.log(`URL: http://127.0.0.1:${config.port}`)
    console.log(`Log file: ${logFile}`)
    process.exit(0)
  }).catch((err) => {
    console.error(`Failed to start server: ${err.message}`)
    process.exit(1)
  })
}

function cmdStop() {
  if (!fs.existsSync(PID_FILE)) {
    console.error('Server is not running')
    process.exit(1)
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim())
  
  console.log(`Stopping server (PID ${pid})...`)
  
  try {
    if (process.platform === 'win32') {
      require('child_process').execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
    }
    
    let count = 0
    const interval = setInterval(() => {
      if (!isProcessRunning(pid)) {
        clearInterval(interval)
        try { fs.unlinkSync(PID_FILE) } catch {}
        console.log('Server stopped')
        process.exit(0)
      }
      
      if (++count > 50) {
        clearInterval(interval)
        console.error('Timeout: Server did not stop gracefully')
        process.exit(1)
      }
    }, 100)
  } catch (err) {
    console.error(`Failed to stop server: ${err.message}`)
    process.exit(1)
  }
}

function cmdRestart() {
  console.log('Restarting server...')

  const stopComplete = () => {
    console.log('Server stopped, starting...')
    cmdStart()
  }

  if (!fs.existsSync(PID_FILE)) {
    console.log('Server is not running, starting...')
    cmdStart()
    return
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim())

  if (!isProcessRunning(pid)) {
    console.log('Server is not running (stale PID file), cleaning up and starting...')
    try {
      fs.unlinkSync(PID_FILE)
    } catch {}
    cmdStart()
    return
  }

  try {
    if (process.platform === 'win32') {
      require('child_process').execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
    }

    let count = 0
    const interval = setInterval(() => {
      if (!isProcessRunning(pid)) {
        clearInterval(interval)
        try { fs.unlinkSync(PID_FILE) } catch {}
        stopComplete()
      }

      if (++count > 50) {
        clearInterval(interval)
        console.error('Timeout: Server did not stop gracefully')
        console.log('Attempting to start anyway...')
        stopComplete()
      }
    }, 100)
  } catch (err) {
    console.error(`Failed to stop server: ${err.message}`)
    console.log('Attempting to start anyway...')
    stopComplete()
  }
}

function cmdStatus() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('Status: Stopped')
    console.log('Use "u32-ls start" to start the server')
    process.exit(0)
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim())
  
  if (isProcessRunning(pid)) {
    console.log('Status: Running')
    console.log(`PID: ${pid}`)
    
    const config = loadConfig()
    console.log(`URL: http://127.0.0.1:${config.port}`)
    console.log(`Log file: ${path.join(LOG_DIR, 'server.log')}`)
  } else {
    console.log('Status: Stopped (stale PID file)')
    console.log('Cleaning up...')
    fs.unlinkSync(PID_FILE)
    console.log('Use "u32-ls start" to start the server')
  }
}

function cmdLogs(argv) {
  const logFile = path.join(LOG_DIR, 'server.log')
  
  if (!fs.existsSync(logFile)) {
    console.error('Log file not found. Server may not have started yet.')
    process.exit(1)
  }

  const args = parseArgs(argv, {
    alias: { n: 'lines', f: 'follow' },
    default: { lines: 20 }
  })

  if (args.all) {
    const content = fs.readFileSync(logFile, 'utf-8')
    filterAndPrint(content, args.level)
    return
  }

  if (args.follow) {
    const t = tail(logFile)
    
    t.on('ready', () => {
      console.log('Following log output (Ctrl+C to exit)...')
      console.log('')
    })
    
    t.on('line', (line) => {
      if (shouldPrint(line, args.level)) {
        console.log(line)
      }
    })
    
    process.on('SIGINT', () => {
      t.close()
      process.exit(0)
    })
    
    return
  }

  const lines = parseInt(args.lines) || 20
  const content = fs.readFileSync(logFile, 'utf-8')
  const allLines = content.split('\n')
  const lastLines = allLines.slice(-lines)
  filterAndPrint(lastLines.join('\n'), args.level)
}

function parseArgs(argv, options) {
  const args = { ...options.default }
  const aliases = options.alias || {}
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
        args[key] = argv[++i]
      } else {
        args[key] = true
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1)
      const longKey = aliases[key] || key
      if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
        args[longKey] = argv[++i]
      } else {
        args[longKey] = true
      }
    }
  }
  
  return args
}

function shouldPrint(line, level) {
  if (!level) return true
  
  const levelStr = level.toUpperCase()
  return line.includes(`[${levelStr}]`)
}

function filterAndPrint(content, level) {
  const lines = content.split('\n')
  for (const line of lines) {
    if (line && shouldPrint(line, level)) {
      console.log(line)
    }
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// 日志行格式：[ISO时间戳] [LEVEL] 文本（file-logger.formatLog 生成）
function lineTimestamp(line) {
  const m = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/)
  if (!m) return NaN
  const ts = Date.parse(m[1])
  return isNaN(ts) ? NaN : ts
}

function waitForStartup(logFile, timeout, startTs) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    const checkInterval = setInterval(() => {
      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval)
        reject(new Error('Startup timeout'))
        return
      }

      try {
        const content = fs.readFileSync(logFile, 'utf-8')
        for (const line of content.split('\n')) {
          // 跳过重启之前写入的行（含历史遗留的成功标志）
          const ts = lineTimestamp(line)
          if (isNaN(ts) || ts < startTs) continue
          if (line.includes('Server started successfully')) {
            clearInterval(checkInterval)
            resolve()
            return
          }
          if (line.includes('Server error:')) {
            clearInterval(checkInterval)
            reject(new Error('Server startup failed'))
            return
          }
        }
      } catch {
      }
    }, 100)
  })
}

module.exports = { run, startServerInBackground }
