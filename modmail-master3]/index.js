const Discord = require("discord.js");
const client = new Discord.Client({ autoReconnect: true });
const ConfigService = require("./src/config.js");
const fs = require("fs");
const schedule = require("node-schedule");
const Enmap = require("enmap");
const fetch = require("node-fetch");
const date = require("dateformat");

//modules init.
client.isAdmin = require("./modules/isAdmin.js");
client.isMod = require("./modules/isMod.js");
client.isOwner = require("./modules/isOwner.js");
client.error = require("./modules/errorMod.js");
client.console = require("./modules/consoleMod.js");
client.log = require("./modules/logMod.js");
client.ConfigService = require("./src/config.js");

client.login(client.ConfigService.config.token);

// This loop reads the /events/ folder and attaches each event file to the appropriate event.
fs.readdir("./events/", (err, files) => {
  if (err) return client.console(err);
  files.forEach(file => {
    if (file.startsWith(".")) {
      return;
    }
    let eventFunction = require(`./events/${file}`);
    let eventName = file.split(".")[0];
    // super-secret recipe to call events with all their proper arguments *after* the `client` var.
    client.on(eventName, (...args) => eventFunction.run(client, ...args));
  });
});

//cooldown
const talkedRecently = new Set();
module.exports = function cooldown(message, code) {
  const error = require("./modules/errorMod.js");

  if (talkedRecently.has(message.author.id)) {
    return error("Wait 6 seconds before typing this again.", message);
  } else {
    code();
    talkedRecently.add(message.author.id);
    setTimeout(() => {
      talkedRecently.delete(message.author.id);
    }, 6000);
  }
};

let guild = "";
let admin = "";

client.on("ready", () => {
  guild = client.guilds.get(`${client.ConfigService.config.guildID}`);
  admin = guild.roles.find(r => r.name == `${client.ConfigService.config.role.admin}`);
  let mailCategory = guild.channels.find(category => category.name == `${client.ConfigService.config.channel.categoryName}` && category.type == "category");
  schedule.scheduleJob("0 17 * * *", function() {
    if (mailCategory.children.size > 0) {
      let msg = `There are ${mailCategory.children.size} unanswered tickets!`;
      if (mailCategory.children.size == 1) msg = `There is ${mailCategory.children.size} unanswered ticket!`;
      guild.channels
        .find(ch => ch.name == `${client.ConfigService.config.channel.log}`)
        .send("@everyone", {
          embed: {
            color: 3447003,
            description: msg
          }
        });
    }
  });
});

const cc = new Enmap({
  name: "cc",
  autoFetch: true,
  fetchAll: true
});

client.ccSize = cc.size;

client.on("message", message => {
  //message template for user DM and guild channel(s)
  // const { embed } = `[**${message.author.username}**] ` + message.content;
  const embed = {
    description: `${message.content}`,
    color: 5767016,
    timestamp: Date.now(),
    footer: {
      icon_url: `${client.user.avatarURL}`
    },
    author: {
      name: `New Message: ${message.author.username}`,
      icon_url: `${message.author.avatarURL}`
    }
  };

  //make a chatlog of the modmail discussion
  function chatlog(message, channel, content) {
    const format = `[${date(Date.now(), "dddd, mmmm dS, yyyy, h:MM:ss TT")} PST] [${message.author.username}#${message.author.discriminator}] ${content}\n`;
    if (fs.existsSync(`./logs/${channel}.txt`)) {
      fs.appendFile(`./logs/${channel}.txt`, format, err => {
        if (err) throw err;
        console.log(`new message: ${format}`);
      });
    } else {
      fs.writeFileSync(`./logs/${channel}.txt`, "===START MODMAIL===\n" + format);
      console.log(`new log made: ${format}`);
    }
  }

  //commands system
  if (message.channel.type == "text" && message.content.startsWith(client.ConfigService.config.prefix) && message.channel.parent.name == `${client.ConfigService.config.channel.categoryName}` && client.isAdmin(message.author, message, false)) {
    //create commands here
    switch (
      message.content
        .split(" ")[0]
        .replace(`${client.ConfigService.config.prefix}`, " ")
        .trim()
    ) {
      case "close":
        let member = message.guild.members.get(message.channel.name);
        member.send({
          embed: {
            color: 3447003,
            description: "Your ticket was closed by an administrator. If you need help again, send a message here!"
          }
        });
        let closeReason = message.content.slice(6) || "No reason";
        fs.appendFile(`./logs/${message.channel.name}.txt`, `\n===MODMAIL CLOSED ON ${date(Date.now(), "dddd, mmmm dS, yyyy, h:MM:ss TT")}===\nReason: ${closeReason}`, err => {
          if (err) throw err;
          client.log("Ticket Closed", `<@${message.channel.name}>'s  support ticket was closed for reason \`\`\`${closeReason}\`\`\``, 3447003, message, client);
          const attachment = new Discord.Attachment(`./logs/${message.channel.name}.txt`, `${date(Date.now(), "isoDateTime")}_${member.user.username.replace(" ", "_")}.txt`);
          message.guild.channels.find(ch => ch.name == client.ConfigService.config.channel.log).send(attachment);
        });
        setTimeout(function() {
          fs.unlink(`./logs/${message.channel.name}.txt`, err => {
            if (err) throw err;
          });
        }, 3000);
        message.channel.delete();
        return;
        break;
      default:
        return message.react("❌");
    }
  }

  // send message from modmail guild channel(s) to the user DM
  if (message.channel.type == "text" && !message.author.bot && !message.content.startsWith(client.ConfigService.config.prefix) && message.channel.parent.name == `${client.ConfigService.config.channel.categoryName}`) {
    let member = message.guild.members.get(message.channel.name);
    if (message.attachments.size > 0) {
      member.send({ embed } + " " + message.attachments.first().url).then(msg => {
        message.react("✅");
      });
      chatlog(message, message.channel.name, message.content + " " + message.attachments.first().url);
    } else {
      if (guild.member(message.channel.name)) {
        member.send({ embed }).then(msg => {
          message.react("✅");
        });
        chatlog(message, message.channel.name, message.content);
      } else {
        client.log("Invalid ModMail Channel", `Could not find user ID \`${message.channel.name}\` in guild.`, 16711747, message, client);
        fs.unlinkSync(message.channel.name);
        message.channel.delete();
      }
    }
  }

  // send message from user DM to modmail guild channel(s)
  if (message.channel.type == "dm" && !message.author.bot) {
    //help command
    if (message.content.startsWith(`${client.ConfigService.config.prefix}help`)) {
      return require("./commands/help.js").run(client, message);
    }
    //modmail category to house the operation
    let category = guild.channels.find(c => c.name == `${client.ConfigService.config.channel.categoryName}` && c.type == "category");
    //if the category does not exist. make it!
    if (!category) {
      guild.createChannel(`${client.ConfigService.config.channel.categoryName}`, {
        type: "category",
        /*
        @TODO
        - FIX PERMS
        */
        permissionOverwrites: [
          {
            id: guild.id,
            deny: ["READ_MESSAGES"]
          },
          {
            id: admin.id,
            allow: ["READ_MESSAGES"]
          }
        ]
      });
    }
    //if the user does not have an open "ticket" (channel created) then make a new "ticket" (channel)
    if (!guild.channels.exists(ch => ch.name == message.author.id)) {
      guild.createChannel(`${message.author.id}`, "text").then(async channel => {
        let category = guild.channels.find(c => c.name == `${client.ConfigService.config.channel.categoryName}` && c.type == "category");
        await channel.setTopic(`Ticket with: ${message.author.username}#${message.author.discriminator}\n<@${message.author.id}>`, "New modmail");
        await channel.setParent(category.id);
        await channel.lockPermissions();
        await channel.send({ embed });
        await message.author.send({
          embed: {
            color: 3447003,
            description: "Created new help ticket and sent your message to the admins! To send more messages and to chat with the administrators, just text me here! Any message that the admins see will be reacted with a ✅"
          }
        });
        await chatlog(message, channel.name, message.content);
        await channel.send("@everyone\n").then(msg => {
          msg.delete(1000);
        });
        ``;
        await message.react("✅");
      });
      client.log("Ticket Created", `${message.author} created a new support ticket with first message as: \`\`\`${message.content}\`\`\`\n[Jump to Message](${message.url})`, 3447003, message, client);
    } else {
      //if they got a "ticket" already send all their messages!
      let modChannel = guild.channels.find(c => c.name == message.author.id && c.type == "text");
      if (message.attachments.size > 0) {
        chatlog(message, message.author.id, message.content + " " + message.attachments.first().url);
        modChannel.send({ embed } + " " + message.attachments.first().url).then(msg => {
          message.react("✅");
        });
      } else {
        chatlog(message, message.author.id, message.content);
        modChannel.send({ embed }).then(msg => {
          message.react("✅");
        });
      }
    }
  }

  if (message.content.startsWith(`<@${client.user.id}> help`)) {
    let helpFile = require("./commands/help.js");
    return helpFile.run(client, message);
  }
  if (message.content.startsWith(`<@${client.user.id}> prefix`)) {
    let helpFile = require("./commands/help.js");
    return helpFile.run(client, message);
  }
  if (message.content.startsWith(`<@${client.user.id}>`)) {
    let helpFile = require("./commands/help.js");
    return helpFile.run(client, message);
  }

  // Command file manager code
  if (!message.guild || message.author.bot) return;
  if (!message.content.includes(ConfigService.config.prefix)) return;
  let command = message.content.split(" ")[0];
  command = command.slice(config.prefix.length);
  client.config = config;
  let args = message.content.split(" ").slice(1);

  // Regular command file manager
  try {
    cc.defer.then(() => {
      if (cc.has(command)) {
        return;
      } else {
        try {
          let commandFile = require(`./commands/${command}.js`);
          if (!commandFile.cmd.enabled) return client.error("This command is disabled", message);
          /*
            ==Levels==
            0 - @everyone
            1 - Mod
            2 - Admin
            3 - Owner only
            */
          function run() {
            commandFile.run(client, message, args, cc);
          }

          switch (commandFile.cmd.level) {
            case 0:
              run();
              break;
            case 1:
              if (client.isMod(message.author, message, client)) {
                run();
              }
              break;
            case 2:
              if (client.isAdmin(message.author, message, true, client)) {
                run();
              }
              break;
            case 3:
              if (client.isOwner(message, true, client)) {
                run();
              }
              break;
            default:
              client.error("There seems to be an error with permissions... This isn't good. Make sure your Admin, Mod and Owner fields have been inputted correctly.", message);
          }
        } catch (e) {
          console.error(e);
        }
      }
    });
  } catch (err) {
    if (client.ConfigService.config.debug == true) {
      console.error(err);
    }
  }

  //New Custom Command File System
  try {
    if (message.content.startsWith(client.ConfigService.config.prefix) && cc.has(command)) {
      cc.defer.then(() => {
        message.channel.send(cc.get(command));
      });
    } else {
      return;
    }
  } catch (e) {
    console.error(e);
  }
});
