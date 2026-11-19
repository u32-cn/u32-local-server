#!/usr/bin/env node

// 从 resources/ls.svg 的设计语义（白底面板 + 红色 LS）生成 Windows 托盘所需 .ico
// 零依赖：手绘 5x7 点阵字形，按 32/16 两种尺寸栅格化，直接写 ICO/BMP(32bpp) 二进制
// SVG 作为源文件保留（文档/网页用），ICO 供系统托盘 NotifyIcon 使用

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'resources', 'ls.ico')

// 5x7 点阵字形（1 = 红色笔画）
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

function raster(size, ink) {
  // 画布初始透明
  const px = Array.from({ length: size }, () => Array.from({ length: size }, () => CLEAR.slice()))

  // 白色圆角面板：四角半径约 size/8，圆外透明
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
          // 距圆心超过半径 -> 圆外
          const dist2 = (x - cx) ** 2 + (y - cy) ** 2
          if (dist2 > r * r) inside = false
        }
      }
      if (inside) px[y][x] = WHITE.slice()
    }
  }

  // 字形缩放：32 -> 2x，16 -> 1x
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

// 32bpp BGRA，自下而上；AND 掩码全 0（32bpp 下 alpha 已表达透明）
function dib(px) {
  const size = px.length
  const rowBytes = size * 4
  const xorSize = rowBytes * size
  const andRow = Math.ceil(size / 32) * 4
  const andSize = andRow * size
  const buf = Buffer.alloc(40 + xorSize + andSize)

  buf.writeUInt32LE(40, 0)           // biSize
  buf.writeInt32LE(size, 4)          // biWidth
  buf.writeInt32LE(size * 2, 8)      // biHeight = XOR + AND
  buf.writeUInt16LE(1, 12)           // biPlanes
  buf.writeUInt16LE(32, 14)          // biBitCount
  buf.writeUInt32LE(0, 16)           // biCompression BI_RGB
  buf.writeUInt32LE(xorSize, 20)     // biSizeImage

  for (let y = 0; y < size; y++) {
    const src = px[size - 1 - y]     // 自下而上
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = src[x]
      const off = 40 + y * rowBytes + x * 4
      buf[off] = b
      buf[off + 1] = g
      buf[off + 2] = r
      buf[off + 3] = a
    }
  }
  // AND 掩码默认全 0
  return buf
}

function buildIco(sizes, ink) {
  const images = sizes.map(s => dib(raster(s, ink)))
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)          // type: icon
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
  // 32x32 主图标供普通场景，16x16 供系统托盘（小尺寸下更清晰）
  const active = buildIco([32, 16], RED)
  fs.writeFileSync(OUT, active)
  console.log('[ICON] Wrote', OUT, active.length, 'bytes')

  const grayPath = path.join(ROOT, 'resources', 'ls-gray.ico')
  const gray = buildIco([32, 16], GRAY)
  fs.writeFileSync(grayPath, gray)
  console.log('[ICON] Wrote', grayPath, gray.length, 'bytes')
}

main()
