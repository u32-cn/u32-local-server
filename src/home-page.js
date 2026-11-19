const logger = require('./logger')
const { escapeHtml } = require('./utils')

const PACKAGE_JSON = require('../package.json')

function renderPage(config) {
  const version = PACKAGE_JSON.version
  const allowEmpty = !config.file.access.allow || config.file.access.allow.length === 0
  const configStatusText = allowEmpty ? '⚠️ 需要配置' : '✓ 已配置'
  const configStatusStyle = allowEmpty ? 'color: #DC2626;' : 'color: #16A34A;'

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>u32-local-server</title>
  <link rel="stylesheet" href="./public/css/space-grotesk.css">
  <link rel="stylesheet" href="./public/css/all.min.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FFFFFF;
      color: #000000;
      line-height: 1.5;
      font-size: 14px;
    }

    .container {
      max-width: 100%;
      margin: 0;
      padding: 0;
    }

    .header {
      border-bottom: 2px solid #000000;
      padding: 20px 0;
    }

    .header-content {
      max-width: 1000px;
      margin: 0 auto;
      padding: 0 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 5px;
    }

    .tagline {
      font-size: 13px;
      color: #666;
      font-weight: 400;
    }

    .header-btns {
      display: flex;
      gap: 5px;
    }

    .config-btn {
      font-size: 24px;
      color: #000000;
      text-decoration: none;
      transition: all 0.2s;
      padding: 5px;
    }

    .config-btn:hover {
      color: #FFFFFF;
      background: #000000;
    }

    .main {
      max-width: 1000px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .section {
      margin-bottom: 50px;
    }

    .section-title {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #E5E5E5;
    }

    .ai-list {
      border: 1px solid #000000;
    }

    .ai-item {
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 12px 20px;
      border-bottom: 1px solid #E5E5E5;
    }

    .ai-item:last-child {
      border-bottom: none;
    }

    .ai-item:hover {
      background: #F5F5F5;
    }

    .ai-prompt {
      flex: 1;
      font-size: 13px;
      line-height: 1.6;
      color: #333;
    }

    .ai-prompt code {
      font-family: 'Space Grotesk', monospace;
      background: #F5F5F5;
      padding: 1px 5px;
      font-size: 12px;
      border: 1px solid #E5E5E5;
    }

    .ai-copy-btn {
      flex-shrink: 0;
      padding: 6px 14px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .ai-copy-btn:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .ai-copy-btn.success {
      background: #16A34A;
      color: #FFFFFF;
      border-color: #16A34A;
    }

    .ai-copy-btn.error {
      background: #DC2626;
      color: #FFFFFF;
      border-color: #DC2626;
    }

    .quick-start {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      border: 1px solid #000000;
    }

    .step {
      padding: 30px 25px;
      border-right: 1px solid #000000;
    }

    .step:last-child {
      border-right: none;
    }

    .step-number {
      font-size: 48px;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 15px;
      color: #000000;
    }

    .step-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 15px;
    }

    .step-content {
      font-size: 13px;
      line-height: 1.6;
      color: #333;
    }

    .step-content code {
      font-family: 'Space Grotesk', monospace;
      background: #F5F5F5;
      padding: 2px 6px;
      font-size: 12px;
      font-weight: 400;
      border: 1px solid #E5E5E5;
    }

    .step-content a {
      color: #000000;
      text-decoration: none;
      border-bottom: 1px solid #000000;
    }

    .step-content a:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .about-card {
      border: 1px solid #000000;
      padding: 30px;
      background: #FAFAFA;
    }

    .about-card h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 15px;
    }

    .about-card p {
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      margin-bottom: 10px;
    }

    .about-card ul {
      list-style: none;
      padding: 0;
      margin: 15px 0;
    }

    .about-card li {
      padding: 8px 0;
      font-size: 14px;
      color: #555;
    }

    .about-card li:before {
      content: "• ";
      color: #000;
      font-weight: 700;
    }

    .service-actions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-top: 20px;
    }

    .service-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 20px;
      border: 1px solid #000000;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
    }

    .service-action-btn:hover:not(:disabled) {
      background: #000000;
      color: #FFFFFF;
    }

    .service-action-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .service-action-btn.success {
      background: #16A34A;
      color: #FFFFFF;
      border-color: #16A34A;
    }

    .service-action-btn.error {
      background: #DC2626;
      color: #FFFFFF;
      border-color: #DC2626;
    }

    .features {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0;
      border: 1px solid #000000;
    }

    .feature-item {
      padding: 30px 20px;
      text-align: center;
      border-right: 1px solid #000000;
      transition: background 0.2s;
    }

    .feature-item:last-child {
      border-right: none;
    }

    .feature-item:hover {
      background: #F5F5F5;
    }

    .feature-icon {
      font-size: 24px;
      margin-bottom: 15px;
      color: #000000;
    }

    .feature-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .feature-desc {
      font-size: 12px;
      color: #666;
      line-height: 1.5;
    }

    .commands {
      border: 1px solid #000000;
    }

    .cmd-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .cmd-table td {
      padding: 15px 20px;
      border-bottom: 1px solid #E5E5E5;
      text-align: left;
    }

    .cmd-table tr:last-child td {
      border-bottom: none;
    }

    .cmd-table tr:hover td {
      background: #F5F5F5;
    }

    .cmd-code {
      font-family: 'Space Grotesk', monospace;
      background: #000000;
      color: #FFFFFF;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 400;
    }

    .actions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0;
      border: 1px solid #000000;
      margin-top: 30px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 20px;
      text-decoration: none;
      color: #000000;
      font-weight: 700;
      font-size: 14px;
      text-align: center;
      border-right: 1px solid #000000;
      background: #FFFFFF;
      transition: all 0.2s;
      cursor: pointer;
      border: none;
      width: 100%;
    }

    .action-btn:last-child {
      border-right: none;
    }

    .action-btn:hover {
      background: #000000;
      color: #FFFFFF;
    }

    .footer {
      margin-top: 50px;
      padding: 20px 0;
      border-top: 2px solid #000000;
      text-align: left;
    }

    .footer-content {
      max-width: 1000px;
      margin: 0 auto;
      padding: 0 20px;
      font-size: 12px;
      color: #999;
    }

    .footer a {
      color: #000000;
      text-decoration: none;
      font-weight: 700;
    }

    .footer a:hover {
      text-decoration: underline;
    }

    .footer code {
      font-family: 'Space Grotesk', monospace;
      background: #F5F5F5;
      padding: 2px 6px;
      font-size: 12px;
      font-weight: 400;
      border: 1px solid #E5E5E5;
    }

    @media (max-width: 1024px) {
      .quick-start {
        grid-template-columns: 1fr;
      }

      .step {
        border-right: none;
        border-bottom: 1px solid #000000;
      }

      .step:last-child {
        border-bottom: none;
      }

      .features {
        grid-template-columns: repeat(2, 1fr);
      }

      .feature-item {
        border-right: none;
        border-bottom: 1px solid #000000;
      }

      .feature-item:nth-child(2),
      .feature-item:nth-child(4) {
        border-bottom: none;
      }
    }

    @media (max-width: 768px) {
      .features {
        grid-template-columns: 1fr;
      }

      .feature-item {
        border-right: none;
        border-bottom: 1px solid #000000;
      }

      .feature-item:last-child {
        border-bottom: none;
      }

      .actions {
        grid-template-columns: 1fr;
      }

      .action-btn {
        border-right: none;
        border-bottom: 1px solid #000000;
      }

      .action-btn:last-child {
        border-bottom: none;
      }
    }

    .service-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }

    .service-card {
      border: 1px solid #E5E5E5;
      border-left: 4px solid #000000;
      padding: 25px;
      background: #FAFAFA;
    }

    .service-card.windows {
      border-left-color: #0078D7;
    }

    .service-card.linux {
      border-left-color: #DD4814;
    }

    .service-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 15px;
      font-size: 18px;
      font-weight: 700;
    }

    .service-card.windows .service-header {
      color: #0078D7;
    }

    .service-card.linux .service-header {
      color: #DD4814;
    }

    .service-card p {
      color: #333;
    }

    .service-features {
      list-style: none;
      margin: 15px 0;
      padding-left: 0;
    }

    .service-features li {
      padding: 8px 0;
      font-size: 14px;
      color: #555;
    }

    .service-note {
      margin-top: 15px;
      font-size: 12px;
      color: #999;
    }

    @media (max-width: 768px) {
      .service-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="header-content">
        <div>
          <div class="logo">u32-local-server</div>
          <div class="tagline">本地 HTTP 文件服务器 + CORS 代理</div>
        </div>
        <div class="header-btns">
          <a href="./file" class="config-btn" title="文件访问"><i class="fas fa-folder-open"></i></a>
          <a href="./proxy/" class="config-btn" title="CORS代理"><i class="fas fa-globe"></i></a>
          <a href="./bridge" class="config-btn" title="浏览器桥状态"><i class="fas fa-plug"></i></a>
          <a href="./picker-demo" class="config-btn" title="Picker 演示"><i class="fas fa-window-maximize"></i></a>
          <a href="./status" class="config-btn" title="运行状态"><i class="fas fa-heartbeat"></i></a>
          <a href="./config" class="config-btn" title="配置"><i class="fas fa-cog"></i></a>
        </div>
      </div>
    </header>

    <main class="main">
      <section class="section">
        <div class="section-title">关于</div>
        <div class="about-card">
          <h2>本地开发工具</h2>
          <p>u32-local-server 是一款专为本地开发设计的轻量级HTTP服务器，提供本地文件访问和CORS代理两大核心功能，帮助开发者快速搭建测试环境和解决跨域问题。</p>
          <ul>
            <li><strong>零依赖：</strong>纯Node.js实现，无需安装任何第三方包</li>
            <li><strong>即开即用：</strong>简单命令即可启动，无需复杂配置</li>
            <li><strong>跨平台：</strong>Windows/Linux/macOS全平台支持</li>
          </ul>
          <p><strong>典型场景：</strong>前端开发本地文件预览、API调试跨域代理、文档在浏览器中直接访问</p>
        </div>
      </section>

      <section class="section">
        <div class="section-title">临时产物（桥 Artifact）</div>
        <div class="about-card">
          <h2>bridge-artifacts</h2>
          <p>浏览器桥页面（如 u32-earth）上传的临时产物（截图/导出数据等），存放于 <code>~/.u32-local-server/tmp/bridge-artifacts</code>，<strong>默认 7 天自动过期，服务器重启即清空，此目录随时可手动删除</strong>。</p>
          <p id="artifact-stats" style="font-size: 13px; color: #666;">加载中…</p>
          <button class="ai-copy-btn" id="artifact-clear-btn" onclick="clearArtifacts(this)" style="background:#c0392b;">清空全部产物</button>
          <button class="ai-copy-btn" id="artifact-open-btn" onclick="openArtifactsDir(this)" style="background:#2c7fbe; margin-left:8px;">打开临时目录</button>
        </div>
      </section>

      <section class="section">
        <div class="section-title">AI 指引</div>
        <p style="font-size: 13px; color: #666; margin-bottom: 15px;">将下面的提示词复制给 AI（如 ZCode、Claude 等编码助手），即可让 AI 直接使用本服务器的各项功能。</p>
        <div class="ai-list">
          <div class="ai-item">
            <div class="ai-prompt">阅读 <code>http://localhost:19527/llms.txt</code>，了解 u32-local-server 的全部功能</div>
            <button class="ai-copy-btn" onclick="copyPrompt(this, 0)">复制</button>
          </div>
          <div class="ai-item">
            <div class="ai-prompt">先阅读 <code>http://localhost:19527/llms.txt</code>，然后用 u32-local-server 的浏览器桥来控制页面</div>
            <button class="ai-copy-btn" onclick="copyPrompt(this, 1)">复制</button>
          </div>
          <div class="ai-item">
            <div class="ai-prompt">先阅读 <code>http://localhost:19527/llms.txt</code>，然后用 u32-local-server 读取本地文件内容</div>
            <button class="ai-copy-btn" onclick="copyPrompt(this, 2)">复制</button>
          </div>
          <div class="ai-item">
            <div class="ai-prompt">先阅读 <code>http://localhost:19527/llms.txt</code>，然后用 u32-local-server 的 CORS 代理抓取网页内容</div>
            <button class="ai-copy-btn" onclick="copyPrompt(this, 3)">复制</button>
          </div>
          <div class="ai-item">
            <div class="ai-prompt">先阅读 <code>http://localhost:19527/llms.txt</code>，然后用 u32-local-server 的文件写入 API 创建和写入本地文件</div>
            <button class="ai-copy-btn" onclick="copyPrompt(this, 4)">复制</button>
          </div>
          <div class="ai-item">
            <div class="ai-prompt">先阅读 <code>http://localhost:19527/llms.txt</code>，然后用 u32-local-server 的文件选择器让我选择本地文件或文件夹</div>
            <button class="ai-copy-btn" onclick="copyPrompt(this, 5)">复制</button>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-title">快速开始</div>
        <div class="quick-start">
          <div class="step">
            <div class="step-number">01</div>
            <div class="step-title">启动服务器</div>
            <div class="step-content">
              <code>u32-ls start</code> 启动服务<br>
              <code>u32-ls stop</code> 停止服务
            </div>
          </div>

          <div class="step">
            <div class="step-number">02</div>
            <div class="step-title">配置检查</div>
            <div class="step-content">
              <span style="${configStatusStyle}">${configStatusText}</span><br>
              ${allowEmpty ? '<a href="./config">前往配置</a>' : '允许列表已设置'}
            </div>
          </div>

          <div class="step">
            <div class="step-number">03</div>
            <div class="step-title">本地文件访问/代理</div>
            <div class="step-content">
              <a href="./file"><i class="fas fa-folder-open"></i> File页面</a> · 本地文件访问：<code>./file/&lt;file-path&gt;</code><br>
              <a href="./proxy/"><i class="fas fa-globe"></i> Proxy页面</a> · 代理绕过跨域：<code>./proxy/&lt;url&gt;</code>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-title">系统服务</div>

        <div class="service-grid">
          <div class="service-card windows">
            <div class="service-header">
              <i class="fab fa-windows"></i>
              <h3>Windows 系统</h3>
            </div>
            <p>运行 <span class="cmd-code">u32-ls register</span> 后：</p>
            <ul class="service-features">
              <li>✅ 开机自动启动服务</li>
              <li>✅ 文件/文件夹右键菜单「在浏览器中打开」</li>
              <li>✅ 文件/文件夹右键菜单「复制 URL」</li>
              <li>✅ 空白处右键「在浏览器中打开当前目录」</li>
            </ul>
          </div>

          <div class="service-card linux">
            <div class="service-header">
              <i class="fab fa-linux"></i>
              <h3>Linux 系统</h3>
            </div>
            <p>运行 <span class="cmd-code">u32-ls register</span> 后：</p>
            <ul class="service-features">
              <li>✅ 创建 systemd 用户服务</li>
              <li>✅ 用户登录时自动启动</li>
            </ul>
          </div>
        </div>

        <div class="service-actions">
          <button class="service-action-btn" onclick="registerService()">
            <i class="fas fa-plus"></i> 注册服务
          </button>
          <button class="service-action-btn" onclick="unregisterService()">
            <i class="fas fa-minus"></i> 取消注册
          </button>
        </div>
      </section>

      <section class="section">
        <div class="section-title">功能特性</div>
        <div class="features">
          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-folder"></i></div>
            <div class="feature-title">文件访问</div>
            <div class="feature-desc">HTTP 本地文件系统访问</div>
          </div>

          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-globe"></i></div>
            <div class="feature-title">CORS 代理</div>
            <div class="feature-desc">跨域请求代理转发</div>
          </div>

          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-shield-alt"></i></div>
            <div class="feature-title">权限控制</div>
            <div class="feature-desc">允许列表/拒绝列表保护</div>
          </div>

          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-cog"></i></div>
            <div class="feature-title">配置管理</div>
            <div class="feature-desc">Web 界面配置管理</div>
          </div>

          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-plug"></i></div>
            <div class="feature-title">浏览器桥</div>
            <div class="feature-desc">AI 与页面间消息桥 · <a href="./bridge">状态页</a></div>
          </div>

          <div class="feature-item">
            <div class="feature-icon"><i class="fas fa-folder-open"></i></div>
            <div class="feature-title">文件选择器</div>
            <div class="feature-desc">Win10 风格网页选择器 · <a href="./picker-demo">演示页</a></div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-title">命令参考</div>
        <div class="commands">
          <table class="cmd-table">
            <tr>
              <td><span class="cmd-code">u32-ls start</span></td>
              <td>启动后台服务器</td>
            </tr>
            <tr>
              <td><span class="cmd-code">u32-ls stop</span></td>
              <td>停止服务器</td>
            </tr>
            <tr>
              <td><span class="cmd-code">u32-ls restart</span></td>
              <td>重启服务器</td>
            </tr>
            <tr>
              <td><span class="cmd-code">u32-ls status</span></td>
              <td>查看运行状态</td>
            </tr>
            <tr>
              <td><span class="cmd-code">u32-ls logs [-f]</span></td>
              <td>查看日志（-f 跟踪输出）</td>
            </tr>
            <tr>
              <td><span class="cmd-code">u32-ls url &lt;path&gt;</span></td>
              <td>获取文件 URL</td>
            </tr>
            <tr>
              <td><span class="cmd-code">u32-ls open [path]</span></td>
              <td>浏览器打开（无参数打开首页）</td>
            </tr>
            <tr>
              <td><span class="cmd-code">u32-ls copy-url &lt;path&gt;</span></td>
              <td>复制 URL 到剪贴板</td>
            </tr>
            <tr>
              <td><span class="cmd-code">u32-ls register</span></td>
              <td>注册系统服务</td>
            </tr>
            <tr>
              <td><span class="cmd-code">u32-ls unregister</span></td>
              <td>取消注册系统服务</td>
            </tr>
          </table>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="footer-content">
        <p>u32-local-server v${version} · 运行 <code>u32-ls --help</code> 查看完整命令参考</p>
      </div>
    </footer>
  </div>

<script>
const AI_PROMPTS = [
  '阅读 http://localhost:19527/llms.txt，了解 u32-local-server 的全部功能',
  '先阅读 http://localhost:19527/llms.txt，然后用 u32-local-server 的浏览器桥来控制页面',
  '先阅读 http://localhost:19527/llms.txt，然后用 u32-local-server 读取本地文件内容',
  '先阅读 http://localhost:19527/llms.txt，然后用 u32-local-server 的 CORS 代理抓取网页内容',
  '先阅读 http://localhost:19527/llms.txt，然后用 u32-local-server 的文件写入 API 创建和写入本地文件',
  '先阅读 http://localhost:19527/llms.txt，然后用 u32-local-server 的文件选择器让我选择本地文件或文件夹'
]

async function copyPrompt(btn, idx) {
  const originalHTML = btn.innerHTML
  try {
    await navigator.clipboard.writeText(AI_PROMPTS[idx])
    btn.classList.add('success')
    btn.innerHTML = '已复制'
  } catch (err) {
    btn.classList.add('error')
    btn.innerHTML = '失败'
  }
  setTimeout(() => {
    btn.innerHTML = originalHTML
    btn.classList.remove('success', 'error')
  }, 2000)
}

// 临时产物卡片：加载统计 + 清空按钮
function fmtBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(2) + ' MB'
}

async function loadArtifactStats() {
  const el = document.getElementById('artifact-stats')
  try {
    const r = await fetch('/bridge/api/artifacts')
    const s = await r.json()
    el.textContent = '当前 ' + s.count + ' 个产物，共 ' + fmtBytes(s.bytes) + '（目录：' + s.dir + '）'
  } catch (e) {
    el.textContent = '统计加载失败：' + e.message
  }
}

async function clearArtifacts(btn) {
  if (!confirm('确定清空全部临时产物？此操作不可恢复。')) return
  const originalHTML = btn.innerHTML
  btn.disabled = true
  try {
    const r = await fetch('/bridge/api/artifacts', { method: 'DELETE' })
    const s = await r.json()
    btn.innerHTML = '已清空 ' + s.count + ' 个（' + fmtBytes(s.bytes) + '）'
  } catch (e) {
    btn.innerHTML = '清空失败'
  }
  setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false }, 2500)
  // 清空后再查一次统计：有在线桥页面时会立刻上传新产物，需向用户说明
  const after = await (await fetch('/bridge/api/artifacts')).json().catch(() => null)
  const el = document.getElementById('artifact-stats')
  if (after && after.count > 0) {
    el.textContent = '已清空，但检测到有在线页面又上传了 ' + after.count + ' 个新产物（共 ' + fmtBytes(after.bytes) + '）——在线会话会持续产生新产物，属正常现象'
    el.style.color = '#a05a00'
  } else if (after) {
    el.textContent = '当前 0 个产物，共 0 B（目录：' + after.dir + '）'
    el.style.color = '#666'
  }
}

async function openArtifactsDir(btn) {
  const originalHTML = btn.innerHTML
  btn.disabled = true
  try {
    const r = await fetch('/bridge/api/artifacts/open', { method: 'POST' })
    const s = await r.json()
    if (s.ok) {
      btn.innerHTML = '已打开'
      setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false }, 1500)
    } else {
      btn.innerHTML = '不支持：' + (s.error || '未知错误')
      setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false }, 3000)
    }
  } catch (e) {
    btn.innerHTML = '打开失败'
    setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false }, 2500)
  }
}

loadArtifactStats()


async function registerService() {
  const btn = event.target
  const originalHTML = btn.innerHTML
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 注册中...'
  btn.disabled = true

  try {
    const res = await fetch('./api/service', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ action: 'register' })
    })

    if (res.ok) {
      btn.classList.add('success')
      btn.innerHTML = '<i class="fas fa-check"></i> 已注册'
      setTimeout(() => {
        btn.innerHTML = originalHTML
        btn.disabled = false
        btn.classList.remove('success')
      }, 3000)
    } else {
      throw new Error('注册失败')
    }
  } catch (err) {
    btn.classList.add('error')
    btn.innerHTML = '<i class="fas fa-times"></i> 失败'
    setTimeout(() => {
      btn.innerHTML = originalHTML
      btn.disabled = false
      btn.classList.remove('error')
    }, 3000)
  }
}

async function unregisterService() {
  const btn = event.target
  const originalHTML = btn.innerHTML
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 取消中...'
  btn.disabled = true

  try {
    const res = await fetch('./api/service', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ action: 'unregister' })
    })

    if (res.ok) {
      btn.classList.add('success')
      btn.innerHTML = '<i class="fas fa-check"></i> 已取消'
      setTimeout(() => {
        btn.innerHTML = originalHTML
        btn.disabled = false
        btn.classList.remove('success')
      }, 3000)
    } else {
      throw new Error('取消失败')
    }
  } catch (err) {
    btn.classList.add('error')
    btn.innerHTML = '<i class="fas fa-times"></i> 失败'
    setTimeout(() => {
      btn.innerHTML = originalHTML
      btn.disabled = false
      btn.classList.remove('error')
    }, 3000)
  }
}
</script>
</body>
</html>`
}

function serve(req, res, config) {
  logger.debug(`[HOME-PAGE] Serving home page\n`)
  const html = renderPage(config)
  res.writeHead(200, { 
    'Content-Type': 'text/html; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'access-control-allow-headers': '*',
  })
  res.end(html)
}

module.exports = { serve }
