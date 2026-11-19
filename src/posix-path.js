function toPosix(p) {
  return p.replace(/\\/g, '/')
}

module.exports = { toPosix }
