#!/usr/bin/env node

// Windows 系统托盘入口（`u32-ls tray`）：
// 拉起 scripts/tray.ps1（Windows 自带 PowerShell + .NET NotifyIcon，零第三方依赖）。
// - node 模式：从源码包 scripts/ 与 resources/ 取脚本和图标
// - SEA 模式：从嵌入资源 readAsset 取出，释放到用户目录后启动
// 仅 Windows 生效；Linux/macOS 直接提示并返回。

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const seaAssets = require('./sea-assets')

const RUNTIME_DIR = path.join(os.homedir(), '.u32-local-server', 'runtime')
const TRAY_PS = 'u32-local-server-tray.ps1'
const TRAY_ICO = 'ls.ico'
const TRAY_ICO_GRAY = 'ls-gray.ico'
const TRAY_VBS = 'u32-local-server-tray-launch.vbs'

// tray 进程互斥锁：避免 launch（快捷方式）与安装 [Run] 各拉一个托盘图标
const TRAY_LOCK = path.join(RUNTIME_DIR, 'tray.lock')

function isTrayAlive() {
  try {
    const pid = parseInt(fs.readFileSync(TRAY_LOCK, 'utf8').trim(), 10)
    if (!pid) return false
    process.kill(pid, 0) // Windows 上 signal 0 探测进程存活
    return true
  } catch {
    return false
  }
}

function run() {
  if (process.platform !== 'win32') {
    process.stdout.write('[CMD-TRAY] System tray is Windows-only. Linux/macOS: use "u32-ls start" + browser.\n')
    return
  }

  // 已有托盘进程在跑就直接返回，避免重复图标（launch 与安装 [Run] 都可能触发）
  if (isTrayAlive()) {
    process.stdout.write('[CMD-TRAY] Tray already running.\n')
    return
  }

  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true })

    const diskBase = path.join(__dirname, '..')
    const psSrc = seaAssets.readAsset('scripts/tray.ps1', diskBase)
    const icoSrc = seaAssets.readAsset('resources/ls.ico', diskBase)
    const icoGraySrc = seaAssets.readAsset('resources/ls-gray.ico', diskBase)
    if (psSrc === null || icoSrc === null || icoGraySrc === null) {
      process.stderr.write('[CMD-TRAY] Error: tray assets missing (scripts/tray.ps1, resources/ls.ico, resources/ls-gray.ico).\n')
      process.exit(1)
      return
    }

    const psPath = path.join(RUNTIME_DIR, TRAY_PS)
    const icoPath = path.join(RUNTIME_DIR, TRAY_ICO)
    const icoGrayPath = path.join(RUNTIME_DIR, TRAY_ICO_GRAY)
    const vbsPath = path.join(RUNTIME_DIR, TRAY_VBS)
    // PowerShell 5.1 默认按 ANSI 读无 BOM 文件，中文注释会乱码并破坏语法；
    // 写 UTF-8 BOM 可让 PS 5.1 / 7 都正确识别 UTF-8
    fs.writeFileSync(psPath, '\ufeff' + psSrc, 'utf8')
    fs.writeFileSync(icoPath, icoSrc)
    fs.writeFileSync(icoGrayPath, icoGraySrc)

    // 用 wscript 启动（项目 register 已验证该方式在托管会话里能常驻，
    // node 直接 spawn powershell.exe 会被会话进程回收）
    // wscript 按 ANSI 读 .vbs，路径全 ASCII，UTF-16LE+BOM 与项目其他 VBS 一致
    // VBS 字符串里反斜杠不是转义符，不能用 JSON.stringify（会双写路径分隔符）
    const dq = s => '"' + s + '"'
    const psExe = (process.env.WINDIR || 'C:\\Windows') + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    const port = require('./config').loadConfig().port
    const parts = [
      dq(psExe), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', dq(psPath), '-ExePath', dq(process.execPath),
      '-IconPath', dq(icoPath), '-GrayIconPath', dq(icoGrayPath),
      '-Port', String(port), '-LockPath', dq(TRAY_LOCK),
    ]
    // node 直跑模式：process.execPath 是 node.exe，须显式带上入口脚本
    if (!seaAssets.IS_SEA) {
      parts.push('-EntryPath', dq(path.join(__dirname, 'index.js')))
    }
    const cmdLine = parts.join(' ')
    // VBS 字符串里的双引号必须写成两个双引号；整条命令行要作为单个字符串传给 ws.Run，
    // 否则 `"exe" -arg` 会被解析成字符串 + 裸标识符 → 800A0401「语句未结束」
    const vbsCmd = '"' + cmdLine.replace(/"/g, '""') + '"'
    const vbs = `Set ws = CreateObject("Wscript.Shell")\nws.Run ${vbsCmd}, 0, False\n`
    fs.writeFileSync(vbsPath, '\ufeff' + vbs, 'utf16le')

    const child = spawn('wscript.exe', [vbsPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()

    process.stdout.write('[CMD-TRAY] Tray icon started. Right-click for start/stop/open.\n')
  } catch (err) {
    process.stderr.write(`[CMD-TRAY] Error: ${err.message}\n`)
    process.exit(1)
  }
}

module.exports = { run }
