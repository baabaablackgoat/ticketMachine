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
	switch (args[0].toLowerCase()) {
		case "tickets":
		case "bal":
		case "balance":
			ticketBalanceDisplayer(args, msg)
			break;
		case "give":
		case "add":
			ticketGiver(args, msg);
			break;
		case "source":
		case "credits":
			showCredits(args, msg);
			break;
		case "raffle":
		case "newraffle":
		case "createraffle":
			raffleCreator(args, msg);
			break;
		case "join":
		case "enter":
			raffleEnterer(args, msg);
			break;
	}
});


function authorHasPermission(msg: Discord.Message) : boolean {
	// returns true if permissions are acceptable, if not, sends rejection message to channel and returns false.
	if (msg.channel.type != 'text') return false;
	if (!msg.member.hasPermission('MANAGE_GUILD')) {
		msg.channel.send(new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'You don\'t have access to this command.', description: "Admins: You need MANAGE_GUILD to use this."}))
			.catch(e => {console.log(`Couldn't send message: ${e}`)});
		return false;
	}
	return true;
}

function intCheck(a: number) : boolean {
	return !(Number.isNaN(a) || a > ((2**31)-1) || a < (-1)*((2**31)-1))
}

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

function resolveGuildChannel(resolvable: string, guild: Discord.Guild) : Discord.TextChannel | void {
	const channelRegex = /^<#\d+>$/;
	if (channelRegex.test(resolvable)) resolvable = resolvable.substring(2, resolvable.length - 1);
	let out = guild.channels.resolve(resolvable);
	if (out && out instanceof Discord.TextChannel) return out;
}

async function ticketBalanceDisplayer(args: Array<string>, msg: Discord.Message): Promise<void> {
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
				.catch(e => {console.log(`Couldn't send message: ${e}`)});
			return;
		}
		msg.channel.send(new Discord.MessageEmbed({color: embedColors.Default, author:{name:targetUser.username, iconURL: targetUser.avatarURL()}, title: `🎟 ${bal}`}))
			.catch(e => {console.log(`Couldn't send message: ${e}`)});
	}
}

async function ticketGiver(args: Array<string>, msg: Discord.Message): Promise<void> {
	if (!authorHasPermission(msg)) return;

	if (args.length < 3) {
		msg.channel.send(new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Not enough arguments specified.', description: "Usage: -add <user> <amount>"}))
			.catch(e => {console.log(`Couldn't send message: ${e}`)});
		return;
	}
	let targetMember = await getTargetMember(msg, args[1]);
	if (!targetMember) {
		msg.channel.send(new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Noone found matching your filters.', description: "If you're not using mentions and the username has spaces, make sure to put it in quotes."}))
			.catch(e => {console.log(`Couldn't send message: ${e}`)});
		return;	
	}
	let targetUser = targetMember.user;
	let ticketAmount = parseInt(args[2]);
	if (!intCheck(ticketAmount)) {
		msg.channel.send(new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Invalid ticket amount specified.', description: "Make sure to specify an *integer* for the ticket amount."}))
			.catch(e => {console.log(`Couldn't send message: ${e}`)});
		return;
	}
	if (targetUser) {
		let newTickets = await db.addUserTickets(targetUser, ticketAmount);
		msg.channel.send(new Discord.MessageEmbed({color: embedColors.Default, author:{name:targetUser.username, iconURL: targetUser.avatarURL()}, title: `New balance: 🎟 ${newTickets}`}))
			.catch(e => {console.log(`Couldn't send message: ${e}`)});
	}
}

async function raffleCreator(args: Array<string>, msg: Discord.Message) {
	if (msg.channel.type != 'text') return;
	if (!authorHasPermission(msg)) return;
	//args[1-4] are as follows: keyword, description (defaults to keyword), ticket amount (default 1), target text channel (default where message was sent)
	if (args.length < 2) {
		raffleCreatorArgsErr('Not enough arguments.', msg);
		return;
	}
	let entryKeyword : string = args[1];
	let raffleDescription : string = args[2] ? args[2] : entryKeyword;
	let entryCost = 1;
	if (args.length >= 4) {
		entryCost = parseInt(args[3]);
		if (!intCheck(entryCost) || entryCost < 0) {
			raffleCreatorArgsErr('Entry cost is invalid.', msg);
			return;
		}
	}
	let targetChannel: Discord.TextChannel | void = msg.channel;
	if (args.length >= 5) {
		targetChannel = resolveGuildChannel(args[4], msg.guild);
		if (!targetChannel) {
			raffleCreatorArgsErr('Couldn\'t resolve target channel.', msg);
			return;
		}
	}

	targetChannel.send(`🎟 Preparing a raffle, please wait...`)
		.then(targetMsg => {
			db.createRaffle(targetMsg, entryKeyword, entryCost)
				.then(success => {
					if (success) {
						targetMsg.edit('', new Discord.MessageEmbed({
							color: embedColors.Default,
							title: raffleDescription,
							description: `Enter the raffle with \`${prefix}enter ${entryKeyword} <ticketAmount>\`\nMinimum entry fee: ${entryCost} 🎟`
						}))
						.then(targetMsg => {
							if (targetChannel != msg.channel) {
								msg.channel.send(new Discord.MessageEmbed({
									color: embedColors.Ok,
									title: 'Raffle has been created!',
								})).catch(e => console.log(`Couldn't send message: ${e}`))
							}
						})
						.catch(e => console.log(`Couldn't edit message: ${e}`));
						;
					}
				})
				.catch(e => {
					msg.channel.send(new Discord.MessageEmbed({color: embedColors.Error, title: 'Failed to create new raffle', description: `Database returned error: ${e}`,}))
						.catch(e => console.log(`Couldn't send message: ${e}`));
					targetMsg.delete({reason: 'Raffle creation failed, cleaning up'}).catch(e => {console.log(`Failed to delete message: ${e}`)});
				});
		})
		.catch(e => {
			raffleCreatorArgsErr('Failed to send message to target channel.', msg);
		});

	
}

function raffleCreatorArgsErr(errType: string, msg: Discord.Message) {
	msg.channel.send(new Discord.MessageEmbed({
		color: embedColors.Error, title: errType, description: "Raffle creation takes between one and four arguments, in this order:",
		fields: [
			{name: 'Keyword', value: 'The keyword to enter the raffle. Make sure this keyword isn\'t already in active use!'},
			{name: 'Description', value: 'Defaults to the keyword. Will show up in the raffle announcement as the title.'},
			{name: 'Ticket amount', value: 'Defaults to 1. The amount of tickets the raffle costs to enter (any int >= 0).'},
			{name: 'Message channel', value: 'Defaults to the channel the invoking message was sent in, otherwise the text channel to send the message to.'}
		]
	}))
		.catch(e => {console.log(`Couldn't send message: ${e}`)});
}

async function raffleEnterer(args : Array<string>, msg: Discord.Message) : Promise<void> {
	if (args.length < 2) {
		raffleEnterArgsErr('No raffle keyword specified.', msg);
		return;
	}
	let entryAmount : number | undefined;
	if (args.length >= 3) {
		entryAmount = parseInt(args[2]);
		if (!intCheck(entryAmount) || entryAmount < 0) {
			raffleEnterArgsErr('Invalid ticket amount specified.', msg);
			return;
		}
	}
	db.enterRaffle(msg.author, args[1], entryAmount)
		.then(newBalance => {
			msg.channel.send(new Discord.MessageEmbed({
				color: embedColors.Ok,
				title: `Entered raffle ${args[1]}.`,
				description: `New ticket balance: ${newBalance} 🎟`
			})).catch(e => console.log(`Couldn't send message: ${e}`));
		})
		.catch(e => {
			if (e.message.includes('User does not have enough tickets to enter.')) raffleEnterArgsErr('You don\'t have enough tickets.', msg);
			else if (e.message.includes('which has min. ticket count of')) raffleEnterArgsErr('You are trying to enter with too few tickets.', msg);
			else if (e.message.includes('No active raffle found with associated keyword')) raffleEnterArgsErr('That raffle does not exist.', msg);
			else if (e.message.includes('User is already entered into free raffle')) raffleEnterArgsErr('Free raffles can only have one entry per user.', msg);
			else raffleEnterArgsErr('Something went wrong...', msg, e.message);
		});
}

function raffleEnterArgsErr(errType: string, msg: Discord.Message, details? : string) {
	let embed = new Discord.MessageEmbed({color: embedColors.Error, title: errType, description: details ? details : "Joining raffles takes either one or two arguments:"});
	if (!details) {
		embed.fields = [
			{name: 'Keyword', value: 'The keyword to enter the raffle.', inline: false},
			{name: 'Ticket amount', value: 'Defaults to the minimum amount of tickets. If a raffle has an entry fee, you can use multiple tickets (as long as you meet the entry fee) to get more entries into the raffle.', inline: false}
		];
	}
	msg.channel.send(embed)
		.catch(e => {console.log(`Couldn't send message: ${e}`)});
}



function showCredits(args: Array<string>, msg: Discord.Message): void {
	msg.channel.send(new Discord.MessageEmbed({
		color: embedColors.Default,
		author: {name: 'Ticket Machine', iconURL: client.user.avatarURL()},
		title: 'Source public on GitHub, made using discord.js.org',
		url: 'https://github.com/baabaablackgoat/ticketMachine',
		footer: {
			text: 'Made with ❤ by baa baa black goat',
			iconURL: 'https://blackgoat.dev/favicon.png'
		}
	})).catch(e => {console.log(`Couldn't send message: ${e}`)});
}


client.login(discordToken).catch(err => console.error("Couldn't log in: " + err));
