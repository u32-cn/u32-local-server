#!/usr/bin/env node

// SEA（Node 单可执行应用）资源抽象层：
// - SEA 模式：所有静态资源（public/、docs/）打包嵌入可执行文件，经 sea.getResource() 读取
// - node 直跑模式（npm 全局包 / 源码运行）：资源留在磁盘，按 __dirname 相对路径读取
// 通过 process.env.U32_LS_SEA === '1' 由打包脚本判定（SEA 内置无 __dirname 可用目录概念，
// 打包时把该变量写进 bundle 顶部），并检测 sea.isSea() 双保险。

const fs = require('fs')
const path = require('path')

let seaIsSea = false
let seaGetAsset = null
try {
  const sea = require('node:sea')
  if (sea.isSea()) {
    seaIsSea = true
    seaGetAsset = (key) => sea.getAsset(key)
  }
} catch {
  // node:sea 在低版本不存在，走磁盘模式
}

const IS_SEA = seaIsSea

// 嵌入资源的 key 规范：路径用 / 分隔，前缀 assets/
function assetKey(rel) {
  return 'assets/' + String(rel).replace(/\\/g, '/')
}

// 读包内资源：优先 SEA 嵌入，回退磁盘（node 直跑模式）
// 返回 Buffer；磁盘模式文件不存在返回 null（让调用方走原有 404 逻辑）
function readAsset(rel, diskBase) {
  if (seaGetAsset) {
    try {
      return Buffer.from(seaGetAsset(assetKey(rel)))
    } catch {
      return null
    }
  }
  const filePath = path.join(diskBase, rel)
  try {
    return fs.readFileSync(filePath)
  } catch {
    return null
  }
}

// 磁盘模式判断文件是否存在（SEA 模式资源恒在，按 ASSET 白名单判断即可）
function assetExists(rel, diskBase) {
  if (seaGetAsset) {
    try {
      seaGetAsset(assetKey(rel))
      return true
    } catch {
      return false
    }
  }
  return fs.existsSync(path.join(diskBase, rel))
}

module.exports = { IS_SEA, readAsset, assetExists, assetKey }
