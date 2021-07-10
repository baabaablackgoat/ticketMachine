import * as Discord from 'discord.js';
import stringArgv from 'string-argv';
import getEnv from "./functions/getEnv";
import * as db from "./functions/dbInteract";
import embedColors from "./classes/embedColors";

const client = new Discord.Client();
const discordToken = getEnv("DISCORD_TICKETS_TOKEN");
const prefix = getEnv("DISCORD_TICKETS_PREFIX");

client.on('ready', () => {
	console.log(`Discord - Logged in. ${client.user.tag}`)
});

client.on('message', (msg) => {
	if (msg.author.bot || msg.channel.type != 'text' ||!msg.content.startsWith(prefix)) return;
	let args = stringArgv(msg.content.substring(prefix.length));
	if (args.length == 0 || args[0].length == 0) return;
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
		case "create":
			raffleCreator(args, msg);
			break;
		case "join":
		case "enter":
			raffleEnterer(args, msg);
			break;
		case "resolve":
			raffleResolver(args, msg);
			break;
		case "event":
		case "createevent":
		case "newevent":
			eventCreator(args, msg);
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


async function getTargetMember(msg: Discord.Message, arg: string) : Promise<Discord.GuildMember | void> {
	const mentionRegex = /^<@!?\d+>$/; // Notice: If the user has a set nickname, the mention has an additional !-mark after the @.
	if (msg.guild.available) {
		if (mentionRegex.test(arg)){
			arg = arg.slice(2,-1); // trim the always existing mention flags
			if (arg.startsWith('!')) { arg = arg.slice(1); } // trim nickname exclamation mark if necessary
			return msg.guild.members.fetch(arg)
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
	if (entryKeyword.length == 0 || entryKeyword.length > 100) {
		raffleCreatorArgsErr('Specified keyword is invalid.', msg);
		return;
	}
	let raffleDescription : string = args[2] ? args[2] : entryKeyword;
	if (raffleDescription.length > 256) {
		raffleCreatorArgsErr('Your description is too long. Please limit yourself to 256 characters or less.', msg);
		return;
	}
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
							author: {name: 'A wild raffle has appeared!', iconURL: client.user.avatarURL()},
							title: raffleDescription,
							description: `Enter the raffle with \`${prefix}enter ${entryKeyword} <ticketAmount>\`\nMinimum entry fee: ${entryCost} 🎟`,
							fields: [{name: 'Entries', value: 0}]
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
					if (e.message.includes('Active raffle with keyword exists')) raffleCreatorArgsErr('An active raffle with this keyword already exists', msg);
					else {
						raffleCreatorArgsErr('Something went wrong. The error has been dumped to console.', msg);
						console.log(e);
					}
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
	if (args[1].length == 0 || args[1].length > 100) {
		raffleEnterArgsErr('Invalid keyword specified.', msg);
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
		.then(res => {
			msg.channel.send(new Discord.MessageEmbed({
				color: embedColors.Ok,
				author: {name:msg.author.username, iconURL: msg.author.avatarURL()},
				title: `Entered raffle ${args[1]}.`,
				description: `New ticket balance: ${res.newBalance} 🎟`
			})).catch(e => console.log(`Couldn't send message: ${e}`));
			let displayMsgChannel = msg.guild.channels.resolve(res.channelID);
			if (displayMsgChannel instanceof Discord.TextChannel) {
				displayMsgChannel.messages.fetch(res.messageID)
					.then(displayMsg => {
						let embed : Discord.MessageEmbed = displayMsg.embeds[0];
						embed.fields[0].value = String(parseInt(embed.fields[0].value) + res.entryAmount);
						displayMsg.edit(embed).catch(e => {`Couldn't edit raffle display message: ${e}`});
					})
					.catch(e => {`Couldn't find raffle display message to edit: ${e}`})
			}
		})
		.catch(e => {
			if (e.message.includes('User does not have enough tickets to enter.')) raffleEnterArgsErr('You don\'t have enough tickets.', msg);
			else if (e.message.includes('which has min. ticket count of')) raffleEnterArgsErr('You are trying to enter with too few tickets.', msg);
			else if (e.message.includes('No active raffle found with associated keyword')) raffleEnterArgsErr('That raffle does not exist.', msg);
			else if (e.message.includes('User is already entered into free raffle')) raffleEnterArgsErr('Free raffles can only have one entry per user.', msg);
			else {
				raffleEnterArgsErr('Something went wrong...', msg, 'The error has been dumped to the console.');
				console.log(e);
			}

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

interface distributionEntry {
	userID: string,
	min: number,
	max: number
}

function randomInt(min: number, max: number) { //MDN
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function findWinnerInArray(list: Array<distributionEntry>, value: number): string | null {
	let found = null;
	for (let i=0; i<list.length; i++) {
		if (value >= list[i].min && value <= list[i].max) {
			found = list[i].userID;
			break;
		}
	}
	return found;
}

async function raffleResolver(args: Array<string>, msg: Discord.Message) {
	if (!authorHasPermission(msg)) return;
	if (args.length < 2) {
		raffleResolverArgsErr('You didn\'t specify which raffle to resolve', msg);
		return;
	}
	if (args[1].length < 0 || args[1].length > 100) {
		raffleResolverArgsErr('Invalid keyword specified.', msg);
		return;
	}
	let winnerCount = 1;
	if (args.length >= 3) {
		winnerCount = parseInt(args[2]);
		if (!intCheck(winnerCount)) {
			raffleResolverArgsErr('Invalid winner count specified.', msg);
			return;
		}
	}
	let allowDuplicates = false;
	if (args.length >= 4 && args[4] in ['y', 'yes', 'true', 'duplicates', 'dupes']) allowDuplicates = true;

	db.resolveRaffle(args[1]).then(async res => {
		let displayMsgChannel = msg.guild.channels.resolve(res.channelID);
		if (!(displayMsgChannel instanceof Discord.TextChannel)) return; // should always be true so never fires, this is for typescript to stop crying
		let displayMsg : Discord.Message;
		try {
			displayMsg = await displayMsgChannel.messages.fetch(res.messageID);
		} catch (e) {
			console.log(`The message initiating the raffle could not be found. Resolving the raffle will be continued. Error: ${e}`);
		}
		// no entries
		if (res.entries.length == 0) {
			if (displayMsg) {
				displayMsg.edit(new Discord.MessageEmbed({
					color: embedColors.Warning,
					title: `This raffle ${args[1]} has closed!`,
					description: `Noone participated...`
				})).catch(e => {`Couldn't edit the resolved raffle: ${e}`});
			}
			msg.channel.send(new Discord.MessageEmbed({
				color: embedColors.Warning,
				title: 'The results are in!',
				description: `The raffle ${args[1]} was closed, but noone participated.`,
			})).catch(e => {`The raffle was resolved with no participants, but the message acquitting this couldn't be sent. \nError: ${e}`});
			return;
		}


		let winnerIDs : Array<string> = []
		let totalEntries = 0;
		let distribution : Array<distributionEntry> = [];
		res.entries.forEach(el => {
			distribution.push({userID: el.userID, min: totalEntries + 1, max: totalEntries + el.entryCount})
			totalEntries += el.entryCount;
		});
		while (winnerIDs.length < winnerCount) {
			if (!allowDuplicates && winnerIDs.length >= res.entries.length) break;
			if (allowDuplicates && winnerIDs.length >= totalEntries) break;
			let newWinner = findWinnerInArray(distribution,randomInt(1, totalEntries));
			if (!newWinner) continue; // should theoretically never happen
			if (!allowDuplicates && winnerIDs.includes(newWinner)) continue;
			winnerIDs.push(newWinner);
		}
		let winnerUsernames : Array<string> = await Promise.all(winnerIDs.map(async id => {
			let member = await msg.guild.members.fetch(id);
			if (member != undefined) return member.user.tag;
			else return id;
		}));
		if (displayMsg) {
			displayMsg.edit(new Discord.MessageEmbed({
				color: embedColors.Ok,
				title: `This raffle ${args[1]} has closed!`,
				description: `Winners:\n${winnerUsernames.join('\n')}`
			})).catch(e => {`Couldn't edit the resolved raffle: ${e}`})
		}
		msg.channel.send(new Discord.MessageEmbed({
			color: embedColors.Ok,
			title: 'The results are in!',
			description: `The raffle ${args[1]} was closed.`,
			fields: [{name: 'Winners', value: winnerUsernames.join('\n')}]
		})).catch(e => {`The raffle was resolved but the resolve message couldn't be sent.\nSelected winners were ${winnerUsernames.join(',')}\nError: ${e}`});
	}).catch(e => {
		if (e.message.includes('Couldn\'t find raffle to resolve')) raffleResolverArgsErr('Couldn\'t find your specified raffle.', msg)
		else raffleResolverArgsErr('Something went wrong...', msg, 'The error has been dumped to the console.');
		console.log(e);
	})

}

function raffleResolverArgsErr(errType: string, msg: Discord.Message, details?: string) {
	msg.channel.send(new Discord.MessageEmbed({
		color: embedColors.Error, title: errType, description: details ? details : `To resolve a raffle, use the keyword you've specified on raffle creation like this:\n\`${prefix}resolve keyword\``,
	})).catch(e => {console.log(`Couldn't send message: ${e}`)});
}

function eventCreator(args: Array<string>, msg: Discord.Message){
	if (!authorHasPermission(msg)) return;
	if (msg.channel.type != 'text') return;
	let ticketCount = 1;
	if (args.length >= 2) {
		ticketCount = parseInt(args[1]);
		if (!intCheck(ticketCount) || ticketCount < 1) {
			eventCreatorArgsErr('Invalid ticket amount specified.', msg);
			return;
		}
	}
	let targetChannel : Discord.TextChannel = msg.channel;
	if (args.length >= 3) {
		let temp = resolveGuildChannel(args[2], msg.guild);
		if (!temp) {
			eventCreatorArgsErr('Could not resolve channel.',msg);
			return;
		} 
		targetChannel = temp ? temp : msg.channel; // typescript pls
	}
	let description = 'A pile of tickets lies on the ground.'
	if (args.length >= 4) {
		if (args[3].length > 256) {
			eventCreatorArgsErr('Your description is too long. Please limit yourself to 256 characters or less.', msg);
			return;
		}
		description = args[3];
	}
	let minutes = 60;
	if (args.length >= 5) {
		minutes = parseInt(args[4]);
		if (!intCheck(minutes) || minutes < 1 || minutes > 1440) {
			eventCreatorArgsErr('Your timeout is invalid. Please use values between 1 and 1440 minutes (= 24 hours)', msg);
			return;
		}
	}
	let timeout = minutes * 60000;

	db.createEvent(ticketCount)
		.then(eventID => {
			targetChannel.send(new Discord.MessageEmbed({
				color: embedColors.Default,
				title: description,
				description: `To collect your ${ticketCount} 🎟, react with 🎟`,
			}))
				.then(collectorMessage => {
					collectorMessage.react('🎟').catch(e => `Failed to react on collection message: ${e}`);
					const filter = (reaction: Discord.MessageReaction, user: Discord.User) => reaction.emoji.name == '🎟' && !user.bot;
					const eventCollector = collectorMessage.createReactionCollector(filter, {time: timeout});
					eventCollector.on('collect', (r, u) => {
						db.awardUserTickets(u, eventID)
							.catch(e => console.log(`Failed to award user with tickets for event ID ${eventID}: ${e}`))
					});
					eventCollector.on('end', (c, reason) => {
						collectorMessage.edit(new Discord.MessageEmbed({
							color: embedColors.Info,
							title: 'This ticket awarding ceremony has ended!',
						}));
						console.log(`Award ceremony for eventID ${eventID} has concluded: ${reason}`);
					});
				})
				.catch(e => {
					eventCreatorArgsErr('Something went wrong... The error was dumped to console.', msg);
					console.log(`Couldn't send event message: ${e}`)
				});
		})
		.catch(e => {
			eventCreatorArgsErr('Something went wrong... The error was dumped to console.', msg);
			console.log(e);
		})
}

function eventCreatorArgsErr(errType: string, msg: Discord.Message) {
	msg.channel.send(new Discord.MessageEmbed({
		color: embedColors.Error, title: errType, description: "Event creation takes between none and four arguments, in this order:",
		fields: [
			{name: 'Ticket amount', value: 'Defaults to 1. If specified, will assign this many tickets on reaction.'},
			{name: 'Channel', value: 'Defaults to where your invoking message is sent. Configures where the message is going to be visible.'},
			{name: 'Description', value: 'Defaults to a small blurb, otherwise replaces the title of the message.'},
			{name: 'Expiry time', value: 'Defaults to one hour, maxes out at 24 hours. Specifies for how long (in minutes) tickets may be redeemed.'},
		]
	}))
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
