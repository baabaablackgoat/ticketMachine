# Ticket Machine
A smaller discord.js bot made for bloomy that handles a ticket-like currency to redeem for raffles.

## Requirements
- node.js
- MariaDB (docker works just fine)
- Typescript `npm install -g typescript`

## Installation
1. `npm install`
2. Run createTables.sql on your mariaDB installation (will be deprecated soon, see #8)
3. Set the following environment variables:
- `DISCORD_TICKETS_DBPASS` for your database password
- `DISCORD_TICKETS_TOKEN` as the discord bot token
- If testing with `npm run test`: `DISCORD_TICKETS_TESTGUILDID` with the discord server ID to test commands in
4. `npm run start`

## Usage/Commands
Commands register automatically as slash commands in every guild (unless you're testing)
Arguments in \[square brackets\] are required, \(round brackets\) are optional.

- `/bal (user)`: Displays your own or the specified users' ticket balance (the latter is considered administrative)
- `/join [keyword] (tickets)`: Join an active raffle using the raffle keyword.
- `/credits`: A very useless command. :3c 

Administrative commands (need "Manage Channels" permission to be executed)
- `/give [user] [amount]`: Give tickets to the specified user. Amount can be negative to deduct tickets!
- `/createraffle [keyword] (description) (minimumEntryFee) (messageChannel)`: Start a raffle.
- `/resolve [keyword] (winnerCount)`: Close a raffle and decide winners.
- `/createevent (value) (messageChannel) (description) (expiryTime)`: Create a message to award tickets with.
