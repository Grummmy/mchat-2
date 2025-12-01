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

function create_dateAdder() {
	const format = config.date?.format
	const plcholds = config.date?.placeholders

	if (format) {
		return function dateAdder(text) {
			const today = Math.floor((Date.now() % 86400000) / 1000);
			
			const s = today % 60
			const m = Math.floor(today / 60) % 60
			const h = Math.floor(today / 3600)

			return format.replace(plcholds.hour, `${h < 10 ? "0" : ""}${h}`)
				.replace(plcholds.minute, `${m < 10 ? "0" : ""}${m}`)
				.replace(plcholds.second, `${s < 10 ? "0" : ""}${s}`)+text
		}
	} else {
		return function dateAdder(text) {
			return text
		}
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
    dateAdder: create_dateAdder(),
    escape: escape
  }
}
