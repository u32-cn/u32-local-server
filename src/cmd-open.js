const http = require('http')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const { loadConfig } = require('./config')
const { toUrlPath } = require('./cmd-url')
const { toPosix } = require('./posix-path')
const { startServerInBackground } = require('./daemon')

function checkServer(port) {
  return new Promise((resolve) => {
    process.stdout.write(`[CMD-OPEN] Checking if server is running on port ${port}...\n`)
    const req = http.get(`http://localhost:${port}/config`, (res) => {
      res.resume()
      const isRunning = res.statusCode === 200
      process.stdout.write(`[CMD-OPEN] Server check result: ${isRunning ? 'running' : 'not running'} (status ${res.statusCode})\n`)
      resolve(isRunning)
    })
    req.on('error', () => {
      process.stdout.write(`[CMD-OPEN] Server check result: not running (connection error)\n`)
      resolve(false)
    })
    req.setTimeout(2000, () => {
      process.stdout.write(`[CMD-OPEN] Server check result: not running (timeout)\n`)
      req.destroy()
      resolve(false)
    })
  })
}

async function run(argv) {
  const input = argv[0]
  const config = loadConfig()

  if (!input) {
    process.stdout.write('[CMD-OPEN] Opening home page...\n')
    if (!(await checkServer(config.port))) {
      process.stdout.write(`[CMD-OPEN] Server not running, starting...\n`)
      try {
        await startServerInBackground()
        process.stdout.write(`[CMD-OPEN] Server started successfully\n`)
      } catch (e) {
        process.stderr.write(`[CMD-OPEN] ERROR: Failed to start server: ${e.message}\n`)
        process.exit(1)
      }
    } else {
      process.stdout.write(`[CMD-OPEN] Server already running on port ${config.port}\n`)
    }

    const url = `http://127.0.0.1:${config.port}/`
    process.stdout.write(`[CMD-OPEN] Opening URL: ${url}\n`)
    const platform = process.platform
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    }
    process.exit(0)
  }

  process.stdout.write(`[CMD-OPEN] Resolving path: ${input}\n`)

  let resolved
  if (input.startsWith('~/')) {
    resolved = path.join(os.homedir(), input.slice(2))
    process.stdout.write(`[CMD-OPEN] Expanded ~ to: ${resolved}\n`)
  } else {
    resolved = path.resolve(input)
    process.stdout.write(`[CMD-OPEN] Resolved relative path to: ${resolved}\n`)
  }
  resolved = toPosix(resolved)
  process.stdout.write(`[CMD-OPEN] Normalized to: ${resolved}\n`)

  if (!(await checkServer(config.port))) {
    process.stdout.write(`[CMD-OPEN] Server not running, starting...\n`)
    try {
      await startServerInBackground()
      process.stdout.write(`[CMD-OPEN] Server started successfully\n`)
    } catch (e) {
      process.stderr.write(`[CMD-OPEN] ERROR: Failed to start server: ${e.message}\n`)
      process.exit(1)
    }
  } else {
    process.stdout.write(`[CMD-OPEN] Server already running on port ${config.port}\n`)
  }

  const urlPath = toUrlPath(resolved)
  const url = `http://localhost:${config.port}${urlPath}`
  process.stdout.write(`[CMD-OPEN] Opening URL: ${url}\n`)

  const platform = process.platform
  process.stdout.write(`[CMD-OPEN] Platform: ${platform}\n`)
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    process.stdout.write(`[CMD-OPEN] Launched browser on Windows\n`)
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    process.stdout.write(`[CMD-OPEN] Launched browser on Linux/Unix\n`)
  }

  process.stdout.write('[CMD-OPEN] Done.\n')
  process.exit(0)
}

module.exports = { run }
