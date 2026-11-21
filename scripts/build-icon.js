#!/usr/bin/env node

// 从 resources/ls.svg 的设计语义（白底圆角面板 + 红色 LS）生成 Windows 托盘/快捷方式 .ico
// 零依赖：小尺寸（16/32）保留 5x7 点阵字形（小画布下点阵最锐利），
// 大尺寸（48/64/256）用矢量 AA 光栅化——字形改为按网格比例绘制的笔画填充，
// 圆角面板边界做 1px 抗锯齿过渡，避免桌面大图标拉伸像素化。
// SVG 作为源文件保留（文档/网页用），ICO 供系统托盘与快捷方式使用

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'resources', 'ls.ico')

// 5x7 点阵字形（1 = 红色笔画）——仅 16/32 用
const GLYPHS = {
  L: [
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '11111',
  ],
  S: [
    '01111',
    '10000',
    '10000',
    '01110',
    '00001',
    '00001',
    '11110',
  ],
}

const RED = [220, 38, 38, 255]   // #DC2626 激活（服务运行中）
const GRAY = [156, 163, 175, 255] // #9CA3AF 置灰（服务未运行）
const WHITE = [255, 255, 255, 255]
const CLEAR = [0, 0, 0, 0]

/* ---------- 小尺寸：点阵光栅化（原逻辑） ---------- */

function rasterDot(size, ink) {
  const px = Array.from({ length: size }, () => Array.from({ length: size }, () => CLEAR.slice()))

  const r = Math.max(2, Math.round(size / 8))
  const inset = Math.max(0, Math.round(size / 16))
  for (let y = inset; y < size - inset; y++) {
    for (let x = inset; x < size - inset; x++) {
      let inside = true
      const corners = [
        [inset + r, inset + r],
        [size - inset - 1 - r, inset + r],
        [inset + r, size - inset - 1 - r],
        [size - inset - 1 - r, size - inset - 1 - r],
      ]
      for (const [cx, cy] of corners) {
        const dx = Math.max(0, Math.abs(x - cx) - r)
        const dy = Math.max(0, Math.abs(y - cy) - r)
        const inCornerQuad =
          (x <= cx ? 1 : 0) === (cx < size / 2 ? 1 : 0) &&
          (y <= cy ? 1 : 0) === (cy < size / 2 ? 1 : 0)
        if (inCornerQuad && dx === 0 && dy === 0) {
          const dist2 = (x - cx) ** 2 + (y - cy) ** 2
          if (dist2 > r * r) inside = false
        }
      }
      if (inside) px[y][x] = WHITE.slice()
    }
  }

  const scale = size >= 32 ? 2 : 1
  const gw = 5 * scale
  const gh = 7 * scale
  const gap = scale
  const totalW = gw * 2 + gap
  const startX = Math.floor((size - totalW) / 2)
  const startY = Math.floor((size - gh) / 2)

  const word = ['L', 'S']
  for (let li = 0; li < word.length; li++) {
    const glyph = GLYPHS[word[li]]
    const ox = startX + li * (gw + gap)
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '1') continue
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const x = ox + gx * scale + sx
            const y = startY + gy * scale + sy
            if (x >= 0 && x < size && y >= 0 && y < size) px[y][x] = ink.slice()
          }
        }
      }
    }
  }
  return px
}

/* ---------- 大尺寸：矢量 AA 光栅化 ---------- */

// 布局常量（比例，相对画布 0~1）：面板 inset 与圆角、字形笔画宽度
const PANEL_INSET = 0.06
const PANEL_RADIUS = 0.125
const STROKE = 0.05        // 笔画宽度（细一些，保留字母感）
const CHAR_W = 0.185       // 单字符宽
const CHAR_H = 0.44        // 单字符高
const CHAR_GAP = 0.055     // 字间距

// 归一化坐标 (0~1) 下的 LS 笔画段：每段 [x0,y0,x1,y1] 轴对齐矩形
// 字形总宽 = 2*CHAR_W + CHAR_GAP；纵向起点居中
function strokes() {
  const w = CHAR_W, h = CHAR_H, t = STROKE
  const totalW = w * 2 + CHAR_GAP
  const x0 = (1 - totalW) / 2
  const y0 = (1 - h) / 2
  const L = x0, S = x0 + w + CHAR_GAP
  const midY = y0 + h / 2 - t / 2   // 中横 y

  return [
    // L：竖笔 + 底横笔
    { x: L, y: y0, w: t, h: h },
    { x: L, y: y0 + h - t, w: w, h: t },
    // S（五段折线）：上横 → 左上竖 → 中横 → 右下竖 → 底横
    { x: S, y: y0, w: w, h: t },                    // 上横
    { x: S, y: y0, w: t, h: h / 2 },                // 左上竖（上横到中横）
    { x: S, y: midY, w: w, h: t },                  // 中横
    { x: S + w - t, y: y0 + h / 2, w: t, h: h / 2 },// 右下竖（中横到底横）
    { x: S, y: y0 + h - t, w: w, h: t },            // 底横
  ]
}

function rasterVector(size, ink) {
  // 3x3 超采样抗锯齿
  const SS = 3
  const px = Array.from({ length: size }, () => Array.from({ length: size }, () => CLEAR.slice()))

  // 面板几何（归一化）
  const inset = PANEL_INSET
  const rad = PANEL_RADIUS
  const p0 = inset, p1 = 1 - inset
  const pr = rad

  // 每段笔画的覆盖计数（用于 AA）
  const cover = Array.from({ length: size }, () => new Float32Array(size))

  // 1) 面板覆盖（含圆角 AA）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / size
          const ny = (y + (sy + 0.5) / SS) / size
          if (insideRoundedRect(nx, ny, p0, p0, p1, p1, pr)) hit++
        }
      }
      const a = hit / (SS * SS)
      if (a > 0) blendPx(px, y, x, WHITE, a)
    }
  }

  // 2) 笔画覆盖（累积到 cover，最后一次性 blend，避免笔画重叠处 alpha 叠加发黑）
  for (const s of strokes()) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let hit = 0
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const nx = (x + (sx + 0.5) / SS) / size
            const ny = (y + (sy + 0.5) / SS) / size
            if (nx >= s.x && nx <= s.x + s.w && ny >= s.y && ny <= s.y + s.h) hit++
          }
        }
        const a = hit / (SS * SS)
        if (a > 0) cover[y][x] = Math.min(1, cover[y][x] + a)
      }
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cover[y][x] > 0) blendPx(px, y, x, ink, cover[y][x])
    }
  }
  return px
}

function insideRoundedRect(nx, ny, x0, y0, x1, y1, r) {
  if (nx < x0 || nx > x1 || ny < y0 || ny > y1) return false
  const cx = Math.min(Math.max(nx, x0 + r), x1 - r)
  const cy = Math.min(Math.max(ny, y0 + r), y1 - r)
  const dx = nx - cx, dy = ny - cy
  return dx * dx + dy * dy <= r * r
}

function blendPx(px, y, x, color, alpha) {
  const [r, g, b, a] = color
  const dst = px[y][x]
  const inv = 1 - alpha
  // source-over，预乘语义简化处理（图标底多数为透明或白，视觉足够）
  dst[0] = Math.round(r * alpha + dst[0] * inv)
  dst[1] = Math.round(g * alpha + dst[1] * inv)
  dst[2] = Math.round(b * alpha + dst[2] * inv)
  dst[3] = Math.max(dst[3], Math.round(a * alpha + dst[3] * inv / 1))
}

/* ---------- DIB/ICO 打包（原逻辑） ---------- */

function dib(px) {
  const size = px.length
  const rowBytes = size * 4
  const xorSize = rowBytes * size
  const andRow = Math.ceil(size / 32) * 4
  const andSize = andRow * size
  const buf = Buffer.alloc(40 + xorSize + andSize)

  buf.writeUInt32LE(40, 0)
  buf.writeInt32LE(size, 4)
  buf.writeInt32LE(size * 2, 8)
  buf.writeUInt16LE(1, 12)
  buf.writeUInt16LE(32, 14)
  buf.writeUInt32LE(0, 16)
  buf.writeUInt32LE(xorSize, 20)

  for (let y = 0; y < size; y++) {
    const src = px[size - 1 - y]
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = src[x]
      const off = 40 + y * rowBytes + x * 4
      buf[off] = b
      buf[off + 1] = g
      buf[off + 2] = r
      buf[off + 3] = a
    }
  }
  return buf
}

function buildIco(sizes, ink) {
  const images = sizes.map(s => {
    const px = s >= 48 ? rasterVector(s, ink) : rasterDot(s, ink)
    return dib(px)
  })
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let offset = header.length
  images.forEach((img, i) => {
    const s = sizes[i]
    const e = 6 + i * 16
    header[e] = s === 256 ? 0 : s
    header[e + 1] = s === 256 ? 0 : s
    header[e + 2] = 0
    header[e + 3] = 0
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(img.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += img.length
  })
  return Buffer.concat([header, ...images])
}

function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  // 16/32 点阵（托盘、小图标），48/64/256 矢量 AA（桌面快捷方式、资源管理器大图、DPI 缩放）
  const active = buildIco([16, 32, 48, 64, 256], RED)
  fs.writeFileSync(OUT, active)
  console.log('[ICON] Wrote', OUT, active.length, 'bytes')

  const grayPath = path.join(ROOT, 'resources', 'ls-gray.ico')
  const gray = buildIco([16, 32, 48, 64, 256], GRAY)
  fs.writeFileSync(grayPath, gray)
  console.log('[ICON] Wrote', grayPath, gray.length, 'bytes')
}

main()
