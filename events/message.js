module.exports = (client, message) => {
  // Ignore all bots, unless you enjoy that sort of thing.
  if (message.author.bot) return;

  // Ignore messages not starting with the prefix (in config.json)
  if (message.content.indexOf(client.config.prefix) !== 0) return;

  // Parse the input into the command and arguments.
  const args = message.content.slice(client.config.prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  // Get the user or member's permission level from the elevation
  const level = client.getPermlevel(message);
  const userLogString = message.author.username + '(Level ' + level + ')';

  // Grab the command data from the client.commands or client.aliases Enmap.
  const cmd = client.commands.get(command) || client.commands.get(client.aliases.get(command));

  if (!cmd) {
    // That command doesn't exist. Check for a matching quotable.
    const memberQuote =
      client.quotedMembers.get(command) ||
      client.quotedMembers.get(client.quotedAliases.get(command));
    if (memberQuote) {
      // Found a matching quotable. Run the quote command.
      client.commands.get('quote').run(client, message, [command], level);
    }
    return;
  }

  // Log execution of the command.
  const commandLogString = args.length ? command + '(' + JSON.stringify(args) + ')' : command;
  client.logger.cmd(commandLogString + ' ' + userLogString);

  // Run the command
  cmd.run(client, message, args, level);
};
