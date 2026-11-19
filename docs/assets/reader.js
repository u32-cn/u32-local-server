/* 文档阅读页：按 ?doc=<id> 从 ./readme/ 取 markdown，用 marked 渲染。id 走白名单，杜绝路径穿越。 */
(function () {
  'use strict'

  var DOCS = {
    'file-access': '本地文件访问',
    'fs-api': '文件写入 API',
    'picker': '文件选择器',
    'cors-proxy': 'CORS 代理',
    'bridge': '浏览器桥',
    'status': '运行状态',
    'config': '配置管理',
    'cli': '命令行',
    'bridge-connection-lifecycle': '桥连接生命周期'
  }

  var article = document.getElementById('article')
  if (!article) return

  var id = new URLSearchParams(location.search).get('doc') || 'file-access'

  // 侧栏高亮
  var links = document.querySelectorAll('.side a[data-doc]')
  for (var i = 0; i < links.length; i++) {
    if (links[i].getAttribute('data-doc') === id) links[i].classList.add('on')
  }

  if (!Object.prototype.hasOwnProperty.call(DOCS, id)) {
    article.innerHTML = '<h1>没有这篇文档</h1><p><a href="./#docs">回到文档索引</a></p>'
    document.title = '文档不存在 — u32-local-server'
    return
  }

  document.title = DOCS[id] + ' — u32-local-server'

  fetch('./readme/' + id + '.md', { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return res.text()
    })
    .then(function (text) {
      if (typeof marked === 'undefined') throw new Error('渲染库未加载')
      marked.setOptions({ gfm: true, breaks: false })
      article.innerHTML = marked.parse(text)
      // 站内相对链接（如 ./xxx.md）改成阅读页链接
      var as = article.querySelectorAll('a[href$=".md"]')
      for (var j = 0; j < as.length; j++) {
        var name = as[j].getAttribute('href').replace(/^.*\//, '').replace(/\.md$/, '')
        if (Object.prototype.hasOwnProperty.call(DOCS, name)) {
          as[j].setAttribute('href', './reader.html?doc=' + name)
        }
      }
      // 补齐表格外层，避免窄屏溢出
      var tables = article.querySelectorAll('table')
      for (var k = 0; k < tables.length; k++) {
        var t = tables[k]
        if (t.parentNode.className !== 'table-wrap') {
          var w = document.createElement('div')
          w.className = 'table-wrap'
          t.parentNode.insertBefore(w, t)
          w.appendChild(t)
        }
      }
    })
    .catch(function (err) {
      article.innerHTML = '<h1>加载失败</h1><p class="err">' + err.message +
        '</p><p>如果直接用 <code>file://</code> 打开本页，浏览器会拦住 fetch；请通过 HTTP 访问。</p>'
    })
})()
