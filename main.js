require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const mineflayer = require("mineflayer");

const config = require("./config.json");
const { escape, sleep, shouldIgnore, replaceMsg, aiResponse } = require("./utils.js")(config);
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
    if (!config.allowFormatting) message = escape(message)
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

  let tgChannel;
  let messages = [];

  bot.once("login", () => {
    bot.addChatPattern(
      "login_request",
      /\s?\[\!\]\sНужно войти в аккаунт:\s\/l\sпароль\s*/gi,
      { repeat: false },
    );
    bot.addChatPattern("dm", /\[(.*) -> Я\] (.*)/i, { parse: true });
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

				await bot?.waitForTick(3)
				bot.setControlState("sneak", false)
				await bot?.waitForTick(3)
      	bot.setControlState("sneak", config.bots[username].sneak)
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
    if (ans && ans !== "no-response") {
    	informed[name].push({ role: "model", parts: [{ text: ans }] })
    } else {
    	ans = fallback
    }
    bot.log(JSON.stringify(informed, null, 2))
    
    bot.chat(`/msg ${name} ${ans}`)
  });

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
    const msg = messages.map((m) => m.toString().trim());
    messages = [];

    if (msg.length !== 0) {
      bot.sendtg(replaceMsg(msg.join("\n")));

      // const dcmsg = msg.map((m) => escape(m))
      bot.senddc(replaceMsg(msg.join("\n")));
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
