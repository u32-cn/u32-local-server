const path = require('path')
const fs = require('fs')
const os = require('os')
const { loadConfig } = require('./config')
const { toUrlPath } = require('./cmd-url')
const { toPosix } = require('./posix-path')
const { spawn, exec } = require('child_process')

// 通过 stdin 直传剪贴板：不经 shell、不带尾随换行（echo|clip 会把 CRLF 一起复制进去）
function copyViaStdin(cmd, args, url, done) {
  const child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'] })
  child.stdin.end(url)
  child.on('error', (err) => done(err))
  child.on('close', (code) => done(code === 0 ? null : new Error(`${cmd} exited with code ${code}`)))
}

function run(argv) {
  const input = argv[0]
  if (!input) {
    process.stdout.write('[CMD-COPY-URL] Usage: u32-ls copy-url <path>\n')
    process.exit(1)
  }

  process.stdout.write(`[CMD-COPY-URL] Processing path: ${input}\n`)
  const config = loadConfig()

  let resolved
  if (input.startsWith('~/')) {
    resolved = path.join(os.homedir(), input.slice(2))
    process.stdout.write(`[CMD-COPY-URL] Expanded ~ to: ${resolved}\n`)
  } else {
    resolved = path.resolve(input)
    process.stdout.write(`[CMD-COPY-URL] Resolved relative path to: ${resolved}\n`)
  }

  resolved = toPosix(resolved)
  process.stdout.write(`[CMD-COPY-URL] Normalized to: ${resolved}\n`)

  const urlPath = toUrlPath(resolved)
  const url = `http://localhost:${config.port}${urlPath}`
  process.stdout.write(`[CMD-COPY-URL] Generated URL: ${url}\n`)

  const platform = process.platform
  process.stdout.write(`[CMD-COPY-URL] Platform: ${platform}\n`)
  if (platform === 'win32') {
    process.stdout.write(`[CMD-COPY-URL] Copying to clipboard using clip.exe\n`)
    copyViaStdin('clip', [], url, (err) => {
      if (err) {
        process.stderr.write(`[CMD-COPY-URL] ERROR: Failed to copy to clipboard: ${err.message}\n`)
        process.exit(1)
      }
      process.stdout.write(`[CMD-COPY-URL] URL copied to clipboard successfully\n`)
      process.exit(0)
    })
  } else {
    // Linux：探测可用的剪贴板工具（X11 用 xclip，Wayland 用 wl-copy），都没有则给安装提示
    exec('command -v xclip >/dev/null 2>&1 && echo xclip || (command -v wl-copy >/dev/null 2>&1 && echo wl-copy) || echo none',
      (err, stdout) => {
        const tool = (stdout || '').trim()
        if (err || tool === 'none') {
          process.stderr.write('[CMD-COPY-URL] ERROR: no clipboard tool found. Install one:\n')
          process.stderr.write('[CMD-COPY-URL]   X11:     sudo apt install xclip\n')
          process.stderr.write('[CMD-COPY-URL]   Wayland: sudo apt install wl-clipboard\n')
          process.exit(1)
        }
        process.stdout.write(`[CMD-COPY-URL] Copying to clipboard using ${tool}\n`)
        const args = tool === 'wl-copy' ? [] : ['-selection', 'clipboard', '-in']
        copyViaStdin(tool, args, url, (err2) => {
          if (err2) {
            process.stderr.write(`[CMD-COPY-URL] ERROR: Failed to copy to clipboard: ${err2.message}\n`)
            process.exit(1)
          }
          process.stdout.write(`[CMD-COPY-URL] URL copied to clipboard successfully\n`)
          process.exit(0)
        })
      })
  }
}

module.exports = { run }
