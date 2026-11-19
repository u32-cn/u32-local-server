const LOG_LEVEL = process.env.U32_LOG_LEVEL || 'info'
const fileLogger = require('./file-logger')

const LEVELS = {
  debug: 0,
  info: 1,
  error: 2
}

function log(level, message) {
  if (LEVELS[level] >= LEVELS[LOG_LEVEL]) {
    const output = level === 'error' ? process.stderr : process.stdout
    try {
      output.write(message)
    } catch (err) {
    }

    const formatted = fileLogger.formatLog(level, message)
    fileLogger.writeToFile(formatted + '\n')
  }
}

const logger = {
  debug: (msg) => log('debug', msg),
  info: (msg) => log('info', msg),
  error: (msg) => log('error', msg)
}

module.exports = logger
