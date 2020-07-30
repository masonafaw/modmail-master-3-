exports.run = (client, message, args) => {
  const ConfigService = require("../config.js");
  let isOwner = require("../modules/isOwner.js");
  if (isOwner(message, true)) {
    client.destroy(err => {
      console.log("====================");
      console.log("Command: [!@shutdown] run by " + message.author.username);
      console.log("====================");
      console.log(err);
    });
  }
};

exports.cmd = {
  enabled: true,
  category: "Admin",
  level: 3,
  description: "Force shutdown bot"
};
