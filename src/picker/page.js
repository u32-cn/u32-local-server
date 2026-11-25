#!/usr/bin/env node

// picker 页面骨架：只输出 HTML 结构与 window.__PICKER_CFG__，
// 样式 / 图标 / 交互分别由 style.css、icons.svg、client/*.js 承担（资源 URL 由客户端按 location 拼，天然兼容反代前缀）

const { escapeHtml } = require('../utils')
const { getRoots } = require('./api')

// 三种模式：打开文件 / 选择文件夹 / 另存为
const MODES = {
  'open-file': { title: '打开', okLabel: '打开(O)', fileLabel: '文件名(N):', canType: true, dirOnly: false },
  'open-dir': { title: '选择文件夹', okLabel: '选择文件夹', fileLabel: '文件夹(F):', canType: false, dirOnly: true },
  'save-file': { title: '另存为', okLabel: '保存(S)', fileLabel: '文件名(N):', canType: true, dirOnly: false },
}

function parseOptions(url) {
  const modeRaw = url.searchParams.get('mode') || 'open-file'
  const mode = Object.prototype.hasOwnProperty.call(MODES, modeRaw) ? modeRaw : 'open-file'
  return {
    mode,
    type: url.searchParams.get('type') || '',
    allowEmpty: url.searchParams.get('allowEmpty') === '1',
    chrome: url.searchParams.get('chrome') !== '0',
  }
}

function serve(req, res, config) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('Method Not Allowed')
  }
  const url = new URL(req.url, `http://${req.headers.host}`)
  const opts = parseOptions(url)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(renderPage(config, opts))
}

function renderPage(config, opts) {
  const m = MODES[opts.mode]
  const cfg = {
    mode: opts.mode,
    type: opts.type,
    allowEmpty: opts.allowEmpty,
    chrome: opts.chrome,
    title: m.title,
    okLabel: m.okLabel,
    fileLabel: m.fileLabel,
    canType: m.canType,
    dirOnly: m.dirOnly,
    roots: getRoots(config),
  }
  // 注入 JSON：转义 </ 防止提前结束脚本；< 转义为 \u003c 同样有效
  const cfgJson = JSON.stringify(cfg).replace(/</g, '\\u003c')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(m.title)}</title>
<script>
(function () {
  var base = location.pathname.replace(/\\/+$/, '') + '/'
  window.__PICKER_ASSET_BASE__ = base
  var link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = base + 'style.css'
  document.head.appendChild(link)
})()
</script>
</head>
<body class="picker-body${opts.chrome ? '' : ' no-chrome'}" data-u32-name="picker-body">
<div class="dialog" data-u32-name="dialog">
  <div class="titlebar" data-u32-name="titlebar">
    <svg class="ico titlebar-icon" data-icon="window" aria-hidden="true"></svg>
    <span class="titlebar-text" data-u32-name="titlebar-text">${escapeHtml(m.title)}</span>
    <button class="close-btn" id="dlgClose" data-u32-name="titlebar-close" title="关闭">✕</button>
  </div>
  <div class="nav" data-u32-name="nav">
    <button class="nav-btn" id="backBtn" data-u32-name="nav-back" title="后退" disabled><svg class="ico" data-icon="back" aria-hidden="true"></svg></button>
    <button class="nav-btn" id="fwdBtn" data-u32-name="nav-fwd" title="前进" disabled><svg class="ico" data-icon="forward" aria-hidden="true"></svg></button>
    <button class="nav-btn" id="upBtn" data-u32-name="nav-up" title="向上" disabled><svg class="ico" data-icon="up" aria-hidden="true"></svg></button>
    <div class="addr-wrap" data-u32-name="addr">
      <svg class="ico addr-folder" data-icon="folder-addr" aria-hidden="true"></svg>
      <div class="addr-view" id="addrView" data-u32-name="addr-view">
        <div class="crumbs" id="crumbs" data-u32-name="addr-crumbs"></div>
        <button class="addr-drop" id="addrDrop" data-u32-name="addr-drop" title="地址栏下拉"><svg class="ico" data-icon="chevron-down" aria-hidden="true"></svg></button>
      </div>
      <input class="addr-input" id="addrInput" data-u32-name="addr-input" type="text" spellcheck="false" autocomplete="off" hidden>
    </div>
    <button class="nav-btn" id="refreshBtn" data-u32-name="nav-refresh" title="刷新"><svg class="ico" data-icon="refresh" aria-hidden="true"></svg></button>
    <div class="search-wrap" data-u32-name="search">
      <svg class="ico search-icon" data-icon="search" aria-hidden="true"></svg>
      <input id="searchInput" data-u32-name="search-input" type="text" spellcheck="false" autocomplete="off" placeholder="在当前目录中搜索">
    </div>
  </div>
  <div class="toolbar" data-u32-name="toolbar">
    <button class="tool-btn" id="organizeBtn" data-u32-name="toolbar-organize">组织 <svg class="ico chev" data-icon="chevron-down" aria-hidden="true"></svg></button>
    <button class="tool-btn" id="newFolderBtn" data-u32-name="toolbar-new-folder">新建文件夹</button>
    <div class="tool-spacer" data-u32-name="toolbar-spacer"></div>
    <button class="tool-btn" id="viewBtn" data-u32-name="toolbar-view">视图 <svg class="ico chev" data-icon="chevron-down" aria-hidden="true"></svg></button>
    <button class="tool-btn help-btn" id="helpBtn" data-u32-name="toolbar-help" title="帮助">?</button>
  </div>
  <div class="content" data-u32-name="content">
    <div class="sidebar" id="sidebar" data-u32-name="sidebar">
      <div class="side-group" data-u32-name="sidebar-recent-group">
        <div class="side-group-title" data-u32-name="sidebar-recent-title">最近访问</div>
        <div class="side-list" id="recentList" data-u32-name="sidebar-recent-list"></div>
        <div class="side-hint" id="recentHint" data-u32-name="sidebar-recent-hint" hidden>暂无访问记录</div>
      </div>
      <div class="side-sep" data-u32-name="sidebar-sep"></div>
      <div class="side-group" data-u32-name="sidebar-roots-group">
        <div class="side-group-title" data-u32-name="sidebar-roots-title">
          <span>允许的目录</span>
          <button class="gear-btn" id="configBtn" data-u32-name="sidebar-config" title="添加允许目录（打开授权对话框）"><svg class="ico" data-icon="gear" aria-hidden="true"></svg></button>
        </div>
        <div class="side-list" id="rootsList" data-u32-name="sidebar-roots-list"></div>
      </div>
    </div>
    <div class="main" data-u32-name="main">
      <div class="list-head" id="listHead" data-u32-name="list-head">
        <div class="lh-cell lh-icon" data-u32-name="list-head-icon"></div>
        <div class="lh-cell lh-name" data-col="name" data-u32-name="list-head-name">名称<span class="sort-ind"></span></div>
        <div class="lh-cell lh-mtime" data-col="mtime" data-u32-name="list-head-mtime">修改日期<span class="sort-ind"></span></div>
        <div class="lh-cell lh-type" data-col="type" data-u32-name="list-head-type">类型<span class="sort-ind"></span></div>
        <div class="lh-cell lh-size" data-col="size" data-u32-name="list-head-size">大小<span class="sort-ind"></span></div>
      </div>
      <div class="list-wrap" id="listWrap" data-u32-name="list-wrap">
        <div class="list-body" id="listBody" data-u32-name="list-body"></div>
        <div class="empty-pane" id="emptyPane" data-u32-name="empty-pane" hidden>此文件夹为空</div>
      </div>
    </div>
  </div>
  <div class="foot" data-u32-name="foot">
    <div class="foot-row1" data-u32-name="foot-row1">
      <label class="foot-label" for="filename" data-u32-name="foot-label">${escapeHtml(m.fileLabel)}</label>
      <input class="filename-input" id="filename" data-u32-name="foot-filename" type="text" spellcheck="false" autocomplete="off">
      <button class="filename-drop" id="filenameDrop" data-u32-name="foot-filename-drop" title="最近使用的文件名"><svg class="ico" data-icon="chevron-down" aria-hidden="true"></svg></button>
      <select class="filetype-select" id="filetype" data-u32-name="foot-filetype" title="文件类型"></select>
    </div>
    <div class="foot-row2" data-u32-name="foot-row2">
      <button class="dlg-btn primary" id="okBtn" data-u32-name="foot-ok">${escapeHtml(m.okLabel)}</button>
      <button class="dlg-btn" id="cancelBtn" data-u32-name="foot-cancel">取消</button>
    </div>
  </div>
</div>
<div class="menu-layer" id="menuLayer" data-u32-name="menu-layer" hidden></div>
<div class="modal-layer" id="modalLayer" data-u32-name="modal-layer" hidden></div>
<div class="sprite" id="iconSprite" data-u32-name="icon-sprite" hidden></div>
<script>window.__PICKER_CFG__ = ${cfgJson}</script>
<script>
(function () {
  var s = document.createElement('script')
  s.type = 'module'
  s.src = window.__PICKER_ASSET_BASE__ + 'client/main.js'
  document.body.appendChild(s)
})()
</script>
</body>
</html>`
}

module.exports = { serve, renderPage, parseOptions, MODES }
