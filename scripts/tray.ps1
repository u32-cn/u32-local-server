# u32-local-server Windows 系统托盘助手（Windows-only）
# 由 `u32-ls tray` / `u32-ls launch` 拉起；服务命令走 exe 绝对路径，不依赖 PATH。
# 图标状态：服务运行中=激活（红 LS），未运行=置灰（灰 LS），每 1.5s 探测端口切换。
# 菜单：启动服务 / 停止服务 / 查看网页（只开浏览器，不启动服务）/ 退出

param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [Parameter(Mandatory = $true)][string]$IconPath,
  [Parameter(Mandatory = $true)][string]$GrayIconPath,
  [int]$Port = 19527,
  [string]$LockPath = '',
  [string]$EntryPath = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$exe = $ExePath
# 互斥锁：写自身 PID，供 launch 判断托盘是否已存在
if ($LockPath -ne '') { [System.IO.File]::WriteAllText($LockPath, "$PID") }
# SEA 模式 $EntryPath 为空：直接执行 exe；node 直跑模式：node.exe + 入口脚本
function Invoke-U32 {
  param([string]$Command)
  if ($EntryPath -ne '') {
    Start-Process -FilePath $exe -ArgumentList @($EntryPath, $Command) -WindowStyle Hidden
  } else {
    Start-Process -FilePath $exe -ArgumentList $Command -WindowStyle Hidden
  }
}

# 打开网页：只启动默认浏览器，绝不启动服务（服务没开就是打不开）
function Open-WebPage {
  Start-Process "http://127.0.0.1:$Port/"
}

# 服务状态：TCP 探测本机端口，超时 300ms
function Test-U32Service {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(300, $false)) { return $false }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# 两个图标常驻内存，按状态切换
$iconActive = New-Object System.Drawing.Icon($IconPath)
$iconGray = New-Object System.Drawing.Icon($GrayIconPath)

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon = if (Test-U32Service) { $iconActive } else { $iconGray }
$icon.Text = 'u32-local-server'
$icon.Visible = $true

$script:lastRunning = $null

# 右键菜单（原生 ContextMenu，避免高 DPI 下 ContextMenuStrip 错位）
$menu = New-Object System.Windows.Forms.ContextMenu

$itemStart = New-Object System.Windows.Forms.MenuItem('启动服务')
$itemStart.Add_Click({ Invoke-U32 -Command start })
$menu.MenuItems.Add($itemStart) | Out-Null

$itemStop = New-Object System.Windows.Forms.MenuItem('停止服务')
$itemStop.Add_Click({ Invoke-U32 -Command stop })
$menu.MenuItems.Add($itemStop) | Out-Null

$menu.MenuItems.Add('-') | Out-Null

$itemOpen = New-Object System.Windows.Forms.MenuItem('查看网页')
$itemOpen.Add_Click({ Open-WebPage })
$menu.MenuItems.Add($itemOpen) | Out-Null

$menu.MenuItems.Add('-') | Out-Null

$itemExit = New-Object System.Windows.Forms.MenuItem('退出')
$itemExit.Add_Click({
    $timer.Stop()
    $icon.Visible = $false
    $icon.Dispose()
    $iconActive.Dispose()
    $iconGray.Dispose()
    if ($LockPath -ne '' -and (Test-Path $LockPath)) { Remove-Item $LockPath -Force }
    [System.Windows.Forms.Application]::Exit()
  })
$menu.MenuItems.Add($itemExit) | Out-Null

$icon.ContextMenu = $menu

# 左键双击也只打开网页
$icon.Add_DoubleClick({ Open-WebPage })

# 定时探测服务状态并切换图标
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1500
$timer.Add_Tick({
    $running = Test-U32Service
    if ($running -ne $script:lastRunning) {
      $script:lastRunning = $running
      if ($running) {
        $icon.Icon = $iconActive
        $icon.Text = 'u32-local-server (运行中)'
      } else {
        $icon.Icon = $iconGray
        $icon.Text = 'u32-local-server (未运行)'
      }
    }
  })
$timer.Start()

# 隐藏窗口承载消息循环，保持托盘进程常驻
$form = New-Object System.Windows.Forms.Form
$form.WindowState = 'Minimized'
$form.ShowInTaskbar = $false
$form.Opacity = 0
$form.FormBorderStyle = 'None'

[System.Windows.Forms.Application]::Run($form)
