// u32-ls gen-dir-listing <dir> [--deep] [--prune-if <文件名>]...：为目录预生成静态清单实体文件 .u32-dir.json
// 供 GitHub Pages / OSS 等静态托管使用，与动态端点同格式（docs/readme/dir-listing.md）
// 覆写既有实体文件时保留原 created、刷新 updated（json-file-format.md 规范）
// --prune-if：边界文件机制（可重复传，任一命中即剪）。目录内存在指定文件 → 该目录整体跳过：
// 不生成其清单、不递归子目录，且顺带删除其自身与子目录下已存在的清单实体文件（清存量）。
// 生成器不认识任何业务文件名——哪个文件当边界由调用方策略决定（如 u32-earth 资源自述）。

const fs = require('fs')
const path = require('path')
const { toPosix } = require('./posix-path')
const dirListing = require('./dir-listing')

function run(target, args) {
  const deep = args.includes('--deep')
  const pruneIf = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prune-if') {
      const name = args[i + 1]
      if (!name || name.startsWith('--')) {
        console.error('--prune-if 需要跟一个文件名')
        process.exit(1)
      }
      pruneIf.push(name)
      i++
    }
  }
  if (!target) {
    console.error('用法: u32-ls gen-dir-listing <dir> [--deep] [--prune-if <文件名>]...')
    process.exit(1)
  }
  const abs = path.resolve(target)
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    console.error('目录不存在或不是目录: ' + abs)
    process.exit(1)
  }

  /** 目录是否命中边界文件（--prune-if 任一命中即剪） */
  const isPruned = (d) => pruneIf.some((name) => fs.existsSync(path.join(d, name)))

  /** 递归删除 d 子树内所有清单实体文件（含 d 自己；边界目录整体跳过时清存量用） */
  function removeListingsDeep(d) {
    const entityFile = path.join(d, dirListing.FILE_NAME)
    if (fs.existsSync(entityFile)) {
      try {
        fs.rmSync(entityFile)
        console.log('[PRUNE] 移除边界目录的清单: ' + entityFile)
      } catch (err) {
        console.warn('[WARN] 移除失败: ' + entityFile + ' (' + err.message + ')')
      }
    }
    let names
    try {
      names = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of names) {
      if (e.isDirectory()) removeListingsDeep(path.join(d, e.name))
    }
  }

  // 收集待处理目录；--deep 递归子目录，不可读目录跳过；--prune-if 命中目录整体跳过（不生成、不递归）
  const dirs = []
  ;(function walk(d) {
    if (isPruned(d)) {
      // 边界目录：目录即整体，删掉其自身与内部全部存量清单，不再下钻
      removeListingsDeep(d)
      return
    }
    dirs.push(d)
    if (!deep) return
    let names
    try {
      names = fs.readdirSync(d, { withFileTypes: true })
    } catch (err) {
      console.warn('[SKIP] 读取目录失败: ' + d + ' (' + err.message + ')')
      return
    }
    for (const e of names) {
      if (!e.isDirectory()) continue
      const sub = path.join(d, e.name)
      try {
        fs.readdirSync(sub)
      } catch {
        console.warn('[SKIP] 子目录不可读: ' + sub)
        continue
      }
      walk(sub)
    }
  })(abs)

  let written = 0
  for (const d of dirs) {
    const dirPosix = toPosix(d)
    const entityFile = path.join(d, dirListing.FILE_NAME)
    let created
    if (fs.existsSync(entityFile)) {
      try {
        const prev = JSON.parse(fs.readFileSync(entityFile, 'utf-8'))
        created = prev && prev.meta && prev.meta.created
      } catch {
        console.warn('[WARN] 既有清单文件不可解析，将重建 created: ' + entityFile)
      }
    }
    const listing = dirListing.buildStaticListing(dirPosix, { created })
    try {
      fs.writeFileSync(entityFile, JSON.stringify(listing, null, 2) + '\n', 'utf-8')
    } catch (err) {
      console.error('[FAIL] 写入失败: ' + entityFile + ' (' + err.message + ')')
      process.exitCode = 1
      continue
    }
    written++
    console.log('[OK] ' + entityFile + ' (' + listing.data.entries.length + ' entries)')
  }
  console.log('完成：生成 ' + written + '/' + dirs.length + ' 份清单' + (process.exitCode ? '（存在失败项）' : ''))
}

module.exports = { run }
