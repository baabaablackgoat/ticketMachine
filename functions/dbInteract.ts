/*
Some parts of this code should be slightly reworked to remove redundancies (like checking for ticket counts)
*/

import * as fs from 'fs';
import * as MariaDB from 'mariadb';
import * as Discord from 'discord.js';
import * as Moment from 'moment';
import getEnv from './getEnv';
import { log, warn, ok, err, info, debug } from './logger';

// reset DB pool for startup and for potential future use in case the pool connection fails
export async function resetDBPool() {
	log('DB Pool resetting.');
	if (pool) {
		try {
			await pool.end();
		} catch (e) {
			warn(e, `Failed to reset DB pool.`);
		}
		
	}
	pool = MariaDB.createPool({user: 'root', password: getEnv('DISCORD_TICKETS_DBPASS'), connectionLimit: 5, database: 'ticketDB'});
}

let pool;
resetDBPool();
checkDBIntegrity();

// check if correct database structure exists - if not, create tables respectively using classes/dbDefinitions scripts
// eventParticipations and raffleEntries require foreign keys - create these last.
async function checkDBIntegrity() {
	log(`Checking DB Integrity...`)
	// TODO check if db exists
	const allTables = ['users', 'raffles', 'guilds', 'awardEvents', 'raffleEntries', 'eventParticipations'];
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection(); // probably need to move this to a non-pool connection to allow for db presence checking
		for (let i = 0; i < allTables.length; i++) {
			let rows = await con.query('SHOW TABLES LIKE ?;', allTables[i]);
			if (rows.length == 0) { //table does not exist, run respective sql script
				const query = fs.readFileSync(`./classes/dbDefinitions/${allTables[i]}.sql`).toString();
				let createdTableRes = await con.query(query);
				if (createdTableRes.hasOwnProperty('warningStatus') && createdTableRes.warningStatus != 0) {
					err(`Failed to create missing table ${allTables[i]}`);
				} else {
					log(`Missing table ${allTables[i]} was created`);
				}
			} else {
				// TODO: extend integrity check to also check for correct / missing column definitions and autofix them
			}
		}
		ok('DB integrity check succeded.');
	}
	catch (e) {
		throw new Error(`DB Integrity check failed: ${e}`)
	}
}

// Guilds can have the bot stop registering slash commands and have it reenable itself.
interface GuildData {
	disabled: boolean;
}
const defaultGuildData : GuildData = {
	disabled: false
};
export async function checkGuildStatus(guildID: Discord.Snowflake) : Promise<GuildData> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		const rows = await con.query('SELECT * FROM guilds WHERE guildID = ?', [guildID]);
		if (rows.length == 0) { // unknown/"new" guilds get registered with default values
			await con.query('INSERT INTO guilds (guildID, disabled) VALUES (?, ?)', [guildID, defaultGuildData.disabled])
			info(`Previously unknown guild with ID ${guildID} has been initialized with default values.`);
			return defaultGuildData;
		} else { // known guilds need to return their values
			let out = defaultGuildData;
			out.disabled = rows[0].disabled;
			return out;
		}
	} catch (e) { throw new Error(`DB Error occured during checkGuildStatus: ${e}`); }
	finally { if (con) con.release(); }
}

export async function setGuildStatus(guildID: Discord.Snowflake, data?: GuildData) {
	let con: MariaDB.PoolConnection;
	if (!data) data = defaultGuildData;
	try {
		con = await pool.getConnection();
		const res = await con.query("INSERT INTO guilds (guildID, disabled) VALUES (?, ?) ON DUPLICATE KEY UPDATE disabled = ?", [guildID, data.disabled, data.disabled]);
		if (res.warningStatus && res.warningStatus != 0) warn(`Something went wrong while attempting to set the guild status, warningStatus was ${res.warningStatus}`);
		else info(`Guild status for ${guildID} was created or updated.`);
	} catch (e) { throw new Error(`DB Error occured during setGuildStatus: ${e}`); }
	finally { if (con) con.release(); }
}

// Ticket Machine General DB commands start here

export async function getUserTicketCount(user: Discord.User) : Promise<number> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		const rows = await con.query('SELECT ticketCount FROM users WHERE userID = ?', [user.id]);
		if (rows.length == 0) return 0;
		return rows[0].ticketCount;
	}
	catch (e) { throw new Error(`DB Error occurred during getUserTicketCount: ${e}`) }
	finally { if (con) con.release(); }
}

export async function addUserTickets(user: Discord.User, val: number, con?: MariaDB.PoolConnection): Promise<number> {
	try {
		if (!con) con = await pool.getConnection();
		const rows = await con.query('SELECT * FROM users WHERE userID = ?', [user.id]);
		if (rows.length == 0) { // insert new user
			await con.query('INSERT INTO users(userID, ticketCount) VALUES (?, ?)', [user.id, val]);
			return val;
		} else {
			let newTickets = Math.min(Math.max(rows[0].ticketCount + val, 0), 2**31 - 1);
			await con.query('UPDATE users SET ticketCount = ? WHERE userID = ?', [newTickets, user.id]);
			return newTickets;
		}
	}
	catch (e) { throw new Error(`DB Error occurred during addUserTickets: ${e}`) }
	finally { if (con) con.release(); }
}

export async function setUserTickets(user: Discord.User, val: number): Promise<number> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		await con.query('INSERT INTO users(userID, ticketCount) VALUES (?, ?) ON DUPLICATE KEY UPDATE ticketCount = ?', [user.id, val, val]);
		return val;
	}
	catch (e) { throw new Error(`DB Error occurred during setUserTickets: ${e}`) }
	finally { if (con) con.release(); }
}

export async function createEvent(ticketValue: number, expiresAt: Moment.Moment, message: Discord.Message): Promise<number> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		const res = await con.query('INSERT INTO awardEvents (ticketValue, expiry, displayMessageID, guildID, channelID) VALUES (?, ?, ?, ?, ?)', [ticketValue, expiresAt.format('YYYY-MM-DD HH:mm:ss'), message.id, message.guild.id, message.channel.id]);
		return res.insertId;
	}
	catch (e) { throw new Error(`DB Error occurred during createEvent: ${e}`)}
	finally { if (con) con.release(); }
};


export async function awardUserTickets(user: Discord.User, eventID: number): Promise<boolean> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		const eventRows = await con.query('SELECT ticketValue, expiry, active FROM awardEvents WHERE id = ?', [eventID]);
		if (eventRows.length == 0) throw new Error('Event does not exist');
		if (!eventRows[0].active) throw new Error('Event is closed');
		if (Moment(eventRows[0].expiry).isBefore(Moment())) {
			throw new Error(`Event has closed recently`);
		}
		const participatedRows = await con.query('SELECT * FROM eventParticipations WHERE userID = ? AND eventID = ?', [user.id, eventID]);
		if (participatedRows.length > 0) return false;

		let eventVal = eventRows[0].ticketValue;
		// actually awarding tickets here
		await con.beginTransaction();
		const ticketRows = await con.query('SELECT ticketCount FROM users WHERE userID = ?', [user.id]);
		await con.query('INSERT INTO eventParticipations (userID, eventID) VALUES (?, ?)', [user.id, eventID]);
		if (ticketRows.length == 0) {
			await con.query('INSERT INTO users(userID, ticketCount) VALUES (?, ?)', [user.id, eventVal]);
		} else {
			await con.query('UPDATE users SET ticketCount = ? WHERE userID = ?', [Math.min(ticketRows[0].ticketCount + eventVal, 2**31 - 1), user.id])
		}
		await con.commit();
		return true;
	} catch (e) { throw new Error(`DB Error occurred during awardUserTickets: ${e}`) }
	finally { if (con) con.release(); }
}

interface expiredEventResponse {
	id: number,
	displayMessageID: Discord.Snowflake,
	channelID: Discord.Snowflake,
	guildID: Discord.Snowflake
}

interface foundExpiredEvents {
	messageID: Discord.Snowflake,
	channelID: Discord.Snowflake,
	guildID: Discord.Snowflake
}

export async function checkForExpiredEvents(): Promise<Array<foundExpiredEvents>> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		// TODO this query returns nothing
		const expiredRows : Array<expiredEventResponse> = await con.query('SELECT id, displayMessageID, channelID, guildID FROM awardEvents WHERE active = true AND TIMESTAMPDIFF(SECOND, expiry, NOW()) < 0');
		if (expiredRows.length == 0) {
			return [];
		} else {
			let out : Array<foundExpiredEvents> = [];
			for (let i = 0; i < expiredRows.length; i++) {
				out.push({messageID: expiredRows[i].displayMessageID, channelID: expiredRows[i].channelID, guildID: expiredRows[i].guildID});
				closeExpiredEvent(expiredRows[i].id);
			}
			return out;
		}
	}
	catch (e) { throw new Error(`DB Error occurred during checkForExpiredEvents: ${e}`); }
	finally { if (con) con.release(); }
}

interface freshlyClosedEventResponse {
	displayMessageID: Discord.Snowflake
}

export async function closeExpiredEvent(eventID: number) : Promise<Discord.Snowflake> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		await con.query('UPDATE awardEvents SET active = false WHERE id = ?', eventID);
		const messageIDResponse : Array<freshlyClosedEventResponse> = await con.query('SELECT displayMessageID FROM awardEvents WHERE active = false AND id = ?', eventID);
		if (messageIDResponse.length == 0) throw new Error(`DB error occurred while closing expired event ${eventID} - updated row not found`);
		return messageIDResponse[0].displayMessageID;
	} catch (e) { throw new Error(`DB Error occurred during closeExpiredEvent: ${e}`); }
	finally { if (con) con.release(); }
}

export async function createRaffle(displayMsg: Discord.Message, entryKeyword: string, entryCost = 1): Promise<boolean> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		const raffleRows = await con.query('SELECT raffleID FROM raffles WHERE active = true AND entryKeyword = ?', [entryKeyword])
		if (raffleRows.length > 0) throw new Error(`Active raffle with keyword ${entryKeyword} exists.`);
		await con.query('INSERT INTO raffles (displayMessageID, displayChannelID, active, entryKeyword, cost) VALUES (?, ?, true, ?, ?)', [displayMsg.id, displayMsg.channel.id, entryKeyword, entryCost]);
		return true;
	}
	catch (e) { throw new Error(`DB Error occurred during createRaffle: ${e}`); }
	finally { if (con) con.release(); }
}

interface enterRaffleResponse {
	newBalance: number,
	entryAmount: number,
	channelID: Discord.Snowflake,
	messageID: Discord.Snowflake
}

export async function enterRaffle(user: Discord.User, entryKeyword: string, ticketAmount?: number): Promise<enterRaffleResponse> { // returns users new ticket count
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		// find targeted raffle and it's cost
		const raffleRows = await con.query('SELECT * FROM raffles WHERE active = true and entryKeyword = ?', [entryKeyword]);
		if (raffleRows.length == 0) throw new Error(`No active raffle found with associated keyword ${entryKeyword}`);
		const raffleID: number = raffleRows[0].raffleID;
		const raffleCost: number = raffleRows[0].cost;
		// If no ticket amount was specified, assume minimum entry cost
		if (ticketAmount === undefined) ticketAmount = raffleCost;
		// check if raffle entry fee has been met
		if (raffleCost > ticketAmount) throw new Error(`User attempted to enter raffle with ${ticketAmount} which has min. ticket count of ${raffleCost}`);
		// get user information (mostly ticket count)
		const userRows = await con.query('SELECT ticketCount FROM users WHERE userID = ?', [user.id]);
		let userTickets: number;
		if (userRows.length == 0) con.query('INSERT INTO users(userID, ticketCount) VALUES (?, 0)', [user.id]); // add user with no tickets to the database to allow linking
		userTickets = userRows.length > 0 ? userRows[0].ticketCount : 0;
		// check if user has enough tickets to enter
		if (ticketAmount > userTickets) throw new Error(`User does not have enough tickets to enter. ${raffleCost} > ${userTickets}`);
		// free raffles only: allow only one entry per person and fix entry amount to always be 1
		if (raffleCost == 0) {
			const raffleEntryRows = await con.query('SELECT * FROM raffleEntries WHERE userID = ? AND raffleID = ?', [user.id, raffleID]);
			if (raffleEntryRows.length > 0) throw new Error(`User is already entered into free raffle`);
			ticketAmount = 1;
		}
		// begin raffle entry
		con.beginTransaction();
		await con.query('INSERT INTO raffleEntries(raffleID, userID, entryCount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE entryCount = entryCount+?', [raffleID, user.id, ticketAmount, ticketAmount]);
		if (raffleCost > 0) await con.query('UPDATE users SET ticketCount = ? WHERE userID = ?', [userTickets - ticketAmount, user.id]);
		con.commit();
		// return new ticket balance to display raffle entry and new balance
		return {
			newBalance: raffleCost > 0 ? userTickets - ticketAmount : userTickets,
			entryAmount: ticketAmount,
			channelID: raffleRows[0].displayChannelID,
			messageID: raffleRows[0].displayMessageID
		}
	} catch (e) { throw new Error(`DB Error occurred during enterRaffle: ${e}`); }
	finally { if (con) con.release(); }


}

interface raffleEntry {
	entryID: number,
	raffleID: number,
	userID: Discord.Snowflake,
	entryCount: number
}

interface resolveRaffleResponse {
	entries: Array<raffleEntry>,
	channelID: Discord.Snowflake,
	messageID: Discord.Snowflake
}

export async function resolveRaffle(entryKeyword: string): Promise<resolveRaffleResponse> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		const raffleRows = await con.query('SELECT * FROM raffles WHERE entryKeyword = ? AND active = true', [entryKeyword]);
		if (raffleRows.length != 1) throw new Error(`Couldn't find raffle to resolve`);
		const raffleID = raffleRows[0].raffleID;
		const raffleEntries = await con.query('SELECT userID, entryCount FROM raffleEntries WHERE raffleID = ?', [raffleID]);
		await con.query('UPDATE raffles SET active = false WHERE raffleID = ?', [raffleID]);
		delete raffleEntries['meta'];
		return {
			entries: raffleEntries.length > 0 ? raffleEntries : [], // Dear maria-db module creators: Why. Just why.
			channelID: raffleRows[0].displayChannelID,
			messageID: raffleRows[0].displayMessageID
		}
		
	}
	catch (e) { throw new Error(`DB Error occurred durcing resolveRaffle: ${e}`); }
	finally { if (con) con.release(); }
}
