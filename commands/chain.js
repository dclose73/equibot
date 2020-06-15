const CronJob = require('cron').CronJob;

/**
 * TODO:
 *   1. Allow both factions to have chain watchers running
 *   2. Add more granular control to start, pause, resume, stop.
 *      - `!chain start eq2` *
 */

/**
 * Starts the chain watcher which displays chain status every 30 seconds.
 *
 * @example   !chain
 */
exports.run = async (client, message, args, level) => { // eslint-disable-line no-unused-vars
  const faction = (args[0] || '').toUpperCase();

  /**
   * Returns an embed object for displaying chain status.
   *
   * @param   {Object}   chain   Chain object from API.
   * @return  {Object}   Embed object for display chain status.
   */
  function chainEmbed(chain, faction) {
    // Completed chain is in cool down.
    if (chain.cooldown) {
      client.chain[faction].stop();
      delete client.chain[faction];
      const milestones = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
      const completed = milestones.includes(chain.current);
      const title = completed ? `${faction} Chain Completed!` : `${faction} Chain Broken!`;
      return {
        content: `@here ${title}`,
        embed: {
          color: client.config.colors.default,
          author: {
            name: title
          },
          fields: [
            {
              name: 'Completed Hits',
              value: chain.current + (completed ? '' : ' of ' + chain.max),
              inline: false
            },
            {
              name: 'Ongoing Multiplier',
              value: chain.modifier + 'x',
              inline: false
            },
            {
              name: 'Cooldown Remaining',
              value: client.humanizeSeconds(chain.cooldown),
              inline: false
            }
          ]
        }
      }
    }

    // Active chain.
    if (chain.current) {
      const content = chain.timeout < 45 ? `@here ${faction} SAVE THE CHAIN: ${chain.timeout}s left!` : undefined;
      return {
        content: content,
        embed: {
          color: client.config.colors.default,
          author: {
            name: `${faction} Chain Active`
          },
          fields: [
            {
              name: 'Current',
              value: chain.current + ' of ' + chain.max,
              inline: true
            },
            {
              name: 'Timeout',
              value: client.humanizeSeconds(chain.timeout),
              inline: true
            },
            {
              name: 'Multiplier',
              value: chain.modifier + 'x',
              inline: true
            },
          ]
        }
      }
    }

    // No chain active.
    client.chain[faction].stop();
    delete client.chain[faction];
    return {
      embed: {
        color: client.config.colors.default,
        author: {
          name: `No Active Chain for ${faction}`
        },
        footer: {
          text: 'You should start one! Announce on chat that you want to start a mini-chain.'
        }
      }
    }
  }

  /**
   * Creates a CronJob to fetch chain info and display status every 30 seconds.
   *
   * @param   {Object}   channel   Discord channel object.
   * @param   {String}  [faction]  Faction nickname.
   * @return  {Object}   CronJob promise to send status message.
   */
  function createChainWatcher(channel, faction) {
    const apiKey = client.auth.factionApiKeys[faction.toLowerCase()] || client.auth.apiKey;
    const chainApiEndpoint = 'https://api.torn.com/faction/?selections=chain';
    const chainApiLink = chainApiEndpoint + '&key=' + apiKey;

    function fetchChainData() {
      client.logger.log('Fetching chain data');
      fetch(chainApiLink)
        .then(response => response.json())
        .then(data => {
          if (data.error) {
            return client.handleApiError(data, channel, chainApiEndpoint);
          }
          client.logger.debug(`Chain data: ${JSON.stringify(data.chain)}`);

          // Display a message if the chain is no longer active or if it is
          // active with fewer than 90 seconds on the timer.
          if (!data.chain.current || data.chain.timeout < 120) {
            channel.send(chainEmbed(data.chain || {}, faction));
          }
        })
        .catch(error => client.logger.error(JSON.stringify(error)));
    }
    return new CronJob('*/30 * * * * *', fetchChainData);
  }

  // Main
  try {
    if (!faction || !['EQ1', 'EQ2'].includes(faction)) {
      // No faction specified.
      return message.channel.send(`You must specify which faction to watch, either eq1 or eq2.`);
    }

    if (client.chain[faction]) {
      // Watcher is active. Cancel it.
      client.chain[faction].stop();
      delete client.chain[faction];
      client.logger.log(`Stopped chain watcher for ${faction}`);
      return message.channel.send(`Stopped chain watcher for ${faction}`);
    }

    // No watcher found. Start one.
    client.chain[faction] = createChainWatcher(message.channel, faction);
    client.chain[faction].start();
    const channelName = message.channel.name;
    client.logger.log(`Chain watcher started for ${faction} ${channelName ? 'in #' + channelName : ''}`);
    return message.channel.send(`Chain watcher started for ${faction}`);

  } catch (e) {
    client.logger.error(`Error executing 'chain' command: ${e}`);
  }
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: [],
  permLevel: 'Bot Support',
};

exports.help = {
  name: 'chain',
  category: 'Faction',
  description: 'Watches chain and displays status.',
  detailedDescription: 'Watches chain and displays status whenever the timer drops below two minutes. Typing the command a second time cancels the chain watcher.\n\nEnsure necessary API Keys in auth.js, one per faction.',
  usage: 'chain eq1|eq2',
};
