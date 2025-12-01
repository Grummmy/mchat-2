let config

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


module.exports = (arg) => {
  config = arg

  return {
    aiResponse: create_aiResponse()
  }
}
