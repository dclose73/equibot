const fs = require("fs");
const fetch = require('isomorphic-fetch');
const Enmap = require("enmap");
const chalk = require("chalk");

const profileLink = 'https://www.torn.com/profiles.php?XID=';

module.exports = (client) => {

  // Attach public methods to the client.
  Object.assign(client, {
    decorateUser: decorateUser,
    filterItems: filterItems,
    formatNumber: formatNumber,
    getPermlevel: getPermlevel,
    getRandomItem: getRandomItem,
    getTornId: getTornId,
    getTornName: getTornName,
    handleApiError: handleApiError,
    loadCommand: loadCommand,
    loadCommandModules: loadCommandModules,
    loadEventModules: loadEventModules,
    loadMemberQuotes: loadMemberQuotes,
    loadPermissions: loadPermissions,
    loadTornData: loadTornData,
    setBotStatus: setBotStatus,
    unloadCommand: unloadCommand,
  });

  /**
   * Loads an event module.
   *
   * @param   {string}   filename  Filename of event module to load.
   * @return  {boolean}  True if loaded successfully.
   */
  function loadEvent(filename) {
    try {
      // If the file is not a JS file, ignore it.
      if (!filename.endsWith(".js")) { return false; }

      // Load the event file itself.
      const event = require(`../events/${filename}`);

      // Get the event name from the file name.
      let eventName = filename.split(".")[0];
      client.logger.debug(`Loading Event: ${eventName}`);

      // Call each event with `client` as the first argument.
      client.on(eventName, event.bind(null, client));

      // Don't store the event files in the require cache.
      delete require.cache[require.resolve(`../events/${filename}`)];

      // Signal that the event module was loaded successfully.
      return true;
    } catch (e) {
      client.logger.error(`Unable to load event ${filename}: ${e}`);

      // Signal to the outer function that the event module failed to load.
      return false;
    }
  }

  /**
   * Iterate over the folder ./events/ and attach each event module to the
   * appropriate event.
   */
  function loadEventModules() {
    fs.readdir("./events/", (err, files) => {
      let numLoadedEvents = 0;
      if (err) {
        return client.logger.error(err);
      }
      files.forEach(filename => {
        if (loadEvent(filename)) {
          numLoadedEvents = numLoadedEvents + 1;
        }
      });
      client.logger.ready(`Loaded a total of ${chalk.bgGreen(numLoadedEvents)} events.`);
    });
  }

  /**
   * Loads a command module.
   *
   * @param   {string}   filename  Filename of command module to load.
   * @return  {boolean}  True if loaded successfully.
   */
  function loadCommand(filename) {
    try {
      client.logger.debug(`Loading command: ${filename}`);
      const commandModule = require(`../commands/${filename}`);

      // If the command has an init function, then execute it.
      if (commandModule.init) {
        client.logger.debug(`Initializing command: ${filename}`);
        commandModule.init(client);
      }

      // Map the command module to the command name which sets the properties of
      // the command module: help, conf, and run.
      client.commands.set(commandModule.help.name, commandModule);

      // Map each alias to the primary command name.
      commandModule.conf.aliases.forEach(alias => {
        client.aliases.set(alias, commandModule.help.name);
      });

      // Signal that the command module was loaded successfully.
      return true;
    } catch (e) {
      client.logger.error(`Unable to load command ${filename}: ${e}`);

      // Signal to the outer function that the command module failed to load.
      return false;
    }
  }

  /**
   * Unloads a command module.
   */
  async function unloadCommand(commandName) {
    let command;
    if (client.commands.has(commandName)) {
      command = client.commands.get(commandName);
    } else if (client.aliases.has(commandName)) {
      command = client.commands.get(client.aliases.get(commandName));
    } else {
      client.logger.warn(`No command or alias \`${commandName}\` is loaded.`);
      return false;
    }

    // If the command has a shutdown function, then execute it. This must be an
    // async method.
    if (command.shutdown) {
      await command.shutdown(client);
    }

    // Remove the module from the require cache.
    client.logger.debug(`Unloading command: ${commandName}`);
    const mod = require.cache[require.resolve(`../commands/${command.help.name}`)];
    delete require.cache[require.resolve(`../commands/${command.help.name}.js`)];
    for (let i = 0; i < mod.parent.children.length; i++) {
      if (mod.parent.children[i] === mod) {
        mod.parent.children.splice(i, 1);
        break;
      }
    }

    // Signal that the command module was loaded successfully.
    return true;
  }

  /**
   * Iterate over the folder ./commands/ and load each command into memory.
   */
  function loadCommandModules() {
    // Initialize EnMaps for commands and aliases.
    client.commands = new Enmap();
    client.aliases = new Enmap();

    fs.readdir("./commands/", (err, files) => {
      let numLoadedCommands = 0;
      if (err) {
        return client.logger.error(err);
      }
      files.forEach(filename => {
        // If the file is not a JS file, ignore it.
        if (!filename.endsWith(".js")) { return false; }
        if (loadCommand(filename)) {
          numLoadedCommands = numLoadedCommands + 1;
        }
      });
      client.logger.ready(`Loaded a total of ${chalk.bgGreen(numLoadedCommands)} events.`);
    });
  }

  function loadMemberQuotes() {
    client.logger.debug(`Starting to load member quotes`);
    const memberQuotes = require("./quotes.json");

    // Initialize EnMaps of quoted member names and aliases.
    client.quotedMembers = new Enmap();
    client.quotedAliases = new Enmap();
    client.listOfQuotedMembers = [];

    memberQuotes.forEach(member => {
      const memberName = member.name.toLowerCase();

      // Add this member to the EnMap of quoted members.
      client.quotedMembers.set(memberName, member);

      // Add this member name to a simple list for easy randomization.
      client.listOfQuotedMembers.push(memberName);

      // Map each member alias to the primary member name.
      member.aliases.forEach(alias => {
        client.quotedAliases.set(alias.toLowerCase(), memberName);
      });
    });
    client.logger.ready(`Loaded quotes for ${chalk.bgGreen(client.quotedMembers.size)} members.`);
  }

  function loadTornData() {
    client.tornData = {};

    fetch('https://api.torn.com/torn/?selections=items&key=' + client.auth.apiKey)
      .then(data => data.json())
      .then(res => {
        client.tornData.itemHashById = res['items'];
        client.logger.ready('Loaded the Torn City item list.');
      })
      .catch(error => { client.logger.error(error) });
  }

  /**
   * Returns the permission level of the specified user.
   *
   * @param   {object}  message  Message object.
   * @return  {string}  Permission level of the user.
   */
  function getPermlevel(message) {
    let permlvl = 0;
    const permOrder = client.config.permLevels.slice(0).sort((p, c) => p.level < c.level ? 1 : -1);

    while (permOrder.length) {
      const currentLevel = permOrder.shift();
      if (message.guild && currentLevel.guildOnly) {
        continue;
      }
      if (currentLevel.check(message)) {
        permlvl = currentLevel.level;
        break;
      }
    }
    return permlvl;
  }

  /**
   * Generate a cache of client permissions for user-friendly perm names.
   */
  function loadPermissions() {
    client.levelCache = {};
    for (let i = 0; i < client.config.permLevels.length; i++) {
      const thisLevel = client.config.permLevels[i];
      client.levelCache[thisLevel.name] = thisLevel.level;
    }
  }

  /**
   * Sets the bot activity status.
   *
   * @example  "Playing lotto"
   * @example  "Watching for bugmuggers"
   * @example  "Listening to !help"
   *
   * @param  {string}  type  One of PLAYING|LISTENING|WATCHING.
   * @param  {string}  name  Name of activity.
   */
  function setBotStatus(type, name) {
    type = type || '';
    client.user.setActivity(name, { type: type.toUpperCase() });
  }

  /**
   * Returns a random item from the specified list.
   *
   * @param   {Array}   list    A list of items.
   * @return  {String}  A random item from the list.
   */
  function getRandomItem(list) {
    list = list || [];
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * Parses the parts of a member's Discord name.
   *
   * @param   {String}   name    A Discord member name.
   * @return  {Array[]}  The three string parts of a Discord name.
   */
  function getNameParts(name) {
    if (!name) {
      client.logger.error('Null `name` arg provided to `getNameParts(name)`');
      return ['unknownName [unknownId]', 'unknownName', '[unknownId]'];
    }

    // Parses the name into parts: ['Aarlo [2252482]', 'Aarlo', '[2252482]']
    return name.match(/(.*) \[(\d*)\]/) || '[unknownId]';
  }

  /**
   * Parses the parts of a member's Discord name.
   *
   * @param   {String}   name    A Discord member name.
   * @return  {String}   The Torn name for the Discord User.
   */
  function getTornName(name) {
    if (!name) {
      client.logger.error('Null `name` arg provided to `getTornName(name)`');
      return 'unknownName';
    }
    return getNameParts(name)[1];
  }

  /**
   * Parses the parts of a member's Discord name.
   *
   * @param   {String}   name    A Discord member name.
   * @return  {String}   The Torn ID for the Discord User.
   */
  function getTornId(name) {
    if (!name) {
      client.logger.error('Null `name` arg provided to `getTornId(name)`');
      return 'unknownId';
    }
    return getNameParts(name)[2];
  }

  /**
   * Returns the Guild User object corresponding to the provided Discord
   * User object.
   *
   * Discord User object:
      {
        "id": "550079162564476997",
        "bot": false,
        "username": "Aarlo",
        "discriminator": "2177",
        "avatar": "8c44b56f16aaf2ee32d39d39a7025913",
        "lastMessageChannelID": "580992963363078163",
        "flags": 0,
        "createdTimestamp": 1551219492332,
        "defaultAvatarURL": "string_url",
        "tag": "Aarlo#2177",
        "avatarURL": "string_url",
        "displayAvatarURL": "string_url"
      }
   *
   * Guild User object:
      {
        "guildID": "580992963363078157",
        "userID": "550079162564476997",
        "joinedTimestamp": 1558589916795,
        "lastMessageChannelID": "580992963363078163",
        "premiumSinceTimestamp": null,
        "deleted": false,
        "nickname": "Aarlo [2252482]",
        "displayName": "Aarlo [2252482]"
      }
   *
   * @param   {Object}   user      A Discord User object.
   * @param   {Object}   message   The current message object.
   * @return  {Object}   The corresponding Guild User object.
   */
  function decorateUser(user, message) {
    if (!user || !message) {
      client.logger.debug('Null arg(s) provided for `decorateUser(user, message)`');
      return;
    }
    client.logger.debug('decorateUser(' + user + ', ' + message + ')');

    const guildUser = message.guild.member(user);
    if (!guildUser) {
      client.logger.debug('could not decorateUser(' + user + ') because not in the guild');
      return user;
    }

    user.discordName = guildUser.displayName;
    user.tornName = getTornName(user.discordName);
    user.tornLink = profileLink + getTornId(user.discordName);

    return user;
  }

  function formatNumber(number) {
    let num = number.toString();
    let formatted = num.slice(-3);
    let n = -3;
    while (n > -(num.length)) {
      formatted = num.slice(n - 3, n) + ',' + formatted;
      n -= 3;
    }
    return formatted;
  }

  function filterItems(itemList, substring) {
    return Object.keys(itemList)
      .filter(key => itemList[key].name.toLowerCase().includes(substring.toLowerCase()))
      .reduce((obj, key) => {
        obj[key] = itemList[key];
        return obj;
      }, {});
  }

  /**
   * Parses API error message and displays both error log message and sends
   * message to guild channel.
   *
   * @param   {Object}   data       API Error data.
   * @param   {Object}   channel    Current channel for messaging.
   * @param   {String}   endpoint   API endpoint with this error.
   */
  function handleApiError(data, channel, endpoint) {
    if (!data || !data.error) {
      // No error info.
      return client.logger.error(`API Error: ${JSON.stringify(data)}`);
    }

    client.logger.error(`API Error: ${JSON.stringify(data.error)}`);

    const errorCodeHash = {
      0: 'Unhandled error, should not occur.',
      1: 'Private key is empty in current request.',
      2: 'Private key is wrong/incorrect format.',
      3: 'Requesting an incorrect basic type.',
      4: 'Requesting incorrect selection fields.',
      5: 'Current private key is banned for a small period of time because of too many requests (max 100 per minute).',
      6: 'Wrong ID value.',
      7: 'A requested selection is private (For example, personal data of another user / faction).',
      8: 'Current IP is banned for a small period of time because of abuse.',
      9: 'Api system is currently disabled.',
      10: 'Current key can\'t be used because owner is in federal jail.',
      11: 'Key change error: You can only change your API key once every 60 seconds.',
      12: 'Key read error: Error reading key from Database.',
    }

    const embedErrorResponse = {
      embed: {
        color: client.config.color,
        description: 'API Response Error',
        fields: [
          {
            name: 'Error Code',
            value: `${data.error.code}: ${data.error.error}`,
          },
          {
            name: 'Error Message',
            value: errorCodeHash[data.error.code],
          },
          {
            name: 'Endpoint',
            value: endpoint,
          }
        ],
        footer: {
          text: 'Send this info to Aarlo#2177 if he isn\'t around.'
        }
      }
    };

    if ([0, 9, 12].includes(data.error.code)) {
      embed.author = {
        name: 'Uh oh.. Ched broke the API again!'
      };
    }

    return channel.send(embedErrorResponse);
  }

};
