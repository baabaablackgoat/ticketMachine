import * as Discord from 'discord.js';
import stringArgv from 'string-argv';
import getEnv from "./functions/getEnv";
import * as db from "./functions/dbInteract";
import embedColors from "./classes/embedColors";

const client = new Discord.Client();
const discordToken = getEnv("DISCORD_TICKETS_TOKEN");
const prefix = "-"

client.on('ready', () => {
	console.log(`Discord - Logged in. ${client.user.tag}`)
});

client.on('message', (msg) => {
	if (msg.author.bot || msg.channel.type != 'text' ||!msg.content.startsWith(prefix)) return;
	let args = stringArgv(msg.content.substring(prefix.length));
	switch (args[0]) {
		case "tickets":
			ticketBalanceDisplayer(args, msg)
			break;
		case "bal":
			ticketBalanceDisplayer(args, msg)
			break;
		case "balance":
			ticketBalanceDisplayer(args, msg)
			break;
		case "give":
			ticketGiver(args, msg);
			break;
		case "add":
			ticketGiver(args, msg);
			break;
	}
});

const mentionRegex = /^<@!\d+>$/;
async function getTargetMember(msg: Discord.Message, arg: string) : Promise<Discord.GuildMember | void> {
	if (msg.guild.available) {
		if (mentionRegex.test(arg)){
			return msg.guild.members.fetch(arg.substring(3, arg.length - 1))
				.then(res => {
					if (res) return res;
				})
				.catch(e => {
					console.log(e);
				});
		} else {
			return msg.guild.members.fetch({query: arg, limit: 2})
				.then(res => {
					if (res.size != 1) throw new Error(`Couldn't identify user`);
					else return res.first();
				})
				.catch(e => {
					console.log(e);
				})
		}
	}
	return null;
}

async function ticketBalanceDisplayer(args: Array<string>, msg: Discord.Message) {
	let targetUser: Discord.User;
	if (args.length < 2) targetUser = msg.author;
	else {
		let targetMember = await getTargetMember(msg, args[1]);
		if (targetMember) targetUser = targetMember.user;
	}
	if (targetUser) {
		const bal = await db.getUserTicketCount(targetUser);
		if (bal == undefined) {
			msg.channel.send(new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Something went wrong...', description: "Couldn't retrieve user data."}))
			return;
		}
		msg.channel.send(new Discord.MessageEmbed({color: embedColors.Default, author:{name:targetUser.username, iconURL: targetUser.avatarURL()}, title: `🎟 ${bal}`}))
	}
}

async function ticketGiver(args: Array<string>, msg: Discord.Message) {
	if (args.length < 3) {
		msg.channel.send(new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Not enough arguments specified.', description: "Usage: -add <user> <amount>"}));
		return;
	}
	let targetMember = await getTargetMember(msg, args[1]);
	if (!targetMember) {
		msg.channel.send(new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Noone found matching your filters.', description: "If you're not using mentions and the username has spaces, make sure to put it in quotes."}));
		return;	
	}
	let targetUser = targetMember.user;
	let ticketAmount = parseInt(args[2]);
	if (isNaN(ticketAmount)) {
		msg.channel.send(new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Invalid ticket amount specified.', description: "r u havin a giggle m8"}));
		return;
	}
	if (targetUser) {
		let newTickets = await db.addUserTickets(targetUser, ticketAmount);
		msg.channel.send(new Discord.MessageEmbed({color: embedColors.Default, author:{name:targetUser.username, iconURL: targetUser.avatarURL()}, title: `New balance: 🎟 ${newTickets}`}));
	}
}

client.login(discordToken).catch(err => console.error("Couldn't log in: " + err));
