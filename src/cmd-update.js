#!/usr/bin/env node

// `u32-ls update` 命令入口：Windows 安装包自动升级（下载与安装解耦）
// 用法：u32-ls update          查新版 → 自动下载缓存 → 询问是否立即安装
//       u32-ls update -y       免确认：有新版就下载并直接拉起安装向导
//       u32-ls update --check  只查版本与缓存状态，不下载
// 缓存约束：~/.u32-local-server/update/ 恒只有一个最新版安装包（update.js 内自动清理）

const readline = require('readline')
const update = require('./update')

function ask(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(text, a => { rl.close(); resolve(a) }))
}

async function run(args) {
  const flags = args || []
  const assumeYes = flags.includes('-y') || flags.includes('--yes')
  const checkOnly = flags.includes('--check')

  if (process.platform !== 'win32') {
    process.stdout.write('[UPDATE] Installer update is Windows-only. Linux/macOS: npm i -g u32-local-server@latest\n')
    return
  }

  process.stdout.write('[UPDATE] Checking latest release...\n')
  const s = await update.check(false)

  if (!s.updateAvailable) {
    process.stdout.write(`[UPDATE] Already up to date (current ${s.current}, latest ${s.latest}).\n`)
    return
  }
  process.stdout.write(`[UPDATE] ${s.current} -> ${s.latest}\n`)

  if (checkOnly) {
    process.stdout.write(`[UPDATE] Cache: ${s.downloaded ? 'installer ready (' + s.assetName + ')' : 'not downloaded yet'}\n`)
    return
  }

  if (!s.downloaded) {
    process.stdout.write('[UPDATE] Downloading...\n')
    const done = await update.downloadLatest()
    if (!done.downloaded) {
      process.stderr.write(`[UPDATE] Download failed: ${done.error || 'unknown'}\n`)
      process.exit(1)
    }
    process.stdout.write(`[UPDATE] Saved: ${done.file}\n`)
  } else {
    process.stdout.write(`[UPDATE] Installer already cached: ${s.assetName}\n`)
  }

  if (!assumeYes) {
    const answer = await ask('Launch installer now? [Y/n] ')
    if (/^n(o)?$/i.test(answer.trim())) {
      process.stdout.write('[UPDATE] Installer cached. Run "u32-ls update" or use the home page to install later.\n')
      return
    }
  }

  const r = update.install()
  if (r.ok) {
    process.stdout.write('[UPDATE] Installer launched. The wizard will stop service/tray and upgrade.\n')
  } else {
    process.stderr.write(`[UPDATE] Launch failed: ${r.error}\n`)
    process.exit(1)
  }
}

module.exports = { run }
