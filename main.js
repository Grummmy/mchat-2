require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const mineflayer = require("mineflayer");

const config = require("./config.json");
const { shouldIgnore, replaceMsg } = require("./utils.js")(config);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escape(text) {
  return text
    .replace(/([\\*_~`>|[\]()#+\-=!{}\.])/g, '\\$1') // `
    .replace(/@/g, '@\u200b');
}

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
    fetch(process.env[config.bots[username].dcWebhook], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message, embeds: null }),
    });
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
    bot.addChatPattern("dm", /\[(.*) -> Я\] /i, { parse: true });
  });

  // print pswd, if requested
  bot.once("chat:login_request", () => {
    bot.chat(config.login + config.bots[username].pswd);
  });

  bot.once("spawn", () => {
    bot.log("joined lobby");
    bot.chat(config.bots[username].enterCommand);

    bot.once("spawn", () => {
	  bot.setControlState("sneak", config.bots[username].sneak)
    
      bot.log("joined server");
      bot.on("spawn", async () => {
      	bot.chat(config.bots[username].enterCommand)
		await bot.waitForTick(3)
      	bot.setControlState("sneak", false)
      	await bot.waitForTick(3)
      	bot.setControlState("sneak", config.bots[username].sneak)
      });
    });
  });

  bot.on("chat:dm", async (msg) => {
    if (!tgChannel) {
      tgChannel = (await tgbot.getChat(config.bots[username].tgChat)).username;
    }
		// await sleep(1000)
    bot.chat(
      `/msg ${msg[0][0]} привет, я ботек грума. я пересылаю все сообщения отсюда, в дискорд и тг. переходи в @${tgChannel} в телеграмме, или в ${config.dclink} в дискорде.`,
    );
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
