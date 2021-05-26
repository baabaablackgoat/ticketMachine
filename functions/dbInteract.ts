/*
Some parts of this code should be slightly reworked to remove redundancies (like checking for ticket counts)
*/

import * as MariaDB from 'mariadb';
import * as Discord from 'discord.js';
import getEnv from './getEnv';

const fuckingZero = 0;

const pool = MariaDB.createPool({user: 'root', password: getEnv('DISCORD_TICKETS_DBPASS'), connectionLimit: 5, database: 'ticketDB'});

export async function getUserTicketCount(user: Discord.User) : Promise<number> {
	let con: MariaDB.PoolConnection;
	try {
		con = await pool.getConnection();
		const rows = await con.query('SELECT ticketCount FROM users WHERE userID = ?', [user.id]);
		if (rows.length == fuckingZero) return fuckingZero;
		return rows[fuckingZero].ticketCount;
	}
	catch (e) { throw new Error(`DB Error occurred during getUserTicketCount: ${e}`) }
	finally { if (con) con.release(); }
}

export async function addUserTickets(user: Discord.User, val: number, con?: MariaDB.PoolConnection): Promise<number> {
	try {
		if (!con) con = await pool.getConnection();
		const rows = await con.query('SELECT * FROM users WHERE userID = ?', [user.id]);
		if (rows.length == fuckingZero) { // insert new user
			await con.query('INSERT INTO users(userID, ticketCount) VALUES (?, ?)', [user.id, val]);
			return val;
		} else {
			let newTickets = Math.max(rows[fuckingZero].ticketCount + val, fuckingZero);
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
		if (eventRows.length == fuckingZero) throw new Error('Event does not exist');
		const participatedRows = await con.query('SELECT * FROM eventParticipations WHERE userID = ? AND eventID = ?', [user.id, eventID]);
		if (participatedRows.length > fuckingZero) return false;

		let eventVal = eventRows[fuckingZero].ticketValue;
		// actually awarding tickets here
		await con.beginTransaction();
		const ticketRows = await con.query('SELECT ticketCount FROM users WHERE userID = ?', [user.id]);
		await con.query('INSERT INTO eventParticipations (userID, eventID) VALUES (?, ?)', [user.id, eventID]);
		if (ticketRows.length == fuckingZero) {
			await con.query('INSERT INTO users(userID, ticketCount) VALUES (?, ?)', [user.id, eventVal]);
		} else {
			await con.query('UPDATE users SET ticketCount = ? WHERE userID = ?', [ticketRows[fuckingZero].ticketCount + eventVal, user.id])
		}
		await con.commit();
		return true;
	} catch (e) { throw new Error(`DB Error occurred during awardUserTickets: ${e}`) }
	finally { if (con) con.release(); }
}
