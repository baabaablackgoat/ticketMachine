import * as Discord from 'discord.js';
import stringArgv from 'string-argv';
import getEnv from "./functions/getEnv";
import * as db from "./functions/dbInteract";
import embedColors from "./classes/embedColors";

const client = new Discord.Client({intents: [Discord.Intents.FLAGS.GUILD_MESSAGES]});
const discordToken = getEnv("DISCORD_TICKETS_TOKEN");
const allCommands: Array<Discord.ApplicationCommandData> = [
	// balance command
	{
		name: 'bal',
		description: 'Shows how many tickets you have. 🛠 can check anybody\'s balance.',
		options: [{
			name: 'user',
			type: 'USER',
			description: '🛠 The user to check for.',
			required: false
		}]
	},
	// give command
	{
		name: 'give',
		description: '🛠 Give or deduct tickets from any user.',
		options: [{
			name: 'user',
			type: 'USER',
			description: 'The user to target.',
			required: true
			},{
			name: 'amount',
			type: 'INTEGER',
			description: 'The amount of tickets to add or remove (use negative value to remove).',
			required: true
		}]
	},
	// credits command
	{
		name: 'credits',
		description: 'Show some information about this bot',
	},
	// raffle command
	{
		name: 'createRaffle',
		description: '🛠 Create a new raffle for users to participate in.',
		options: [{
			name: 'keyword',
			type: 'STRING',
			description: 'The keyword that refers to this raffle. No raffle with the same keyword may be unresolved!',
			required: true
		}, {
			name: 'description',
			type: 'STRING',
			description: 'The text to display on the raffle message itself. Defaults to the keyword if omitted.',
			required: false,
		}, {
			name: 'minEntryFee',
			type: 'INTEGER',
			description: 'The lowest amount of tickets to enter this fee. Set to 0 for free entry, one per user. Defaults to 1 if omitted.',
			required: false,
		}, {
			name: 'targetChannel',
			type: 'CHANNEL',
			description: 'The text channel to send the raffle message in. Defaults to where this command is executed if omitted.',
			required: false,
		}]
	},
	// join command
	{
		name: 'join',
		description: 'Join an ongoing raffle using the keyword!',
		options: [{
			name: 'keyword',
			type: 'STRING',
			description: 'The keyword associated with the raffle to enter.',
			required: true
		},{
			name: 'ticketAmount',
			type: 'INTEGER',
			description: 'The amount of entries you would like to make. Defaults to the minimum amount if omitted.',
			required: false
		}]
	},
	// resolve command
	{
		name: 'resolve',
		description: '🛠 Resolve a raffle using the given keyword.',
		options: [{
			name: 'keyword',
			type: 'STRING',
			description: 'The keyword associated with the raffle that shall be resolved.',
			required: true
		},{
			name: 'winnerCount',
			type: 'INTEGER',
			description: 'The amount of winners to draw. Defaults to 1 if omitted.',
			required: false
		}]
	},
	// createEvent command
	{
		name: 'createEvent',
		description: '🛠 Create a ticket redemption event for users to click on and get tickets with.',
		options: [{
			name: 'value',
			type: 'INTEGER',
			description: 'The amount of tickets to award. (Once per user per event.) Defaults to 1 if omitted.',
			required: false
		},{
			name: 'messageChannel',
			type: 'CHANNEL',
			description: 'The text channel where the redemption event is to be created. Defaults to the channel where this command is executed.',
			required: false
		}, {
			name: 'description',
			type: 'STRING',
			description: 'The text to display on the redemption event. Defaults to \'A pile of tickets lies on the ground.\'',
			required: false
		}, {
			name: 'expiryTime',
			type: 'INTEGER',
			description: 'The amount of time this event can be redeemed for. Defaults to 24 hours if omitted.',
			required: false
		}]
	}
];

client.on('ready', () => {
	console.log(`Discord - Logged in. ${client.user.tag}`);
	// todo: register slash commands here
	// probably detect if it should be global or local based on npm execution
});

client.on('interactionCreate', interaction => {
	if (interaction.isCommand()) { // Slash command interactions
		if (!interaction.user) {
			console.log(`ERR A command interaction was recieved, but it had no user associated to it.`);
			return;
		}
		switch (interaction.commandName) {
			case 'bal':
				ticketBalanceDisplayer(interaction);
				break;
			case 'give':
				ticketGiver(interaction);
				break;
			case 'credits':
				showCredits(interaction);
				break;
			case 'createRaffle':
				raffleCreator(interaction);
				break;
			case 'join':
				raffleEnterer(interaction);
				break;
			case 'resolve':
				raffleResolver(interaction);
				break;
			case 'createEvent':
				eventCreator(interaction);
				break;
		}
	} else if (interaction.isButton()) { // Button interactions
		// TODO
	}
});

function authorHasPermission(interaction: Discord.CommandInteraction){
	// returns true if the member who sent this message has MANAGE_GUILD permissions, otherwise false and sends the invoking user an ephemeral message rejecting command execution.
	if (!interaction.guild) {
		interaction.reply({
			embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'This command must be executed from a guild channel to check for your permissions.', description: `🛠 You need MANAGE_GUILD to use ${interaction.commandName}.`})],
			ephemeral: true
		})
		.then(() => {console.log(`INFO ${interaction.commandName} execution was rejected for ${interaction.user.tag}`)})
		.catch(e => {console.log(`WARN ${interaction.commandName} execution was rejected for ${interaction.user.tag}, but the reply could not be sent:\n${e}`)});
		return false;
	}
	/* 	
		The line below is necessary because it is possible that interaction.member can resolve as APIGuildMember and not as GuildMember.
		APIGuildMember does not support .has() because it is just the Bitfield, and not a discord.js Permissions object (which extends bitfield according to the docs)
		It might be reasonable to raise an issue for this on discord.js's repository. Use this as a screenshot: https://i.imgur.com/ZHkffpR.png
	*/
	let permissions = new Discord.Permissions(interaction.member.permissions);
	if (!permissions.has(Discord.Permissions.FLAGS.MANAGE_GUILD)){
		interaction.reply({
			embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'You don\'t have access to this command.', description: `🛠 You need MANAGE_GUILD to use ${interaction.commandName}.`})],
			ephemeral: true
		})
		.then(() => {console.log(`INFO ${interaction.commandName} execution was rejected for ${interaction.user.tag}`)})
		.catch(e => {console.log(`WARN ${interaction.commandName} execution was rejected for ${interaction.user.tag}, but the reply could not be sent:\n${e}`)});
		return false;
	}
	return true;
}

function intCheck(a: number | string | boolean) : boolean {
	return !(Number.isNaN(a) || a > ((2**31)-1) || a < (-1)*((2**31)-1))
}

async function ticketBalanceDisplayer(interaction: Discord.CommandInteraction) : Promise<void> {
	let {user: targetUser} = interaction.options.get('user');
	if (targetUser) {
		if (!authorHasPermission(interaction)) return;
	} else {
		targetUser = interaction.user;
		const bal = await db.getUserTicketCount(targetUser);
		if (bal == undefined) { // no balance found
			interaction.reply({
				embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Something went wrong...', description: "Couldn't retrieve user data."})],
				ephemeral: true
			}).then(msg => {console.log(`INFO No ticket balance found for ${targetUser.tag}`)})
				.catch(e => {console.log(`WARN No ticket balance found for ${targetUser.tag}, and the reply could not be sent:\n${e}`)});
			return;
		}
		interaction.reply({
			embeds: [new Discord.MessageEmbed({color: embedColors.Default, author:{name:targetUser.username, iconURL: targetUser.avatarURL()}, title: `🎟 ${bal}`})],
			ephemeral: true
		}).catch(e => {console.log(`WARN No ticket balance found for ${targetUser.tag}, and the reply could not be sent:\n${e}`)});
	}
}

async function ticketGiver(interaction: Discord.CommandInteraction) : Promise<void> {
	if (!authorHasPermission(interaction)) return;
	const {user : targetUser} = interaction.options.get('user');
	const {value : ticketAmount} = interaction.options.get('amount');
	if (!intCheck(ticketAmount)) {
		interaction.reply({
			embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Invalid ticket amount specified.', description: "Make sure to specify an *integer* for the ticket amount."})],
		}).then(msg => {console.log(`INFO Invalid ticket amount ${ticketAmount} was specified for give command`);})
		.catch(e => {console.log(`WARN Invalid ticket amount ${ticketAmount} was specified for give command, and reply could not be sent:\n${e}`);});
		return;
	}
	if (!targetUser) {
		interaction.reply({
			embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Something went wrong...', description: "No target user was recieved in your slash command request."})],
		}).then(msg => {console.log(`ERR Give command expects a user, but did not recieve one in the options. Interaction:\n${interaction}`);})
		.catch(e => {console.log(`ERR Give command expects a user, but did not recieve one in the options - and the reply could not be sent. Reply Error:\n${e}\n*****\nInteraction:\n${interaction}`);});
		return;
	}
	const newTickets = await db.addUserTickets(targetUser, Number(ticketAmount));
	interaction.reply({
		embeds: [new Discord.MessageEmbed({color: embedColors.Default, author:{name:targetUser.username, iconURL: targetUser.avatarURL()}, title: `New balance: 🎟 ${newTickets}`})],
		ephemeral: true
	}).catch(e => {console.log(`WARN A user was awarded tickets, but the distributor couldn't recieve the reply:\n${e}`)});

}

async function raffleCreator(interaction: Discord.CommandInteraction) : Promise<void> {
	if (!authorHasPermission(interaction)) return;
	const {value: entryKeyword} = interaction.options.get('keyword');
	const {value: raffleDescription = entryKeyword} = interaction.options.get('description');
	const {value: entryCost = 1} = interaction.options.get('minEntryFee');
	const {channel: targetChannel = interaction.channel} = interaction.options.get('targetChannel');

	if (typeof entryKeyword != 'string') {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Entry keyword is invalid.')],
			ephemeral: true
		}).then(() => {console.log(`INFO ${interaction.user.tag} attempted to create a raffle with invalid keyword ${entryKeyword}`)})
		.catch(e => {console.log(`WARN ${interaction.user.tag} attempted to create a raffle with invalid description ${entryKeyword}, but couldn't be notified:\n${e}`)})
		return;
	}
	if (entryKeyword.length > 100) {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Your entry keyword is too long. Please limit yourself to 100 characters.')],
			ephemeral: true
		}).then(() => {console.log(`INFO ${interaction.user.tag} attempted to create a raffle with overflowing keyword.`)})
		.catch(e => {console.log(`WARN ${interaction.user.tag} attempted to create a raffle with overflowing keyword, but couldn't be notified:\n${e}`)})
		return;
	}

	if (typeof raffleDescription != 'string') {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Raffle description is invalid.')],
			ephemeral: true
		}).then(() => {console.log(`INFO ${interaction.user.tag} attempted to create a raffle with invalid description ${raffleDescription}`)})
		.catch(e => {console.log(`WARN ${interaction.user.tag} attempted to create a raffle with invalid description ${raffleDescription}, but couldn't be notified:\n${e}`)})
		return;
	}
	if (raffleDescription.length > 256) {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Your raffle description is too long. Please limit yourself to 256 characters.')],
			ephemeral: true
		}).then(() => {console.log(`INFO ${interaction.user.tag} attempted to create a raffle with overflowing description.`)})
		.catch(e => {console.log(`WARN ${interaction.user.tag} attempted to create a raffle with overflowing description, but couldn't be notified:\n${e}`)})
		return;
	}

	if (typeof entryCost != 'number' || !intCheck(entryCost) || entryCost < 0) {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Entry cost is invalid.')],
			ephemeral: true
		}).then(() => {console.log(`INFO ${interaction.user.tag} attempted to create a raffle with invalid entry cost ${entryCost}.`)})
		.catch(e => {console.log(`WARN ${interaction.user.tag} attempted to create a raffle with invalid entry cost ${entryCost}, but couldn't be notified:\n${e}`)})
		return;
	}

	if (!(targetChannel instanceof Discord.TextChannel)) {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Target channel is invalid.')],
			ephemeral: true
		}).then(() => {console.log(`INFO ${interaction.user.tag} attempted to create a raffle with invalid target channel ${targetChannel}`)})
		.catch(e => {console.log(`WARN ${interaction.user.tag} attempted to create a raffle with invalid target channel, but couldn't be notified:\n${e}`)})
		return;
	}

	interaction.defer({ephemeral: true})
		.then(() => {
			targetChannel.send({content: `🎟 Preparing a raffle, please wait...`})
				.then(targetMsg => {
					db.createRaffle(targetMsg, entryKeyword, entryCost)
						.then(success => {
							if (success) {
								targetMsg.edit({embeds: [
									new Discord.MessageEmbed({
										color: embedColors.Default,
										author: {name: 'A wild raffle has appeared!', iconURL: client.user.avatarURL()},
										title: raffleDescription,
										description: `Enter the raffle with \`/join ${entryKeyword} <ticketAmount>\`\nMinimum entry fee: ${entryCost} 🎟`,
										fields: [{name: 'Entries', value: '0'}]
									})]
								}).then((editedMessage) => {
									interaction.editReply({
										embeds: [new Discord.MessageEmbed({
											color: embedColors.Ok,
											title: 'Raffle has been created!'})
										]}).catch(e => {console.log(`WARN Raffle was created, but the interaction couldn't be replied to:\n${e}`)})
								}).catch(e => {
									console.log(`WARN The raffle message couldn't be edited:\n${e}`)
								})
							}
						})
						.catch(e => {
							if (e.message.includes('Active raffle with keyword exists')) {
								interaction.editReply({embeds:[raffleCreatorArgsErr('An active raffle with this keyword already exists')]})
									.then(()=> {console.log(`INFO Raffle keyword ${entryKeyword} is occupied`)})
									.catch(e => {console.log(`WARN Raffle keyword ${entryKeyword} is occupied and the interaction couldn't be sent:\n${e}`)});
							}
							else {
								interaction.editReply({embeds:[raffleCreatorArgsErr('Something went wrong. The error has been dumped to console.')]})
									.then(()=> {console.log(`WARN Database error occurred upon raffle creation:\n${e}`)})
									.catch(msgE => {console.log(`WARN Database error occurred upon raffle creation and the interaction couldn't be sent.\nDB error:${e}\n****\n${msgE}`)});
							}
							targetMsg.delete().catch(e => {console.log(`WARN Failed to delete message: ${e}`)});
						});
				})
				.catch(e => {
					interaction.editReply({
						embeds:[new Discord.MessageEmbed({
							color: embedColors.Error,
							title: 'Failed to create raffle.',
							description: 'I couldn\'t send a message to the targeted channel. Do I have write messages permissions?'
						})]
					}).catch(e => {`WARN Couldn't edit interaction reply after raffle creation failed due to no message sending:\n${e}`})
					console.log(`WARN Couldn't send message to target channel.\n${e}`)
				});
		}).catch(e => console.log(`ERR Something went wrong while deferring raffle creation interaction:\n${e}`))
}

function raffleCreatorArgsErr(errType: string) : Discord.MessageEmbed {
	return new Discord.MessageEmbed({
		color: embedColors.Error, title: errType, description: "Raffle creation takes between one and four arguments, in this order:",
		fields: [
			{name: 'Keyword', value: 'The keyword to enter the raffle. Make sure this keyword isn\'t already in active use!'},
			{name: 'Description', value: 'Defaults to the keyword. Will show up in the raffle announcement as the title.'},
			{name: 'Ticket amount', value: 'Defaults to 1. The amount of tickets the raffle costs to enter (any int >= 0).'},
			{name: 'Message channel', value: 'Defaults to the channel the invoking message was sent in, otherwise the text channel to send the message to.'}
		]
	})
}

async function raffleEnterer(interaction: Discord.CommandInteraction) : Promise<void> {
	// TODO
}

async function raffleEntererOld(args : Array<string>, msg: Discord.Message) : Promise<void> {
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

function raffleEnterArgsErr(errType: string, details? : string) : Discord.MessageEmbed {
	let embed = new Discord.MessageEmbed({color: embedColors.Error, title: errType, description: details ? details : "Joining raffles takes either one or two arguments:"});
	if (!details) {
		embed.fields = [
			{name: 'Keyword', value: 'The keyword to enter the raffle.', inline: false},
			{name: 'Ticket amount', value: 'Defaults to the minimum amount of tickets. If a raffle has an entry fee, you can use multiple tickets (as long as you meet the entry fee) to get more entries into the raffle.', inline: false}
		];
	}
	return embed;
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

async function raffleResolver(interaction: Discord.CommandInteraction) : Promise<void> {
	// TODO
}

async function raffleResolverOld(args: Array<string>, msg: Discord.Message) {
	if (!authorHasPermissionOld(msg)) return;
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

function raffleResolverArgsErr(errType: string, details?: string) : Discord.MessageEmbed {
	return new Discord.MessageEmbed({
		color: embedColors.Error, title: errType, description: details ? details : `To resolve a raffle, use the keyword you've specified on raffle creation like this:\n\`${prefix}resolve keyword\``,
	});
}

async function eventCreator(interaction: Discord.CommandInteraction) : Promise<void> {
	// TODO
}

function eventCreatorOld(args: Array<string>, msg: Discord.Message){
	if (!authorHasPermissionOld(msg)) return;
	if (msg.channel.type != 'GUILD_TEXT') return;
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

function eventCreatorArgsErr(errType: string) {
	return new Discord.MessageEmbed({
		color: embedColors.Error, title: errType, description: "Event creation takes between none and four arguments, in this order:",
		fields: [
			{name: 'Ticket amount', value: 'Defaults to 1. If specified, will assign this many tickets on reaction.'},
			{name: 'Channel', value: 'Defaults to where your invoking message is sent. Configures where the message is going to be visible.'},
			{name: 'Description', value: 'Defaults to a small blurb, otherwise replaces the title of the message.'},
			{name: 'Expiry time', value: 'Defaults to one hour, maxes out at 24 hours. Specifies for how long (in minutes) tickets may be redeemed.'},
		]
	})
}

async function showCredits(interaction: Discord.CommandInteraction) : Promise<void> {
	interaction.reply({
		embeds: [new Discord.MessageEmbed({
			color: embedColors.Default,
			author: {name: 'Ticket Machine', iconURL: client.user.avatarURL()},
			title: 'Source public on GitHub, made using discord.js.org',
			url: 'https://github.com/baabaablackgoat/ticketMachine',
			footer: {
				text: 'Made with ❤ by baa baa black goat',
				iconURL: 'https://blackgoat.dev/favicon.png'
			}
		})],
		ephemeral: true
	}).catch(e => {console.log(`WARN Credits were requested, but the reply couldn't be sent:\n${e}`)});
}



client.login(discordToken).catch(err => {
	console.error("Couldn't log in: " + err)
	process.exit(1);
});
