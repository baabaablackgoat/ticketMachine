/*
Some parts of this code should be slightly reworked to remove redundancies (like checking for ticket counts)
*/

import * as MariaDB from 'mariadb';
import * as Discord from 'discord.js';
import getEnv from './getEnv';

const pool = MariaDB.createPool({user: 'root', password: getEnv('DISCORD_TICKETS_DBPASS'), connectionLimit: 5, database: 'ticketDB'});

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

export async function createEvent(ticketValue: number): Promise<number> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		const res = await con.query('INSERT INTO awardEvents (ticketValue) VALUES (?)', ticketValue);
		return res.insertId;
	}
	catch (e) { throw new Error(`DB Error occurred during createEvent: ${e}`)}
	finally { if (con) con.release(); }
};


export async function awardUserTickets(user: Discord.User, eventID: number): Promise<boolean> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		const eventRows = await con.query('SELECT ticketValue FROM awardEvents WHERE id = ?', [eventID]);
		if (eventRows.length == 0) throw new Error('Event does not exist');
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
