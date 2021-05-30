# Ticket Machine
A smaller discord.js bot made for bloomy that handles a ticket-like currency to redeem for raffles.

## Requirements
- node.js
- MariaDB (docker works just fine)

## Installation
1. `npm install`
2.  Run createTables.sql on your mariaDB installation
3. Set the following environment variables:
- `DISCORD_TICKETS_DBPASS` for your database password
- `DISCORD_TICKETS_TOKEN` as the discord bot token
4. `npm run start`

## Usage/Commands
The prefix defaults to `-` - if so desired, it can be reconfigured in run.ts.

For most commands, help is available if no or invalid arguments are specified.

Arguments in \[square brackets\] are required, \(round brackets\) are optional.

- `-bal (user)`: Displays the users' ticket balance.
- `-join [keyword] (tickets)`: Join an active raffle using the raffle keyword.
- `-credits`: A very useless command. :3c 

Administrative commands (need "Manage Channels" permission to be executed)
- `-give [user] [amount]`: Give tickets to the specified user. Amount can be negative to deduct tickets!
- `-raffle [keyword] (description) (minimumEntryFee) (messageChannel)`: Start a raffle.
- `-resolve [keyword] (winnerCount)`: Close a raffle and decide winners.
- `-event (value) (messageChannel) (description) (expiryTime)`: Create a message to award tickets with.

if bloomy reads this, ur gya
