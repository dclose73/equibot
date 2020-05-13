const fs = require("fs");
const chalk = require("chalk");

module.exports = (client) => {

  // Attach public methods to the client.
  Object.assign(client, {
    getPermlevel: getPermlevel,
    loadCommandModules: loadCommandModules,
    loadEventModules: loadEventModules,
    loadPermissions: loadPermissions,
    setBotStatus: setBotStatus,
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
      // If the file is not a JS file, ignore it.
      if (!filename.endsWith(".js")) { return false; }

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
      return `No command or alias \`${commandName}\` is loaded.`;
    }

    // If the command has a shutdown function, then execute it. This must be an
    // async method.
    if (command.shutdown) {
      client.logger.debug(`Shutting down command: ${commandName}`);
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
    return false;
  }

  /**
   * Iterate over the folder ./commands/ and load each command into memory.
   */
  function loadCommandModules() {
    fs.readdir("./commands/", (err, files) => {
      let numLoadedCommands = 0;
      if (err) {
        return client.logger.error(err);
      }
      files.forEach(filename => {
        if (loadCommand(filename)) {
          numLoadedCommands = numLoadedCommands + 1;
        }
      });
      client.logger.ready(`Loaded a total of ${chalk.bgGreen(numLoadedCommands)} events.`);
    });
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

};