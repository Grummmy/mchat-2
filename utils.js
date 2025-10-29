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
  let replacement = {}
  for (const key in config.replace) {
    replacement[config.replace[key]] = new RegExp(`\\${key}`, "g")
  }

  return function replaceMsg(message) {
    for (const text in replacement) {
      message = message.replace(replacement[text], text)
    }

    return message
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escape(text) {
  return text
    .replace(/([\\*_~`>|[\]()#+\-=!{}\.])/g, '\\$1') // `
    .replace(/@/g, '@\u200b');
}

module.exports = (arg) => {
  config = arg

  return {
    sleep: sleep,
    shouldIgnore: create_shouldIgnore(),
    replaceMsg: create_replaceMsg(),
    escape: escape
  }
}
