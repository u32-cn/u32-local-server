const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const PROJECT_DIR = path.resolve(__dirname, '..')
const VBS_NAME = 'u32-local-server-hidden.vbs'
const OPEN_VBS_NAME = 'u32-local-server-open.vbs'
const COPY_URL_VBS_NAME = 'u32-local-server-copy-url.vbs'
const SERVICE_NAME = 'u32-local-server'

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const FILE_SHELL_KEY = 'HKCU\\Software\\Classes\\*\\shell\\U32Open'
const DIR_SHELL_KEY = 'HKCU\\Software\\Classes\\Directory\\shell\\U32Open'
const DIR_BG_SHELL_KEY = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\U32Open'
const FILE_COPY_URL_KEY = 'HKCU\\Software\\Classes\\*\\shell\\U32CopyUrl'
const DIR_COPY_URL_KEY = 'HKCU\\Software\\Classes\\Directory\\shell\\U32CopyUrl'
const DIR_BG_COPY_URL_KEY = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\U32CopyUrl'

function getEntryPath() {
  return path.join(PROJECT_DIR, 'src', 'index.js')
}

// 注册时解析绝对 node 路径，避免开机环境 PATH 不含 node/npx 导致自启失败
function getNodePath() {
  return process.execPath
}

// 从 npx 缓存运行时安装会被缓存清理带走，给出警告
function warnIfNpxCache() {
  const p = PROJECT_DIR
  if (p.includes(`${path.sep}.npm${path.sep}_npx`) || p.includes(`${path.sep}_npx${path.sep}`)) {
    process.stdout.write('[CMD-SERVICE] Warning: running from npx cache, autostart will break after cache cleanup.\n')
    process.stdout.write('[CMD-SERVICE] Warning: consider "npm i -g u32-local-server" then re-run register.\n')
  }
}

function getVbsPath() {
  return path.join(PROJECT_DIR, VBS_NAME)
}

function getVbsContent() {
  const entryPath = getEntryPath()
  const nodePath = getNodePath()
  return `Set ws = CreateObject("Wscript.Shell")
Dim nodeCmd
nodeCmd = Chr(34) & "${nodePath}" & Chr(34) & " " & Chr(34) & "${entryPath}" & Chr(34) & " start"
ws.Run nodeCmd, 0, False
`
}

function getOpenVbsPath() {
  return path.join(PROJECT_DIR, OPEN_VBS_NAME)
}

function getOpenVbsContent() {
  const entryPath = getEntryPath()
  const nodePath = getNodePath()
  return `On Error Resume Next
Set ws = CreateObject("Wscript.Shell")
If WScript.Arguments.Count = 0 Then
  ws.Popup "No arguments provided", 3, "u32-ls Error", 16
  WScript.Quit 1
End If
Dim nodeCmd
nodeCmd = Chr(34) & "${nodePath}" & Chr(34) & " " & Chr(34) & "${entryPath}" & Chr(34) & " open " & Chr(34) & WScript.Arguments(0) & Chr(34)
ws.Run nodeCmd, 0, False
If Err.Number <> 0 Then
  ws.Popup "Error " & Err.Number & ": " & Err.Description & vbCrLf & "Command: " & nodeCmd, 5, "u32-ls Error", 16
End If
`
}

function getCopyUrlVbsPath() {
  return path.join(PROJECT_DIR, COPY_URL_VBS_NAME)
}

function getCopyUrlVbsContent() {
  const entryPath = getEntryPath()
  const nodePath = getNodePath()
  return `On Error Resume Next
Set ws = CreateObject("Wscript.Shell")
If WScript.Arguments.Count = 0 Then
  ws.Popup "No arguments provided", 3, "u32-ls Error", 16
  WScript.Quit 1
End If
Dim entryPath, nodeCmd
entryPath = "${entryPath}"
nodeCmd = Chr(34) & "${nodePath}" & Chr(34) & " " & Chr(34) & entryPath & Chr(34) & " copy-url " & Chr(34) & WScript.Arguments(0) & Chr(34)
ws.Run nodeCmd, 0, True
If Err.Number <> 0 Then
  ws.Popup "Error " & Err.Number & ": " & Err.Description & vbCrLf & "Command: " & nodeCmd, 5, "u32-ls Error", 16
End If
`
}

function winRegister() {
  process.stdout.write('[CMD-SERVICE] Starting Windows service registration...\n')
  warnIfNpxCache()
  const vbsPath = getVbsPath()
  process.stdout.write(`[CMD-SERVICE] Creating VBS script: ${vbsPath}\n`)
  // wscript 按 ANSI（GBK）读取 .vbs，UTF-8 写入的中文路径会乱码导致自启失效；
  // UTF-16LE + BOM 是 wscript 明确支持的 Unicode 形式
  fs.writeFileSync(vbsPath, '\ufeff' + getVbsContent(), 'utf16le')

  const openVbsPath = getOpenVbsPath()
  process.stdout.write(`[CMD-SERVICE] Creating open VBS script: ${openVbsPath}\n`)
  fs.writeFileSync(openVbsPath, '\ufeff' + getOpenVbsContent(), 'utf16le')

  const copyUrlVbsPath = getCopyUrlVbsPath()
  process.stdout.write(`[CMD-SERVICE] Creating copy-url VBS script: ${copyUrlVbsPath}\n`)
  fs.writeFileSync(copyUrlVbsPath, '\ufeff' + getCopyUrlVbsContent(), 'utf16le')

  process.stdout.write(`[CMD-SERVICE] Registering autostart in registry: ${RUN_KEY}\n`)
  execSync(`reg add "${RUN_KEY}" /v U32LocalServer /t REG_SZ /d "wscript \\"${vbsPath}\\"" /f`)

  process.stdout.write(`[CMD-SERVICE] Registering file context menu: ${FILE_SHELL_KEY}\n`)
  execSync(`reg add "${FILE_SHELL_KEY}" /ve /d "通过浏览器打开(&W)" /f`)
  execSync(`reg add "${FILE_SHELL_KEY}\\command" /ve /d "wscript \\"${openVbsPath}\\" %1" /f`)

  process.stdout.write(`[CMD-SERVICE] Registering directory context menu: ${DIR_SHELL_KEY}\n`)
  execSync(`reg add "${DIR_SHELL_KEY}" /ve /d "通过浏览器打开(&W)" /f`)
  execSync(`reg add "${DIR_SHELL_KEY}\\command" /ve /d "wscript \\"${openVbsPath}\\" %V" /f`)

  process.stdout.write(`[CMD-SERVICE] Registering directory background context menu: ${DIR_BG_SHELL_KEY}\n`)
  execSync(`reg add "${DIR_BG_SHELL_KEY}" /ve /d "通过浏览器打开(&W)" /f`)
  execSync(`reg add "${DIR_BG_SHELL_KEY}\\command" /ve /d "wscript \\"${openVbsPath}\\" %V" /f`)

  process.stdout.write(`[CMD-SERVICE] Registering file copy-url menu: ${FILE_COPY_URL_KEY}\n`)
  execSync(`reg add "${FILE_COPY_URL_KEY}" /ve /d "复制本地服务地址(&X)" /f`)
  execSync(`reg add "${FILE_COPY_URL_KEY}\\command" /ve /d "wscript \\"${copyUrlVbsPath}\\" %1" /f`)

  process.stdout.write(`[CMD-SERVICE] Registering directory copy-url menu: ${DIR_COPY_URL_KEY}\n`)
  execSync(`reg add "${DIR_COPY_URL_KEY}" /ve /d "复制本地服务地址(&X)" /f`)
  execSync(`reg add "${DIR_COPY_URL_KEY}\\command" /ve /d "wscript \\"${copyUrlVbsPath}\\" %V" /f`)

  process.stdout.write(`[CMD-SERVICE] Registering directory background copy-url menu: ${DIR_BG_COPY_URL_KEY}\n`)
  execSync(`reg add "${DIR_BG_COPY_URL_KEY}" /ve /d "复制本地服务地址(&X)" /f`)
  execSync(`reg add "${DIR_BG_COPY_URL_KEY}\\command" /ve /d "wscript \\"${copyUrlVbsPath}\\" %V" /f`)

  process.stdout.write('[CMD-SERVICE] Windows service registered successfully (autostart + context menu)\n')
}

function winUnregister() {
  process.stdout.write('[CMD-SERVICE] Starting Windows service unregistration...\n')
  process.stdout.write(`[CMD-SERVICE] Removing autostart from registry: ${RUN_KEY}\n`)
  try { execSync(`reg delete "${RUN_KEY}" /v U32LocalServer /f`) } catch {}
  process.stdout.write(`[CMD-SERVICE] Removing file context menu: ${FILE_SHELL_KEY}\n`)
  try { execSync(`reg delete "${FILE_SHELL_KEY}" /f`) } catch {}
  process.stdout.write(`[CMD-SERVICE] Removing directory context menu: ${DIR_SHELL_KEY}\n`)
  try { execSync(`reg delete "${DIR_SHELL_KEY}" /f`) } catch {}
  process.stdout.write(`[CMD-SERVICE] Removing directory background context menu: ${DIR_BG_SHELL_KEY}\n`)
  try { execSync(`reg delete "${DIR_BG_SHELL_KEY}" /f`) } catch {}
  process.stdout.write(`[CMD-SERVICE] Removing file copy-url menu: ${FILE_COPY_URL_KEY}\n`)
  try { execSync(`reg delete "${FILE_COPY_URL_KEY}" /f`) } catch {}
  process.stdout.write(`[CMD-SERVICE] Removing directory copy-url menu: ${DIR_COPY_URL_KEY}\n`)
  try { execSync(`reg delete "${DIR_COPY_URL_KEY}" /f`) } catch {}
  process.stdout.write(`[CMD-SERVICE] Removing directory background copy-url menu: ${DIR_BG_COPY_URL_KEY}\n`)
  try { execSync(`reg delete "${DIR_BG_COPY_URL_KEY}" /f`) } catch {}

  const vbsPath = getVbsPath()
  if (fs.existsSync(vbsPath)) {
    process.stdout.write(`[CMD-SERVICE] Removing VBS script: ${vbsPath}\n`)
    fs.unlinkSync(vbsPath)
  }

  const openVbsPath = getOpenVbsPath()
  if (fs.existsSync(openVbsPath)) {
    process.stdout.write(`[CMD-SERVICE] Removing open VBS script: ${openVbsPath}\n`)
    fs.unlinkSync(openVbsPath)
  }

  const copyUrlVbsPath = getCopyUrlVbsPath()
  if (fs.existsSync(copyUrlVbsPath)) {
    process.stdout.write(`[CMD-SERVICE] Removing copy-url VBS script: ${copyUrlVbsPath}\n`)
    fs.unlinkSync(copyUrlVbsPath)
  }

  process.stdout.write('[CMD-SERVICE] Windows service unregistered successfully\n')
  process.stdout.write('[CMD-SERVICE] Note: running server (if any) is not stopped; use "u32-ls stop" to stop it.\n')
}

// ---- Linux (systemd) ----

// 经 sudo 调用时，服务应以真实用户运行（User=/HOME 指向发起者）
function resolveTargetUser() {
  if (process.getuid && process.getuid() === 0 && process.env.SUDO_USER) {
    const username = process.env.SUDO_USER
    let home = path.join('/home', username)
    try {
      const passwd = execSync(`getent passwd ${username}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
      const h = passwd.split(':')[5]
      if (h) home = h
    } catch {}
    return { username, home }
  }
  return { username: os.userInfo().username, home: os.homedir() }
}

function systemdAvailable() {
  try {
    execSync('command -v systemctl', { stdio: ['ignore', 'ignore', 'ignore'] })
  } catch {
    return false
  }
  // /run/systemd/system 仅在 systemd 为 1 号进程的用户态存在（WSL 未开启 systemd 时缺失）
  return fs.existsSync('/run/systemd/system')
}

function unsupportedMessage() {
  const platform = process.platform
  if (platform === 'darwin') {
    process.stderr.write('[CMD-SERVICE] Error: macOS is not supported yet (consider launchd for autostart).\n')
    process.stderr.write('[CMD-SERVICE] 错误：暂不支持 macOS 开机自启注册（可自行配置 launchd）。\n')
    return
  }
  if (platform === 'linux') {
    process.stderr.write('[CMD-SERVICE] Error: systemd is not available on this system (no /run/systemd/system).\n')
    process.stderr.write('[CMD-SERVICE] 错误：当前系统 systemd 不可用，无法注册开机自启。\n')
    process.stderr.write('[CMD-SERVICE] Hint (WSL): add [boot]\\nsystemd=true to /etc/wsl.conf and restart WSL (wsl --shutdown).\n')
    process.stderr.write('[CMD-SERVICE] 提示（WSL）：在 /etc/wsl.conf 添加 [boot] systemd=true 后执行 wsl --shutdown 重启。\n')
    return
  }
  process.stderr.write(`[CMD-SERVICE] Error: platform "${platform}" is not supported for register/unregister.\n`)
  process.stderr.write(`[CMD-SERVICE] 错误：平台 "${platform}" 暂不支持注册开机自启。\n`)
}

function getServiceContent() {
  const { username, home } = resolveTargetUser()
  const nodePath = getNodePath()
  const entryPath = getEntryPath()
  const pidFile = path.join(home, '.u32-local-server', 'server.pid')
  return `[Unit]
Description=U32 Local Server
After=network.target

[Service]
Type=forking
PIDFile=${pidFile}
ExecStart="${nodePath}" "${entryPath}" start
Restart=on-failure
RestartSec=3
User=${username}
Environment=HOME=${home}
Environment=PATH=${path.dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
`
}

function getServicePath() {
  return `/etc/systemd/system/${SERVICE_NAME}.service`
}

// 若已有手动启动的实例在跑，先停掉，避免 systemctl start 时 "already running"
function stopRunningInstance() {
  const pidFile = path.join(resolveTargetUser().home, '.u32-local-server', 'server.pid')
  if (!fs.existsSync(pidFile)) return
  let pid = 0
  try { pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10) } catch { return }
  if (!pid) return
  try { process.kill(pid, 0) } catch { return } // 不在运行
  try {
    execSync(`"${getNodePath()}" "${getEntryPath()}" stop`, { stdio: ['ignore', 'ignore', 'ignore'] })
    process.stdout.write(`[CMD-SERVICE] Stopped manually started instance (PID ${pid})\n`)
  } catch {}
}

function writeServiceFile(servicePath, content) {
  try {
    process.stdout.write('[CMD-SERVICE] Writing service file (direct)\n')
    fs.writeFileSync(servicePath, content)
    return
  } catch {}
  try {
    process.stdout.write('[CMD-SERVICE] Writing service file with sudo\n')
    execSync(`sudo tee ${servicePath} > /dev/null`, { input: content, stdio: ['pipe', 'pipe', 'inherit'] })
    return
  } catch {}
  process.stderr.write(`[CMD-SERVICE] Error: cannot write ${servicePath} (permission denied).\n`)
  process.stderr.write('[CMD-SERVICE] 错误：无权限写入服务文件，请使用 sudo 运行：sudo u32-ls register\n')
  process.exit(1)
}

function systemctl(cmd, opts = {}) {
  const sudo = opts.sudo ? 'sudo ' : ''
  execSync(`${sudo}systemctl ${cmd}`, { stdio: opts.inherit ? 'inherit' : ['ignore', 'ignore', 'pipe'] })
}

function linuxRegister() {
  process.stdout.write('[CMD-SERVICE] Starting Linux service registration...\n')
  warnIfNpxCache()
  const servicePath = getServicePath()
  process.stdout.write(`[CMD-SERVICE] Service file path: ${servicePath}\n`)
  const content = getServiceContent()
  process.stdout.write(`[CMD-SERVICE] ExecStart: ${content.match(/ExecStart=(.+)/)?.[1] || '(none)'}\n`)

  writeServiceFile(servicePath, content)
  process.stdout.write('[CMD-SERVICE] Service file created\n')

  process.stdout.write('[CMD-SERVICE] Running systemctl daemon-reload\n')
  try { systemctl('daemon-reload') } catch {}

  stopRunningInstance()

  let started = false
  try {
    process.stdout.write('[CMD-SERVICE] Enabling and starting service\n')
    systemctl(`enable --now ${SERVICE_NAME}`)
    started = true
  } catch {
    try {
      process.stdout.write('[CMD-SERVICE] Retrying with sudo\n')
      systemctl(`enable --now ${SERVICE_NAME}`, { sudo: true, inherit: true })
      started = true
    } catch {}
  }

  if (!started) {
    process.stderr.write(`[CMD-SERVICE] Error: failed to enable/start ${SERVICE_NAME}. Check: journalctl -u ${SERVICE_NAME} -n 20\n`)
    process.stderr.write(`[CMD-SERVICE] 错误：启用/启动服务失败，可运行 journalctl -u ${SERVICE_NAME} -n 20 查看日志。\n`)
    process.exit(1)
  }

  let active = false
  try {
    active = execSync(`systemctl is-active ${SERVICE_NAME}`).toString().trim() === 'active'
  } catch {}
  if (!active) {
    process.stderr.write(`[CMD-SERVICE] Error: service is not active. Check: journalctl -u ${SERVICE_NAME} -n 20\n`)
    process.stderr.write(`[CMD-SERVICE] 错误：服务未处于 active 状态，可运行 journalctl -u ${SERVICE_NAME} -n 20 查看日志。\n`)
    process.exit(1)
  }

  process.stdout.write(`[CMD-SERVICE] Service active: ${SERVICE_NAME} (systemctl status ${SERVICE_NAME})\n`)
  process.stdout.write('[CMD-SERVICE] Linux service registered and started successfully\n')
}

function linuxUnregister() {
  process.stdout.write('[CMD-SERVICE] Starting Linux service unregistration...\n')
  const servicePath = getServicePath()
  process.stdout.write(`[CMD-SERVICE] Service file path: ${servicePath}\n`)

  try {
    process.stdout.write('[CMD-SERVICE] Stopping and disabling service\n')
    systemctl(`stop ${SERVICE_NAME}`)
    systemctl(`disable ${SERVICE_NAME}`)
  } catch {
    try {
      process.stdout.write('[CMD-SERVICE] Retrying stop/disable with sudo\n')
      systemctl(`stop ${SERVICE_NAME}`, { sudo: true, inherit: true })
    } catch {}
    try {
      systemctl(`disable ${SERVICE_NAME}`, { sudo: true, inherit: true })
    } catch {}
  }

  try {
    process.stdout.write('[CMD-SERVICE] Removing service file\n')
    fs.unlinkSync(servicePath)
  } catch {
    try {
      execSync(`sudo rm -f ${servicePath}`, { stdio: 'inherit' })
    } catch {}
  }

  process.stdout.write('[CMD-SERVICE] Running systemctl daemon-reload\n')
  try { systemctl('daemon-reload') } catch {}

  if (fs.existsSync(servicePath)) {
    process.stderr.write(`[CMD-SERVICE] Error: failed to remove ${servicePath}\n`)
    process.stderr.write(`[CMD-SERVICE] 错误：服务文件 ${servicePath} 删除失败（可能需要 sudo 权限）。\n`)
    process.exit(1)
  }

  process.stdout.write('[CMD-SERVICE] Linux service unregistered successfully\n')
}

function run(argv) {
  const action = argv[0]
  if (!action || (action !== 'register' && action !== 'unregister')) {
    process.stderr.write('[CMD-SERVICE] Usage: u32-ls register   |   u32-ls unregister\n')
    process.exit(1)
  }

  const isWin = process.platform === 'win32'

  if (!isWin && !systemdAvailable()) {
    unsupportedMessage()
    process.exit(1)
  }

  process.stdout.write(`[CMD-SERVICE] Platform detected: ${isWin ? 'Windows' : 'Linux (systemd)'}\n`)
  process.stdout.write(`[CMD-SERVICE] Action: ${action}\n`)

  if (action === 'register') {
    isWin ? winRegister() : linuxRegister()
  } else {
    isWin ? winUnregister() : linuxUnregister()
  }
}

module.exports = { run, getVbsPath }
