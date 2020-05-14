exports.run = async (client, message, args, level) => { // eslint-disable-line no-unused-vars
  try {
    const lotto = client.lotto;
    const config = client.config;

    if (!lotto) {
      return message.reply('No active lotto. Why don\'t you start one?');
    }

    if (message.author !== lotto.starter) {
      return message.reply('Only the lotto starter can make the last call.');
    }

    if (lotto.winner) {
      return message.reply('The winner for this lotto has already been drawn.');
    }

    if (!lotto.lc) {
      return message.reply('Sorry, you may only make one `Last call!`');
    }

    const output = {
      'embed': {
        'color': config.color,
        'description': '@here Last call for lotto to win **' + lotto.prize + '**',
      }
    };
    lotto.channel.send(output);
    lotto.lc = false;
    message.delete();

  } catch (e) {
    client.logger.error(`Error executing 'lastcall' command: ${e}`);
  }
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ['lc'],
  permLevel: 'User',
};

exports.help = {
  name: 'lastcall',
};
