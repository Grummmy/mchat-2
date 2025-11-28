require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const mineflayer = require("mineflayer");
const registry = require('prismarine-registry')('1.16.5')
const ChatMessage = require('prismarine-chat')(registry)

const config = require("./config.json");
const { escape, sleep, shouldIgnore, replaceMsg, aiResponse, dateAdder } = require("./utils.js")(config);
const tgbot = new TelegramBot(process.env[config.tgBotAPI], { polling: true });

const consoleWarn = console.warn;
console.warn = (message, ...optionalParams) => {
  if (
    !message.startsWith("Ignoring block entities as chunk failed to load at")
  ) {
    consoleWarn(message, ...optionalParams);
  }
};

const options = {
  host: config.options.basic.host,
  port: config.options.basic.port || 25565,
  version: config.options.basic.version || "1.16.5",
  //   username: config.username,
  ...config.options.extra,
};

const informed = new Map()

function modifyBot(bot, username) {
  bot.log = (text) => {
    console.log(`${new Date().toISOString()} [${username}] ${text}`);
  };

  bot.sendtg = (message) => {
    // telegram sendMessage method for bot
    if (config.bots[username].tgChat) {
      tgbot.sendMessage(config.bots[username].tgChat, message);
    }
  };

  bot.senddc = (message) => {
    // discord sendMessage method for bot
    for (let i = 0; i < config.dcWebhookRetry; i++) {
      try {
        fetch(process.env[config.bots[username].dcWebhook], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message, embeds: null }),
        })
      } catch (err) {
        bot.log(`SENDDC ERR '${message}'\nerror: ${err}` + (
          i != config.dcWebhookRetry ? "retry queued" : ""
        ))
        continue
      }

      break
    }
  };

  return bot
}

function createBot(username) {
  const bot = modifyBot(mineflayer.createBot({ username: username, ...options }), username);

	const aiErrors = new Set(["no-response", "overload", "timeout"]);
  let tgChannel;
  let messages = [];

  bot.once("login", () => {
    bot.addChatPattern(
      "login_request",
      /\s?\[\!\]\sНужно войти в аккаунт:\s\/l\sпароль\s*/gi,
      { repeat: false },
    );
    bot.addChatPattern("dm", /\[(.*) -> Я\]\s(.*)/i, { parse: true });
    bot.addChatPattern("adm", /\[Grumm -> Я\]\s(.*)/i, { parse: true });
  });

  // print pswd, if requested
  bot.once("chat:login_request", () => {
    bot.chat(config.login + process.env[config.bots[username].pswd]);
  });

  bot.once("spawn", () => {
    bot.log("joined lobby");
    bot.chat(config.bots[username].enterCommand);

    bot.once("spawn", () => {
			bot.setControlState("sneak", config.bots[username].sneak)
    
      bot.log("joined server");
      bot.on("spawn", async () => {
      	bot.chat(config.bots[username].enterCommand)

				try {
					await bot.waitForTick(3)
					bot.setControlState("sneak", false)
					await bot.waitForTick(3)
	      	bot.setControlState("sneak", config.bots[username].sneak)
	      } catch (e) {
	      	bot.log(`failed to wait for tick: ${e.name}: ${e.message}`)
	      	await sleep(250)
 					bot.setControlState("sneak", false)
 					await sleep(250)
 	      	bot.setControlState("sneak", config.bots[username].sneak)
	      }
      });
    });
  });

  bot.on("chat:dm", async (msg) => {
    if (!tgChannel) {
      tgChannel = (await tgbot.getChat(config.bots[username].tgChat)).username;
    }
		const [name, message] = msg[0]
		
		const fallback = `привет, я ботек грума. я пересылаю все сообщения отсюда, в дискорд и тг. переходи в @${tgChannel} в телеграмме, или в ${config.dclink} в дискорде. след ответ будет от ии(наверное)`
		let ans = fallback

		if (!informed[name]) {
			bot.chat(`/msg ${name} ${ans}`)
			informed[name] = []
			return
		} else if (informed[name].length >= config.ai.history*2) {
			informed[name].splice(0, 2)
		}

		informed[name].push({ role: "user", parts: [{ text: message }] })
		
		ans = await aiResponse(informed[name], 255-6-name.length)
    if (ans && !aiErrors.has(ans)) {
    	informed[name].push({ role: "model", parts: [{ text: ans }] })
    } else {
    	ans = config?.ai?.errors?.[ans] || fallback
    }
    
    bot.chat(`/msg ${name} ${ans}`)
  });


	const motdRegex = new RegExp('§(?:[#][0-9a-f]{6}|[0-9a-fk-or])', 'gi')
  bot.on("chat:adm", (msg) => {
  	if (msg[0][0].trim() === "pl") {
  		const players = bot.players
			for (const player in players) {
				const motd = new ChatMessage(players[player].displayName.json).toMotd()
				
				console.log(motd)
			}
  	}
  })

  bot.on("message", (msg) => {
    if (!shouldIgnore(msg.toString())) {
      messages.push(msg);
    }
  });

  bot.on("end", (reason) => {
  	const msg = config.msg.end[reason] || config.msg.end.default
    bot.log(`session ended, due to: ${reason}`);
    bot.sendtg(msg);
    bot.senddc(msg);

    setTimeout(() => {process.exit(2)}, 500)
  });
  bot.on("error", (err) => {
    bot.log(`an error occured: ${err}`);
    bot.sendtg(config.msg.error);
    bot.senddc(config.msg.error);
  });
  bot.on("kicked", (reason, loggedIn) => {
    loggedIn = loggedIn
      ? "\x1b[32mlogged in\x1b[0m"
      : "\x1b[31mnot logged in\x1b[0m";
    bot.log(`Bot kicked ${loggedIn}\n${reason}`);
    bot.sendtg(config.msg.kick);
    bot.senddc(config.msg.kick);
  });

  setInterval(() => {
    const msgs = messages.map((m) => dateAdder(m.toString().trim()));
    messages = [];

    if (msg) {
      bot.sendtg(replaceMsg(msg.join("\n")));
      bot.senddc(config.allowFormatting ? msg : escape(msg));
    }
  }, config.sendMsgInterval);

  return bot
}


let bots = [];
(async () => {
  for (const bot in config.bots) {
    bots.push(createBot(bot));
    await sleep(config.interval);
  }
})();


process.on('SIGTERM', async () => {
  for (let bot of bots) {
    bot.quit()
  }

  setTimeout(() => {process.exit(0)}, 500)
});

process.on('SIGINT', () => {
  for (let bot of bots) {
    bot.quit()
  }

  setTimeout(() => {process.exit(0)}, 500)
});
