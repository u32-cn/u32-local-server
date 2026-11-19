#!/usr/bin/env node

// 文件/文件夹选择器入口（Windows 对话框风格）
// 分层：
//   picker/api.js    → GET /picker/api/{roots,ls,stat}（只读，权限走 permission.js 允许列表）
//   picker/page.js   → GET /picker（HTML 骨架 + 注入 window.__PICKER_CFG__）
//   picker/assets.js → GET /picker/style.css、/picker/icons.svg、/picker/client/*.js
// 选中/取消经 postMessage 回传宿主（iframe 用 parent，弹窗用 opener 后自关）

const api = require('./picker/api')
const page = require('./picker/page')
const assets = require('./picker/assets')

function servePage(req, res, config) {
  return page.serve(req, res, config)
}

function serveApi(req, res, url, config) {
  return api.serve(req, res, url, config)
}

function serveAsset(req, res, url) {
  return assets.serve(req, res, url)
}

module.exports = { servePage, serveApi, serveAsset }
