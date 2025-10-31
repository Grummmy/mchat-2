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

function create_aiResponse() {
	const ai = config?.ai
	const apiKey = process.env?.[ai?.apiKey]

	if (apiKey && ai?.model) {
		return async function aiResponse(messages, limit) {
			try {
		    const req = await fetch(
		      `https://generativelanguage.googleapis.com/v1beta/models/${ai.model}:generateContent?key=${apiKey}`,
		      {
		        method: "POST",
		        headers: { "Content-Type": "application/json" },
		        body: JSON.stringify({
		          system_instruction: { parts: [{ text: config.ai?.instructions || "" }] },
		          contents: messages,
		          generationConfig: { maxOutputTokens: limit || 255 }
		        })
		      }
		    );
		    
		    const resp = await req.json();
		    
		    if (req.status === 503) {
		      return "overload"
		    } else if (req.status !== 200 || !resp.candidates?.[0]?.content?.parts?.[0]?.text) {
		      console.log(
		        `AI answer failure: code ${req.status}: ${req.statusText}\n${JSON.stringify(resp, null, 2)}`
		      );
		      return "no-response"
		    } else {
		      return resp.candidates[0].content.parts[0].text.slice(0, limit + 1);
		    }
		  } catch (err) {
		    if (err.code === 'ECONNABORTED') {
		      return "timeout"
		    }
		    console.error('AI fetch error:', err);
		    return "no-response"
		  }
		}
	} else {
		console.log("\x1b[31mNo apiKey or/and model specified in config, using blank aiResponse function\x1b[0m")

		return async function aiResponse(text) {
			return "no-response"
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
    aiResponse: create_aiResponse(),
    escape: escape
  }
}
