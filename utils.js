let config

function create_shouldIgnore() {
  const exact = new Set(config.exclude.exact);
  const starts = config.exclude.startsWith;

  return function shouldIgnore(message) {
  	message = message.trim()
    if (exact.has(message)) return true
    return starts.some(prefix => message.startsWith(prefix))
  }
}

function create_replaceMsg() {
  const replaceData = config.replace

  return function replaceMsg(message) {
    for (const key in replaceData) {
      message = message.replace(key, replaceData[key])
    }

    return message
  }
}

module.exports = (arg) => {
  config = arg

  return {
    shouldIgnore: create_shouldIgnore(),
    replaceMsg: create_replaceMsg()
  }
}
