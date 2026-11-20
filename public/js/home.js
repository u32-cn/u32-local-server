// 首页前端逻辑：运行时长本地跳动 + 5s 拉摘要定点替换 + 复制 / 服务注册 / 产物清理
// 约定：只替换文本节点与标签类，不重绘 DOM，折叠状态与选中文本不受轮询影响。

(function () {
  'use strict'

  var INIT = window.__INIT__ || {}
  var startedAt = Date.now() - (INIT.uptimeSec || 0) * 1000
  var polling = null
  var busy = false

  /* ---------- 工具 ---------- */
  function pad2(n) { return String(n).padStart(2, '0') }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.floor(sec || 0))
    var d = Math.floor(sec / 86400)
    var h = Math.floor((sec % 86400) / 3600)
    var m = Math.floor((sec % 3600) / 60)
    var s = sec % 60
    return (d > 0 ? d + 'd ' : '') + pad2(h) + ':' + pad2(m) + ':' + pad2(s)
  }

  function fmtBytes(n) {
    if (!Number.isFinite(n)) return '0 B'
    var units = ['B', 'KB', 'MB', 'GB', 'TB']
    var v = n
    var i = 0
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
    return (i === 0 ? String(Math.round(v)) : v.toFixed(v >= 100 ? 0 : 1)) + ' ' + units[i]
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

  function byK(key) { return document.querySelectorAll('[data-k="' + key + '"]') }

  function setText(key, text) {
    byK(key).forEach(function (el) { el.textContent = text })
  }

  function getJSON(url, opts) {
    return fetch(url, Object.assign({ cache: 'no-store' }, opts || {}))
      .then(function (r) { return r.ok ? r.json() : null })
      .catch(function () { return null })
  }

  function flash(btn, text) {
    if (!btn) return
    var old = btn.textContent
    var cls = btn.className
    btn.textContent = text
    btn.classList.add('done')
    setTimeout(function () { btn.textContent = old; btn.className = cls }, 1400)
  }

  function copyText(text, btn) {
    var done = function () { flash(btn, '已复制') }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done() })
      return
    }
    legacyCopy(text)
    done()
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) {}
    document.body.removeChild(ta)
  }

  /* ---------- 运行时长 ---------- */
  function tickUptime() {
    var text = fmtDuration((Date.now() - startedAt) / 1000)
    document.querySelectorAll('[data-live="uptime"]').forEach(function (el) { el.textContent = text })
  }

  /* ---------- 摘要渲染 ---------- */
  function applyService(svc) {
    if (!svc) return
    var auto = document.querySelector('[data-svc-wrap="autostart"]')
    if (auto) {
      auto.innerHTML = svc.autostart
        ? '<span class="tag tag-yes" data-svc="autostart">已注册</span>'
        : '<span class="tag tag-no" data-svc="autostart">未注册</span>'
    }
    var menu = document.querySelector('[data-svc-wrap="menu"]')
    if (menu) {
      menu.innerHTML = svc.contextMenu
        ? '<span class="tag tag-yes" data-svc="menu">已注册</span>'
        : '<span class="tag tag-no" data-svc="menu">未注册</span>'
    }
    if (!busy) {
      var autoAlert = document.getElementById('alert-auto')
      if (autoAlert) autoAlert.hidden = !!svc.autostart
    }
  }

  function applySummary(s) {
    if (!s) return
    if (typeof s.uptimeSec === 'number') startedAt = Date.now() - s.uptimeSec * 1000
    setText('allowCount', String(s.allowCount || 0))
    setText('bridge.instances', String((s.bridge && s.bridge.instances) || 0))
    setText('artifacts.size', fmtBytes((s.artifacts && s.artifacts.bytes) || 0))
    setText('artifacts.count', String((s.artifacts && s.artifacts.count) || 0))
    setText('artifacts.text', fmtBytes((s.artifacts && s.artifacts.bytes) || 0) + ' · ' + ((s.artifacts && s.artifacts.count) || 0) + ' 个文件')

    var allowAlert = document.getElementById('alert-allow')
    if (allowAlert) allowAlert.hidden = (s.allowCount || 0) > 0
    applyService(s.services)

    var dot = document.getElementById('live-dot')
    if (dot) dot.className = 'dot ok'
  }

  function refresh() {
    getJSON('./api/summary').then(function (s) {
      if (s && s.ok !== false) {
        applySummary(s)
      } else {
        var dot = document.getElementById('live-dot')
        if (dot) dot.className = 'dot off'
      }
      tickUptime()
    })
  }

  function startPolling() {
    if (polling) clearInterval(polling)
    polling = setInterval(refresh, 5000)
  }

  /* ---------- 服务注册 / 取消 ---------- */
  function setBtnsDisabled(disabled) {
    document.querySelectorAll('[data-svc-action]').forEach(function (b) { b.disabled = disabled })
  }

  function restoreBtns() {
    busy = false
    setBtnsDisabled(false)
    var r = document.querySelector('[data-svc-action="register"]')
    var u = document.querySelector('[data-svc-action="unregister"]')
    if (r) r.textContent = '注册服务'
    if (u) u.textContent = '取消注册'
  }

  function showServiceFail(message) {
    var tip = document.getElementById('alert-auto')
    if (!tip) return
    tip.hidden = false
    tip.classList.remove('alert-warn')
    tip.classList.add('alert-err')
    var grow = tip.querySelector('.grow')
    if (grow) grow.innerHTML = '<b>' + message + '</b>'
    var act = tip.querySelector('.act')
    if (act) act.hidden = true
  }

  async function serviceAction(action) {
    if (busy) return
    busy = true
    var expect = action === 'register'
    var label = action === 'register' ? '注册中' : '取消中'
    document.querySelectorAll('[data-svc-action="' + action + '"]').forEach(function (b) { b.textContent = label + '…' })
    setBtnsDisabled(true)

    var res = await getJSON('./api/service', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action }),
    })

    // 网页无法提权写 /etc/systemd/system：直接给可执行指引，不假装成功
    if (res && res.error === 'requires-root') {
      restoreBtns()
      showServiceFail('Linux 下注册需要 root，请在终端执行 ' + (res.hint || 'sudo u32-ls ' + action))
      return
    }

    var final = null
    if (res && res.ok) {
      // 注册由独立子进程执行（改注册表 / 写 systemd unit），耗时不定：
      // 轮询真实状态而不是信任提交结果，避免"点了就显示已注册"的假成功
      for (var i = 0; i < 8; i++) {
        await sleep(1500)
        var s = await getJSON('./api/service-status')
        if (s && s.autostart === expect) { final = s; break }
      }
    }

    restoreBtns()

    if (final) {
      applyService(final)
      var alertEl = document.getElementById('alert-auto')
      if (alertEl) {
        alertEl.hidden = !!final.autostart
        alertEl.classList.remove('alert-err')
        alertEl.classList.add('alert-warn')
        var act = alertEl.querySelector('.act')
        if (act) act.hidden = false
      }
    } else {
      showServiceFail((expect ? '注册未生效' : '取消注册未生效') + '，可查看日志或手动执行 u32-ls ' + action)
      refresh()
    }
  }

  /* ---------- 事件绑定 ---------- */
  document.addEventListener('click', function (e) {
    var act = e.target.closest('[data-svc-action]')
    if (act) { serviceAction(act.getAttribute('data-svc-action')); return }

    var copyBtn = e.target.closest('.copy[data-rel]')
    if (copyBtn) {
      e.preventDefault()
      e.stopPropagation()
      var rel = copyBtn.getAttribute('data-rel')
      copyText(new URL(rel, location.href).href, copyBtn)
      return
    }

    var promptBtn = e.target.closest('[data-copy]')
    if (promptBtn) {
      copyText(promptBtn.getAttribute('data-copy'), promptBtn)
      return
    }

    var llmsBtn = e.target.closest('[data-copy-llms]')
    if (llmsBtn) {
      copyText(new URL('./llms.txt', location.href).href, llmsBtn)
      return
    }

    var llmsView = e.target.closest('[data-view-llms]')
    if (llmsView) {
      window.open('./llms.txt', '_blank', 'noopener')
      return
    }

    var autoAct = e.target.closest('#alert-auto-act')
    if (autoAct) {
      e.preventDefault()
      serviceAction('register')
    }
  })

  var openBtn = document.getElementById('art-open')
  if (openBtn) {
    openBtn.addEventListener('click', async function () {
      var r = await getJSON('./bridge/api/artifacts/open', { method: 'POST' })
      flash(openBtn, r && r.ok ? '已打开' : '不支持')
    })
  }

  var clearBtn = document.getElementById('art-clear')
  if (clearBtn) {
    clearBtn.addEventListener('click', async function () {
      if (!confirm('清空全部临时产物？此操作不可恢复。在线桥页面会继续产生新产物，属正常现象。')) return
      clearBtn.disabled = true
      var r = await getJSON('./bridge/api/artifacts', { method: 'DELETE' })
      clearBtn.disabled = false
      if (r) {
        flash(clearBtn, '已清空')
        refresh()
      } else {
        flash(clearBtn, '清空失败')
      }
    })
  }

  /* ---------- 软件更新（自动下载 + 安装解耦） ----------
     服务端自动调度：启动 30s 后查新版，之后每 6h；发现新版自动后台下载缓存（恒留一个最新 exe）。
     前端只轮询 GET /api/update 读状态：
       无更新               → 「已是最新」
       下载中               → 「下载中 x%」（按钮置灰）
       已就绪               → 「新版 vX.Y.Z 已就绪」+「安装新版本」按钮（点击直接拉向导）
       失败                 → 原因 +「重试」 */
  var updBusy = false

  function updEls() {
    return {
      latest: document.getElementById('upd-latest'),
      statusRow: document.getElementById('upd-status-row'),
      status: document.getElementById('upd-status'),
      checkBtn: document.getElementById('upd-check'),
      installBtn: document.getElementById('upd-install'),
    }
  }

  function updRender(s) {
    var el = updEls()
    if (!el.latest) return
    if (!s || s.ok !== true) {
      el.latest.textContent = '检测失败'
      if (el.statusRow) el.statusRow.hidden = false
      if (el.status) el.status.textContent = (s && s.error) || '网络不可达'
      if (el.installBtn) el.installBtn.hidden = true
      if (el.checkBtn) { el.checkBtn.disabled = false; el.checkBtn.textContent = '重试' }
      return
    }
    if (!s.updateAvailable) {
      el.latest.textContent = s.latest + '（已是最新）'
      if (el.statusRow) el.statusRow.hidden = true
      if (el.installBtn) el.installBtn.hidden = true
      if (el.checkBtn) el.checkBtn.disabled = false
      return
    }
    el.latest.textContent = s.latest
    if (el.statusRow) el.statusRow.hidden = false
    if (s.downloading) {
      if (el.status) el.status.textContent = '新版下载中… ' + (s.progress || 0) + '%'
      if (el.installBtn) { el.installBtn.hidden = true }
      if (el.checkBtn) el.checkBtn.disabled = false
    } else if (s.downloaded) {
      if (el.status) el.status.textContent = '新版已就绪，点击右侧按钮安装'
      if (el.installBtn) { el.installBtn.hidden = false; el.installBtn.disabled = false; el.installBtn.textContent = '安装新版本' }
    } else {
      // 有更新但既不在下载也没有缓存（下载失败等）：给重试入口
      if (el.status) el.status.textContent = '下载未完成' + (s.error ? '：' + s.error : '')
      if (el.installBtn) el.installBtn.hidden = true
      if (el.checkBtn) el.checkBtn.disabled = false
    }
  }

  async function updPollOnce() {
    if (updBusy) return
    var s = await getJSON('./api/update')
    updRender(s)
  }

  // 页面上「检测更新 / 重试」：POST check 强制重查，之后恢复轮询
  async function updManualCheck(btn) {
    if (updBusy) return
    updBusy = true
    var el = updEls()
    if (el.latest) el.latest.textContent = '检测中…'
    var s = await getJSON('./api/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check' }),
    })
    updBusy = false
    if (el.checkBtn) el.checkBtn.textContent = '检测更新'
    updRender(s)
  }

  function updInstall() {
    var el = updEls()
    if (el.installBtn) { el.installBtn.disabled = true; el.installBtn.textContent = '启动安装中…' }
    if (el.status) el.status.textContent = '安装向导已启动，按向导提示完成升级（会自动停服务与托盘）'
    getJSON('./api/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'install' }),
    }).then(function (r) {
      if (!r || !r.ok) {
        if (el.status) el.status.textContent = '启动失败：' + ((r && r.error) || '未知错误')
        if (el.installBtn) { el.installBtn.disabled = false; el.installBtn.textContent = '安装新版本' }
      }
      // 成功时不回滚按钮文案：向导接管，页面即将随服务重启失联
    })
  }

  var updCheckBtn = document.getElementById('upd-check')
  if (updCheckBtn) updCheckBtn.addEventListener('click', function () { updManualCheck(updCheckBtn) })
  var updInstallBtn = document.getElementById('upd-install')
  if (updInstallBtn) updInstallBtn.addEventListener('click', updInstall)

  /* ---------- 启动 ---------- */
  setInterval(tickUptime, 1000)
  tickUptime()
  startPolling()
  updPollOnce()
  setInterval(updPollOnce, 5000) // 跟随首页 5s 轮询节奏刷新升级状态（下载进度/就绪态）
})()

