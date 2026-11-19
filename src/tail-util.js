const fs = require('fs')
const { EventEmitter } = require('events')

function tail(filepath) {
  const emitter = new EventEmitter()
  const stats = fs.statSync(filepath)
  let fileSize = stats.size

  const stream = fs.createReadStream(filepath, {
    start: Math.max(0, fileSize - 4096),
    encoding: 'utf-8'
  })

  // 跨 chunk 的行缓冲：chunk 边界可能劈在半行处，末段留待与下个 chunk 拼接
  let buffer = ''
  const emitLines = (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (line) emitter.emit('line', line)
    }
  }

  stream.on('data', emitLines)

  stream.on('end', () => {
    // buffer 里可能是尚未写完的半行，保留等待后续数据拼接，不输出
    emitter.emit('ready')
  })

  const watcher = fs.watch(filepath, (eventType) => {
    if (eventType !== 'change') return

    let newStats
    try {
      newStats = fs.statSync(filepath)
    } catch {
      return
    }

    // 日志轮转（文件被替换变小）：从头重读
    if (newStats.size < fileSize) {
      fileSize = 0
      buffer = ''
    }
    if (newStats.size <= fileSize) return

    // 立即推进 fileSize：不等 end 事件，否则读取期间的新 change 会从旧位置重叠读
    const from = fileSize
    fileSize = newStats.size
    const readStream = fs.createReadStream(filepath, {
      start: from,
      encoding: 'utf-8'
    })
    readStream.on('data', emitLines)
  })

  watcher.on('error', () => {
    watcher.close()
  })

  emitter.close = () => {
    watcher.close()
    stream.destroy()
  }

  return emitter
}

module.exports = { tail }
