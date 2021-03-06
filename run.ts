import * as Discord from 'discord.js';
import * as Moment from 'moment';
// import stringArgv from 'string-argv';
import getEnv from "./functions/getEnv";
import * as db from "./functions/dbInteract";
import embedColors from "./classes/embedColors";
import { log, warn, ok, err, info, debug } from './functions/logger';

const client = new Discord.Client({intents: [Discord.Intents.FLAGS.GUILD_MESSAGES, Discord.Intents.FLAGS.GUILDS]});
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
		name: 'createraffle',
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
			name: 'minentryfee',
			type: 'INTEGER',
			description: 'The lowest amount of tickets to enter this fee. Set to 0 for free entry, one per user. Default 1.',
			required: false,
		}, {
			name: 'targetchannel',
			type: 'CHANNEL',
			description: 'The text channel to send the raffle message in. Defaults to where this command is executed.',
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
			name: 'ticketamount',
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
			name: 'winnercount',
			type: 'INTEGER',
			description: 'The amount of winners to draw. Defaults to 1 if omitted.',
			required: false
		}, {
			name: 'duplicates',
			type: 'BOOLEAN',
			description: 'Whether a user may win multiple times in a single raffle. Defaults to false.',
			required: false
		}]
	},
	// createEvent command
	{
		name: 'createevent',
		description: '🛠 Create a ticket redemption event for users to click on and get tickets with.',
		options: [{
			name: 'value',
			type: 'INTEGER',
			description: 'The amount of tickets to award. (Once per user per event.) Defaults to 1 if omitted.',
			required: false
		},{
			name: 'messagechannel',
			type: 'CHANNEL',
			description: 'The text channel where the redemption event is to be created. Defaults to where this is executed.',
			required: false
		}, {
			name: 'description',
			type: 'STRING',
			description: 'The text to display on the redemption event. Defaults to \'A pile of tickets lies on the ground.\'',
			required: false
		}, {
			name: 'expirytime',
			type: 'INTEGER',
			description: 'The amount of time in minutes this event can be redeemed for. Defaults to 24 hours if omitted.',
			required: false
		}]
	}
];

async function registerSlashCommands(targetGuild?: Discord.Guild) {
	if (targetGuild) { // only register slash commands for this one guild (like on guild join).
		slashCommandRegistrar(targetGuild);
		//Check if the guild is disabled and reenable it, assume this only runs on specific guilds that *want* commands
		const guildDbData = await db.checkGuildStatus(targetGuild.id);
		if (guildDbData.disabled) db.setGuildStatus(targetGuild.id, {disabled: false});
	} else { // fetch all known guilds, check if they have requested slash commands to be disabled, and then register slash commands
		let clientGuilds = await client.guilds.fetch();
		clientGuilds.forEach(async (guild) => {
			const guildDbData = await db.checkGuildStatus(guild.id);
			if (guildDbData.disabled) {
				info(`${guild.name} has requested to be disabled, skipping.`);
			} else {
				guild.fetch().then(guild => slashCommandRegistrar(guild))
			}
		});
	}
}

async function slashCommandRegistrar(targetGuild: Discord.Guild) {
	if (!targetGuild) {
		err('No target guild was supplied to slashCommandRegistrar to register slash commands for.')
		return;
	}
	targetGuild.commands.set(allCommands)
		.then(setCommands => {
			ok(`Slash commands registered in guild ${targetGuild.name} (${targetGuild.id})`);
		})
		.catch(err => {
			if (err.message.includes('Missing Access')) {
				warn(err, `Slash commands rejected by guild ${targetGuild.name} (${targetGuild.id}) - Re-authenticate the bot in this guild with slash commands enabled.`);
			}
			warn(err, `Slash commands couldn't be registered in guild ${targetGuild.name} (${targetGuild.id})`);
		});
}

async function removeSlashCommands(targetGuild: Discord.Guild) { // also assumes that the guild does not want further slash commands.
	if (!targetGuild) {
		err('No target guild was supplied while trying to remove slash commands.')
		return;
	}
	targetGuild.commands.set([])
		.then(setCommands => {
			ok(`Guild ${targetGuild.name} has requested to disable the bot commands. Marking as disabled.`);
			try {
				db.setGuildStatus(targetGuild.id, {disabled: true});
			} catch (e) {
				warn(e, `An error occured while marking a guild as disabled.`)
			}
		})

}

client.on('ready', () => {
	ok(`Discord - Logged in. ${client.user.tag} Attempting to register slash commands...`);
	if (process.argv.includes('--test')) { // test in only one guild, as defined in environment variables
		const testingGuildID = <Discord.Snowflake>getEnv('DISCORD_TICKETS_TESTGUILDID');
		let targetGuild = client.guilds.resolve(testingGuildID);
		/* 
		// In case you want to isolate which command is acting up. *This will take time - you will get ratelimited a bit during execution*
		for (let i = 0; i < allCommands.length; i++) {
			targetGuild.commands.create(allCommands[i])
				.then(registeredCommand => log(`Slash command ${allCommands[i].name} registered`))
				.catch(e => {
					log(e, `Slash command ${allCommands[i].name} could not be registered. Exiting.`);
					process.exit(1);
				});
		}
		*/
		targetGuild.commands.set(allCommands)
			.then(foo => ok(`Slash commands successfully registered in guild ${targetGuild.name}`))
			.catch(err => {
				err(err, `Failed to register slash commands, exiting.`);
				process.exit(1);
			})

	} else { // attempt to roll out commands to all known guilds
		registerSlashCommands();
	}

	// event expiry interval
	const expiredEventCheckInterval = setInterval(checkForExpiredEvents, 60*1000);
});

client.on('guildCreate', guild => { // if bot is detected joining a server, attempt to register slash commands (automatically also puts it in the guilds db)
	registerSlashCommands(guild);
});

client.on('interactionCreate', interaction => {
	if (interaction.isCommand()) { // Slash command interactions
		if (!interaction.user) {
			warn(`A command interaction was recieved, but it had no user associated to it.`);
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
			case 'createraffle':
				raffleCreator(interaction);
				break;
			case 'join':
				raffleEnterer(interaction);
				break;
			case 'resolve':
				raffleResolver(interaction);
				break;
			case 'createevent':
				eventCreator(interaction);
				break;
		}
	} else if (interaction.isButton()) { // Button interactions
		if (interaction.customId) {
			if (interaction.customId.startsWith('award_')) ticketEventAwarder(interaction);
			else if (interaction.customId.startsWith('join_')) raffleEnterer(interaction);
		}
	}
});

async function authorHasPermission(interaction: Discord.CommandInteraction) : Promise<boolean> {
	// returns true if the member who sent this message has MANAGE_GUILD permissions, otherwise false and sends the invoking user an ephemeral message rejecting command execution.
	if (!interaction.guild) {
		interaction.reply({
			embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'This command must be executed from a guild channel to check for your permissions.', description: `🛠 You need MANAGE_GUILD to use ${interaction.commandName}.`})],
			ephemeral: true
		})
		.then(() => {log(`${interaction.commandName} execution was rejected for ${interaction.user.tag}`)})
		.catch(e => {warn(e, `${interaction.commandName} execution was rejected for ${interaction.user.tag}, but the reply could not be sent.`)});
		return false;
	}
	let temp = interaction.member as Discord.GuildMember;
	try {
		let targetMember = await temp.fetch()	
		if (targetMember.permissions.has(Discord.Permissions.FLAGS.MANAGE_GUILD)) {
			return true;
		}
		else {
			interaction.reply({
				embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'You don\'t have access to this command.', description: `🛠 You need MANAGE_GUILD to use ${interaction.commandName}.`})],
				ephemeral: true
			})
			.then(() => {log(`${interaction.commandName} execution was rejected for ${interaction.user.tag}`)})
			.catch(e => {warn(e, `${interaction.commandName} execution was rejected for ${interaction.user.tag}, but the reply could not be sent.`)})
			return false;
		}
	} catch (err) {
		interaction.reply({
			embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Something went wrong while checking your permissions...', description: `🛠 You need MANAGE_GUILD to use ${interaction.commandName}.`})],
			ephemeral: true
		}).catch(e => warn(e, `Couldn't reply to interaction about permission failure.`))
		warn(err, `Couldn't fetch guild member to check permissions`);
	}
}

function intCheck(a: number | string | boolean) : boolean {
	return !(Number.isNaN(a) || a > ((2**31)-1) || a < (-1)*((2**31)-1))
}

async function ticketBalanceDisplayer(interaction: Discord.CommandInteraction) : Promise<void> {
	let targetUser = interaction.options?.get('user')?.user;
	if (targetUser && targetUser.id != interaction.user.id) {
		let hasPermission = await authorHasPermission(interaction);
		if (!hasPermission) return;
	} else targetUser = interaction.user;
	try {
		const bal = await db.getUserTicketCount(targetUser);
		if (bal == undefined) { // no balance found
			interaction.reply({
				embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Something went wrong...', description: "Couldn't retrieve user data."})],
				ephemeral: true
			}).then(msg => {log(`No ticket balance found for ${targetUser.tag}`)})
				.catch(e => {warn(e, `No ticket balance found for ${targetUser.tag}, and the reply could not be sent.`)});
			return;
		}
		interaction.reply({
			embeds: [new Discord.MessageEmbed({color: embedColors.Default, author:{name:targetUser.username, iconURL: targetUser.avatarURL()}, title: `🎟 ${bal}`})],
			ephemeral: true
		}).catch(e => {warn(e, `No ticket balance found for ${targetUser.tag}, and the reply could not be sent.`)});
	} catch (e) {
		warn(e, 'DB has thrown an error while running ticketBalanceDisplayer.');
	}
}

async function ticketGiver(interaction: Discord.CommandInteraction) : Promise<void> {
	let hasPermission = await authorHasPermission(interaction);
	if (!hasPermission) return;
	const targetUser = interaction.options.get('user').user;
	const ticketAmount = interaction.options.get('amount').value;
	if (!intCheck(ticketAmount)) {
		interaction.reply({
			embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Invalid ticket amount specified.', description: "Make sure to specify an *integer* for the ticket amount."})],
		}).then(msg => {log(`Invalid ticket amount ${ticketAmount} was specified for give command`);})
		.catch(e => {warn(e, `Invalid ticket amount ${ticketAmount} was specified for give command, and reply could not be sent:.`);});
		return;
	}
	if (!targetUser) {
		interaction.reply({
			embeds: [new Discord.MessageEmbed({'color': embedColors.Error, 'title': 'Something went wrong...', description: "No target user was recieved in your slash command request."})],
		}).then(msg => {err(`Give command expects a user, but did not recieve one in the options. Interaction:\n${interaction}`);})
		.catch(e => {log(e, `Give command expects a user, but did not recieve one in the options - and the reply could not be sent. \nInteraction:\n${interaction}`);});
		return;
	}
	try {
		const newTickets = await db.addUserTickets(targetUser, Number(ticketAmount));
		interaction.reply({
			embeds: [new Discord.MessageEmbed({color: embedColors.Default, author:{name:targetUser.username, iconURL: targetUser.avatarURL()}, title: `New balance: 🎟 ${newTickets}`})],
			ephemeral: true
		}).catch(e => {warn(e, `A user was awarded tickets, but the distributor couldn't recieve the reply.`)});
	} catch (e) {

	}
	

}

async function raffleCreator(interaction: Discord.CommandInteraction) : Promise<void> {
	let hasPermission = await authorHasPermission(interaction);
	if (!hasPermission) return;
	const entryKeyword = interaction.options.get('keyword').value;
	const raffleDescription = interaction.options.get('description')?.value ?? entryKeyword;
	const entryCost = interaction.options.get('minentryfee')?.value ?? 1;
	const targetChannel = interaction.options.get('targetchannel')?.channel ?? interaction.channel;

	if (typeof entryKeyword != 'string') {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Entry keyword is invalid.')],
			ephemeral: true
		}).then(() => {log(`${interaction.user.tag} attempted to create a raffle with invalid keyword ${entryKeyword}`)})
		.catch(e => {warn(e, `${interaction.user.tag} attempted to create a raffle with invalid description ${entryKeyword}, but couldn't be notified.`)})
		return;
	}
	if (entryKeyword.length > 90) {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Your entry keyword is too long. Please limit yourself to 90 characters.')],
			ephemeral: true
		}).then(() => {log(`${interaction.user.tag} attempted to create a raffle with overflowing keyword.`)})
		.catch(e => {warn(e, `${interaction.user.tag} attempted to create a raffle with overflowing keyword, but couldn't be notified.`)})
		return;
	}

	if (typeof raffleDescription != 'string') {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Raffle description is invalid.')],
			ephemeral: true
		}).then(() => {log(`${interaction.user.tag} attempted to create a raffle with invalid description ${raffleDescription}`)})
		.catch(e => {warn(e, `${interaction.user.tag} attempted to create a raffle with invalid description ${raffleDescription}, but couldn't be notified.`)})
		return;
	}
	if (raffleDescription.length > 256) {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Your raffle description is too long. Please limit yourself to 256 characters.')],
			ephemeral: true
		}).then(() => {log(`${interaction.user.tag} attempted to create a raffle with overflowing description.`)})
		.catch(e => {warn(e, `${interaction.user.tag} attempted to create a raffle with overflowing description, but couldn't be notified.`)})
		return;
	}

	if (typeof entryCost != 'number' || !intCheck(entryCost) || entryCost < 0) {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Entry cost is invalid.')],
			ephemeral: true
		}).then(() => {log(`${interaction.user.tag} attempted to create a raffle with invalid entry cost ${entryCost}.`)})
		.catch(e => {warn(e, `${interaction.user.tag} attempted to create a raffle with invalid entry cost ${entryCost}, but couldn't be notified.`)})
		return;
	}

	if (!(targetChannel instanceof Discord.TextChannel)) {
		interaction.reply({
			embeds: [raffleCreatorArgsErr('Target channel is invalid.')],
			ephemeral: true
		}).then(() => {log(`${interaction.user.tag} attempted to create a raffle with invalid target channel ${targetChannel}`)})
		.catch(e => {warn(e, `${interaction.user.tag} attempted to create a raffle with invalid target channel, but couldn't be notified.`)})
		return;
	}

	interaction.deferReply({ephemeral: true})
		.then(() => {
			targetChannel.send({content: `🎟 Preparing a raffle, please wait...`})
				.then(targetMsg => {
					db.createRaffle(targetMsg, entryKeyword, entryCost)
						.then(success => {
							if (success) {
								targetMsg.edit({
									content: ' ',
									embeds: [
									new Discord.MessageEmbed({
										color: embedColors.Default,
										author: {name: 'A wild raffle has appeared!', iconURL: client.user.avatarURL()},
										title: raffleDescription,
										description: `Enter the raffle with \`/join ${entryKeyword} <ticketAmount>\` or click the button below to enter with the minimum amount.\nMinimum entry fee: ${entryCost} 🎟`,
										fields: [{name: 'Entries', value: '0'}]
									})],
									components: [new Discord.MessageActionRow().addComponents(new Discord.MessageButton({customId: `join_${entryKeyword}`, emoji:'✍', label: 'Join', style: 'PRIMARY'}))]
								}).then((editedMessage) => {
									interaction.editReply({
										embeds: [new Discord.MessageEmbed({
											color: embedColors.Ok,
											title: 'Raffle has been created!'})
										]}).catch(e => {warn(e, `Raffle was created, but the interaction couldn't be replied to.`)})
								}).catch(e => {
									warn(e, `The raffle message couldn't be edited.`)
								})
							}
						})
						.catch(e => {
							if (e.message.includes(`Active raffle with keyword ${entryKeyword} exists`)) {
								interaction.editReply({embeds:[raffleCreatorArgsErr('An active raffle with this keyword already exists.')]})
									.then(()=> {log(`Raffle keyword ${entryKeyword} is occupied`)})
									.catch(e => {warn(e, `Raffle keyword ${entryKeyword} is occupied and the interaction couldn't be sent.`)});
							}
							else {
								interaction.editReply({embeds:[raffleCreatorArgsErr('Something went wrong. The error has been dumped to console.')]})
									.then(()=> {warn(e, `Database error occurred upon raffle creation.`)})
									.catch(msgE => {warn(msgE, `Database error occurred upon raffle creation and the interaction couldn't be sent.\nDB error:${e}`)});
							}
							targetMsg.delete().catch(e => {warn(e, `Failed to delete message.`)});
						});
				})
				.catch(e => {
					interaction.editReply({
						embeds:[new Discord.MessageEmbed({
							color: embedColors.Error,
							title: 'Failed to create raffle.',
							description: 'I couldn\'t send a message to the targeted channel. Do I have write messages permissions?'
						})]
					}).catch(e => {warn(e, `Couldn't edit interaction reply after raffle creation failed due to no message sending.`)})
					warn(e, `Couldn't send message to target channel.`)
				});
		}).catch(e => err(e, `Raffle creation interaction could not be deferred.`))
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

async function raffleEnterer(interaction: Discord.CommandInteraction | Discord.ButtonInteraction) : Promise<void> {
	let entryKeyword;
	let entryAmount;
	if (interaction instanceof Discord.CommandInteraction) {
		entryKeyword = interaction.options.get('keyword').value;
		entryAmount = interaction.options.get('ticketamount')?.value; 
	} else if (interaction instanceof Discord.ButtonInteraction) {
		entryKeyword = interaction.customId?.substring(5);
	}

	if (!entryKeyword || typeof entryKeyword != 'string' || entryKeyword.length > 90) {
		interaction.reply({embeds: [raffleEnterArgsErr('Invalid keyword specified.')], ephemeral: true})
			.catch(e => {warn(e, `Couldn't reply to interaction after invalid keyword was specified for entering a raffle.`)})
		return;
	}

	if (entryAmount !== undefined) {
		if (typeof entryAmount != 'number' || !intCheck(entryAmount) || entryAmount < 1) {
			interaction.reply({embeds: [raffleEnterArgsErr('Invalid ticket amount specified.')], ephemeral: true})
				.catch(e => {warn(e, `Couldn't reply to interaction after invalid keyword was specified for entering a raffle.`)})
			return;
		}
	}
	db.enterRaffle(interaction.user, entryKeyword, <number>entryAmount)
		.then(res => {
			interaction.reply({embeds:[new Discord.MessageEmbed({
				color: embedColors.Ok,
				author: {name: interaction.user.username, iconURL: interaction.user.avatarURL()},
				title: `Entered raffle ${entryKeyword}.`,
				description: `New ticket balance: ${res.newBalance} 🎟`
				})],
				ephemeral: true
			}).catch(e => {warn(e, 'User entered raffle, but couldn\'t reply to interaction.')});
			let displayMsgChannel = interaction.guild.channels.resolve(res.channelID);
			if (displayMsgChannel instanceof Discord.TextChannel) {
				displayMsgChannel.messages.fetch(res.messageID)
					.then(displayMsg => {
						let embed : Discord.MessageEmbed = displayMsg.embeds[0];
						embed.fields[0].value = String(parseInt(embed.fields[0].value) + res.entryAmount);
						displayMsg.edit({embeds: [embed]}).catch(e => {warn(e, `Couldn't edit raffle display message after entry.`)});
					})
					.catch(e => {warn(e, 'Couldn\'t find raffle display message to edit after entry')})
			}
		}).catch(e => {
			if (e.message.includes('User does not have enough tickets to enter.')) {
				interaction.reply({embeds:[raffleEnterArgsErr('You don\'t have enough tickets.')], ephemeral: true})
				.catch(e=>{warn(e, `User doesn't have enough tickets but couldn't be replied to.`);});
			} else if (e.message.includes('which has min. ticket count of')) {
				interaction.reply({embeds:[raffleEnterArgsErr('You are trying to enter with too few tickets.')], ephemeral: true})
				.catch(e=>{warn(e, `User doesn't have enough tickets but couldn't be replied to.`)});
			} else if (e.message.includes('No active raffle found with associated keyword')) {
				interaction.reply({embeds:[raffleEnterArgsErr('That raffle does not exist.')], ephemeral: true})
				.catch(e=>{warn(e, `User doesn't have enough tickets but couldn't be replied to.`)});
			} else if (e.message.includes('User is already entered into free raffle')) {
				interaction.reply({embeds:[raffleEnterArgsErr('Free raffles can only have one entry per user.')], ephemeral: true})
				.catch(e=>{warn(e, `User doesn't have enough tickets but couldn't be replied to.`)});
			} else {
				interaction.reply({embeds:[raffleEnterArgsErr('Something went wrong...', 'The error has been dumped to the console.')], ephemeral: true})
				.catch(e=>{err(e, 'Something unexpected went wrong while entering a raffle.')});
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
	userID: Discord.Snowflake,
	min: number,
	max: number
}

function randomInt(min: number, max: number) { // MDN
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function findWinnerInArray(list: Array<distributionEntry>, value: number): Discord.Snowflake | null {
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
	let hasPermission = await authorHasPermission(interaction);
	if (!hasPermission) return;
	const entryKeyword = interaction.options.get('keyword').value;
	const winnerCount = interaction.options.get('winnercount')?.value ?? 1;
	const allowDuplicates = interaction.options.get('duplicates')?.value ?? false;
	if (!entryKeyword || typeof entryKeyword != 'string' || entryKeyword.length > 90) {
		interaction.reply({embeds:[raffleResolverArgsErr('Invalid raffle keyword specified.')], ephemeral: true}).catch(e => warn(e, 'Invalid keyword was specified to resolve raffle, but reply failed.'));
		return;
	}
	if (!winnerCount || typeof winnerCount != 'number' || !intCheck(winnerCount) || winnerCount < 1) {
		interaction.reply({embeds:[raffleResolverArgsErr('Invalid winner count specified.')], ephemeral: true}).catch(e => warn(e, 'Invalid winner count was specified to resolve raffle, but reply failed.'));
		return;
	}
	if (typeof allowDuplicates != 'boolean') {
		interaction.reply({embeds:[raffleResolverArgsErr('Duplicates flag may only be true or false.')], ephemeral: true}).catch(e => warn(e, 'Invalid duplicates flag was specified to resolve raffle, but reply failed.'));
		return;
	}

	interaction.deferReply({ephemeral: true})
		.then(() => {
			db.resolveRaffle(entryKeyword)
				.then(async res => {
					let displayMsgChannel = interaction.guild.channels.resolve(res.channelID);
					if (!(displayMsgChannel instanceof Discord.TextChannel)) return; // should always be true so never fires, this is for typescript to stop crying
					let displayMsg : Discord.Message;
					try {
						displayMsg = await displayMsgChannel.messages.fetch(res.messageID);
					} catch (e) {
						info(e, `The message initiating the raffle ${entryKeyword} could not be found. Resolving the raffle will be continued.`)
					}

					// noone participated
					if (res.entries.length == 0) {
						if (displayMsg) {
							displayMsg.edit({embeds:[new Discord.MessageEmbed({
								color: embedColors.Warning,
								title: `This raffle ${entryKeyword} has closed!`,
								description: `Noone participated...`
							})],
							components: [new Discord.MessageActionRow().addComponents(new Discord.MessageButton({customId: `expired`, emoji:'✍', label: 'Join', style: 'SECONDARY', disabled: true}))]
							}).catch(e => warn(e, `Resolved raffle message couldn't be edited.`));
						}
						displayMsgChannel.send({embeds:[new Discord.MessageEmbed({
							color: embedColors.Warning,
							title: 'The results are in!',
							description: `The raffle ${entryKeyword} was closed, but noone participated.`,
						})]}).catch(e => warn(e, `The raffle ${entryKeyword}was resolved with no participants, but the message acquitting this couldn't be sent.`));
						interaction.editReply({embeds: [new Discord.MessageEmbed({
							color: embedColors.Default,
							title: `Raffle ${entryKeyword} closed!`,
							description: `Noone participated, so no winners could be picked...`
						})]})
							.then(msg => log(`User resolved raffle ${entryKeyword}, no participants joined`))
							.catch(msgE => warn(msgE, `User resolved raffle ${entryKeyword} with no participants, but couldn't be notified of this.`));
						return;
					}
					
					// pick winners
					let winnerIDs : Array<Discord.Snowflake> = []
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
						let member = await interaction.guild.members.fetch(id);
						if (member != undefined) return member.user.tag;
						else return id;
					}));

					ok(`Raffle ${entryKeyword} was resolved. Picked winners: ${winnerUsernames}`);

					if (displayMsg) {
						displayMsg.edit({embeds:[new Discord.MessageEmbed({
							color: embedColors.Ok,
							title: `This raffle ${entryKeyword} has closed!`,
							description: `Winners:\n${winnerUsernames.join('\n')}`
						})],
						components: [new Discord.MessageActionRow().addComponents(new Discord.MessageButton({customId: `expired`, emoji:'✍', label: 'Join', style: 'SECONDARY', disabled: true}))]
						}).catch(e => warn(e, `Couldn't edit the resolved raffle message for ${entryKeyword}.`))
					}
					displayMsgChannel.send({embeds:[new Discord.MessageEmbed({
						color: embedColors.Ok,
						title: 'The results are in!',
						description: `The raffle ${entryKeyword} was closed.`,
						fields: [{name: 'Winners', value: winnerUsernames.join('\n')}]
					})]}).catch(e => warn(e, `The raffle was resolved but the resolve message couldn't be sent.\nSelected winners were ${winnerUsernames.join(',')}`));

					interaction.editReply({embeds: [new Discord.MessageEmbed({
						color: embedColors.Default,
						title: `Raffle ${entryKeyword} closed!`,
						description: `These users were selected:\n${winnerUsernames.join(', ')}`
					})]})
						.catch(msgE => warn(msgE, `User resolved raffle ${entryKeyword}, but couldn't be notified of this.`));

				})
				.catch(e => {
					if (e.message.includes('Couldn\'t find raffle to resolve')){
						interaction.editReply({embeds: [raffleResolverArgsErr('Couldn\'t find your specified raffle.')]})
							.then(msg => log(`User attempted to resolve raffle with keyword ${entryKeyword}, but that keyword wasn't found`))
							.catch(msgE => warn(msgE, `User attempted to resolve raffle with keyword ${entryKeyword}, but that keyword wasn't found and user couldn't be notified of this.`));
					}
					else {
						interaction.editReply({embeds: [raffleResolverArgsErr('Something went wrong...', 'The error has been dumped to the console.')]})
							.then(msg => warn(e, `Something went wrong while attempting to resolve a raffle.`))
							.catch(msgE => warn(msgE, `Something went wrong while attempting to resolve a raffle and the user couldn't be notified of this. Resolve error:\n${e}`));
					}
					return;
				})
		}).catch(e => warn(e, `Deferring the resolve interaction failed.`))
}

function raffleResolverArgsErr(errType: string, details?: string) : Discord.MessageEmbed {
	return new Discord.MessageEmbed({
		color: embedColors.Error, title: errType, description: details ? details : `To resolve a raffle, use the keyword you've specified on raffle creation like this:\n\`/resolve keyword\``,
	});
}

async function eventCreator(interaction: Discord.CommandInteraction) : Promise<void> {
	let hasPermission = await authorHasPermission(interaction);
	if (!hasPermission) return;

	const ticketAmount = interaction.options?.get('value')?.value ?? 1;
	const targetChannel = interaction.options?.get('messagechannel')?.channel ?? interaction.channel;
	const description = interaction.options?.get('description')?.value ?? 'A pile of tickets lies on the ground.';
	const minutes = interaction.options?.get('expirytime')?.value ?? 1440;
	if (!ticketAmount || typeof ticketAmount != 'number' || !intCheck(ticketAmount) || ticketAmount < 0) {
		interaction.reply({embeds:[eventCreatorArgsErr('Invalid ticket amount specified.')] ,ephemeral:true})
			.then(() => log(`Invalid ticket amount ${ticketAmount} was specified for new event`))
			.catch(e => warn(e, `Invalid ticket amount ${ticketAmount} was specified for new event and user couldn't be notified.`));
		return;
	}
	if (!targetChannel || !(targetChannel instanceof Discord.TextChannel)) {
		interaction.reply({embeds:[eventCreatorArgsErr('Invalid target channel specified.')] ,ephemeral:true})
			.then(() => log(`Invalid target channel was specified for new event:\n${targetChannel}`))
			.catch(e => warn(e, `Invalid target channel was specified for new event and user couldn't be notified. Channel:\n${targetChannel}`));
		return;
	}
	if (!description || typeof description != 'string' || description.length > 256) {
		interaction.reply({embeds:[eventCreatorArgsErr('Invalid description specified. Please limit yourself to 256 characters or less.')] ,ephemeral:true})
			.then(() => log(`Invalid description was specified for new event:\n${description}`))
			.catch(e => warn(e, `Invalid description was specified for new event and user couldn't be notified. Description:\n${description}`));
		return;
	}
	if (!minutes || typeof minutes != 'number' || minutes < 0 || minutes > 10080) {
		interaction.reply({embeds:[eventCreatorArgsErr('Invalid expiry time specified. Enter the amount of minutes, up to seven days worth (10080)')] ,ephemeral:true})
			.then(() => log(`Invalid expiry time ${minutes} was specified for new event`))
			.catch(e => warn(e, `Invalid expiry time ${minutes} was specified for new event and user couldn't be notified.`));
		return;
	}

	let expiryTime = Moment().add(minutes, 'minutes');

	interaction.deferReply({ephemeral: true})
	.then(() => {
		targetChannel.send({embeds: [new Discord.MessageEmbed({color: embedColors.Default, title: 'Creating a new event, please wait...'})]})
		.then(targetMessage => {
			db.createEvent(ticketAmount, expiryTime, targetMessage)
			.then(eventID => {
				targetMessage.edit({
					embeds: [new Discord.MessageEmbed({
					color: embedColors.Default,
					title: description,
					description: `To collect your ${ticketAmount} 🎟, click the button below!`,
					})],
					components: [new Discord.MessageActionRow().addComponents(new Discord.MessageButton({customId: `award_${eventID}`, emoji:'🎟', label: 'Redeem', style: 'SUCCESS'}))]
				}).catch(e => {
					interaction.editReply({embeds:[eventCreatorArgsErr('Redemption message couldn\'t be edited. Do I have permissions?')]})
						.then(foo => {warn(e, `Couldn't send redemption message.`)})
						.catch(msgE => {warn(msgE, `Couldn't send redemption message, and user couldn't be notified. Redemption error:\n${e}`)})
				});
				interaction.editReply({embeds: [
					new Discord.MessageEmbed({
						color: embedColors.Ok,
						title: `Your event for ${ticketAmount} 🎟 has been created!`
					})
				]});
			})
			.catch(e => {
				interaction.editReply({embeds:[eventCreatorArgsErr('Something went wrong... The error has been dumped to console.')]})
					.then(msg => err(e, `DB Error occurred on event creation.`))
					.catch(msgE => err(e, `DB Error occurred on event creation. Additionally, user couldn't be notified:\n${msgE}`));
			})
		})
		.catch(e => {
			interaction.editReply({embeds:[eventCreatorArgsErr('Redemption message couldn\'t be created. Do I have permissions?')]}).catch(e => warn(e, `Interaction couldn't be replied to.`));
			warn(e, `Error occured in the database for event creation.`);
		})
	})
	.catch(e => warn(e, `Something went wrong while deferring the interaction for event creation.`))	
}

async function ticketEventAwarder(interaction: Discord.ButtonInteraction) {
	if (!interaction.guild) {warn(`Button Interaction for awards was somehow called outside of a guild`); return;}
	// buttonID starts with award_ followed by eventID
	let eventID : number = parseInt(interaction.customId.substring(6))
	if (Number.isNaN(eventID)) {
		err(`Event ID that was recieved through button interaction is somehow not a number`);
		return;
	}
	db.awardUserTickets(interaction.user, eventID)
		.then(res => {
			if (res) {
				interaction.reply({
					embeds: [new Discord.MessageEmbed({
						color: embedColors.Default,
						title: 'Tickets redeemed!',
					})],
					ephemeral: true
				}).catch(e => warn(e, `Couldn't reply to event interaction.`));
			}
			else {
				interaction.reply({
					embeds: [new Discord.MessageEmbed({
						color: embedColors.Error,
						title: 'You have already redeemed these tickets!',
					})],
					ephemeral: true
				}).catch(e => warn(e, `Couldn't reply to failed event interaction.`));
			}
		})
		.catch(async function(e) {
			if (e.message.includes('Event has closed recently')) {
				let messageToClose = await db.closeExpiredEvent(eventID);
				if (!interaction.channel.isText()) {err(`Button Interaction somehow did not return a text channel - aborting`); return;}
				let messageObject = await interaction.channel.messages.fetch(messageToClose);
				ticketEventCloser(messageObject);
				interaction.reply({
					embeds: [new Discord.MessageEmbed({
						color: embedColors.Info,
						title: 'This ticket awarding ceremony has already ended.',
					})],
					ephemeral: true
				})
				.catch(er => warn(er, `Couldn't reply to event interaction.`));
			}
			else if (e.message.includes('Event is closed')) {
				interaction.reply({
					embeds: [new Discord.MessageEmbed({
						color: embedColors.Info,
						title: 'This ticket awarding ceremony has already ended.',
					})],
					ephemeral: true
				})
				.catch(er => warn(er, `Couldn't reply to event interaction.`));
			} else {
				interaction.reply({
					embeds: [new Discord.MessageEmbed({
						color: embedColors.Error,
						title: 'Something went wrong... The error has been dumped to console.',
					})],
					ephemeral: true
				}).catch(er => warn(er, `Couldn't reply to event interaction.`));
				warn(e, `Something went wrong during event redemption.`);
			}
		})
}

async function ticketEventCloser(message: Discord.Message) : Promise<void> {
	message.edit({
		embeds: [new Discord.MessageEmbed({
			color: embedColors.Info,
			title: 'This ticket awarding ceremony has ended!',
		})],
		components: [new Discord.MessageActionRow().addComponents(new Discord.MessageButton({customId: `expired`, emoji:'🎟', label: 'Redeem', style: 'SECONDARY', disabled: true}))]
	})
		.catch(e => {warn(e, `Couldn't edit award message.`)})
}

async function checkForExpiredEvents() : Promise<void> {
	try {
		let expiredMessages = await db.checkForExpiredEvents();
		if (expiredMessages.length > 0) {
			for (let i = 0; i < expiredMessages.length; i++) {
				let targetGuild = await client.guilds.fetch(expiredMessages[i].guildID);
				if (targetGuild) {
					let targetChannel = await targetGuild.channels.fetch(expiredMessages[i].channelID);
					if (targetChannel && targetChannel.isText()) {
						let targetMessage = await targetChannel.messages.fetch(expiredMessages[i].messageID);
						if (targetMessage) {
							ticketEventCloser(targetMessage);
							log(`A distribution event has expired and was closed.`)
						}
					}
				}
			}
		}
	} catch (e) {
		warn(e, 'DB threw an error while running checkForExpiredEvents.');
	}
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
	}).catch(e => {warn(e, `Credits were requested, but the reply couldn't be sent.`)});
}

client.login(discordToken).catch(err => {
	err(err, "Couldn't log in to Discord! Exiting.")
	process.exit(1);
});
