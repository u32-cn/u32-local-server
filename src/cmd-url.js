const path = require('path')
const fs = require('fs')
const os = require('os')
const { loadConfig, resolveConfig, resolvePath } = require('./config')
const { isAllowed } = require('./permission')
const { toPosix } = require('./posix-path')
const logger = require('./logger')

function toUrlPath(localPath) {
  const normalized = toPosix(localPath)
  const homeNorm = toPosix(os.homedir())
  if (normalized.startsWith(homeNorm + '/')) {
    return '/file/~' + normalized.slice(homeNorm.length)
  }
  return '/file/' + normalized
}

function run(argv) {
  const input = argv[0]
  if (!input) {
    logger.error('[CMD-URL] Usage: u32-ls url <path>\n')
    process.exit(1)
  }

  logger.debug(`[CMD-URL] Processing path: ${input}\n`)
  const rawConfig = loadConfig()
  const config = resolveConfig(rawConfig)

  let resolved
  if (input.startsWith('~/')) {
    resolved = path.join(os.homedir(), input.slice(2))
    logger.debug(`[CMD-URL] Expanded ~ to: ${resolved}\n`)
  } else {
    resolved = path.resolve(input)
    logger.debug(`[CMD-URL] Resolved relative path to: ${resolved}\n`)
  }

  resolved = toPosix(resolved)
  logger.debug(`[CMD-URL] Normalized to POSIX path: ${resolved}\n`)

  if (!fs.existsSync(resolved)) {
    logger.error(`[CMD-URL] WARNING: Path does not exist: ${resolved}\n`)
  } else if (!isAllowed(resolved, config)) {
    logger.error(`[CMD-URL] WARNING: Path is not accessible (check allow rules): ${resolved}\n`)
  }

  const urlPath = toUrlPath(resolved)
  const url = `http://localhost:${config.port}${urlPath}`
  logger.debug(`[CMD-URL] Generated URL: ${url}\n`)
  logger.info(url + '\n')
  process.exit(0)
}

module.exports = { run, toUrlPath }
