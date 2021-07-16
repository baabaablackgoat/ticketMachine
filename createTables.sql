CREATE DATABASE `ticketDB`; /*!40100 DEFAULT CHARACTER SET utf8mb4 */
USE `ticketDB`;

-- set timezone
SET time_zone = 'UTC';

-- ticketDB.awardEvents definition

CREATE TABLE `awardEvents` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `ticketValue` int(11) NOT NULL DEFAULT 1,
  `expiry` datetime NOT NULL,
  `displayMessageID` varchar(100) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COMMENT='list of all events that occured';


-- ticketDB.raffles definition

CREATE TABLE IF NOT EXISTS `raffles` (
  `raffleID` int(11) NOT NULL AUTO_INCREMENT,
  `displayMessageID` varchar(100) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `entryKeyword` varchar(100) DEFAULT NULL,
  `cost` int(11) NOT NULL DEFAULT 1,
  `displayChannelID` varchar(100) NOT NULL,
  `resolvesAt` datetime DEFAULT NULL,
  PRIMARY KEY (`raffleID`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COMMENT='stores raffles and their related info';


-- ticketDB.users definition

CREATE TABLE IF NOT EXISTS `users` (
  `userID` varchar(30) NOT NULL,
  `ticketCount` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`userID`),
  CONSTRAINT `users_CHECK` CHECK (`ticketCount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='stores users and their ticket counts';


-- ticketDB.eventParticipations definition

CREATE TABLE IF NOT EXISTS `eventParticipations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `userID` varchar(30) DEFAULT NULL,
  `eventID` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `eventParticipations_Unique` (`userID`,`eventID`),
  KEY `eventParticipations_FK_1` (`eventID`),
  CONSTRAINT `eventParticipations_FK` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`),
  CONSTRAINT `eventParticipations_FK_1` FOREIGN KEY (`eventID`) REFERENCES `awardEvents` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COMMENT='list of every participation';


-- ticketDB.raffleEntries definition

CREATE TABLE IF NOT EXISTS `raffleEntries` (
  `entryID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `raffleID` int(11) NOT NULL,
  `userID` varchar(30) NOT NULL,
  `entryCount` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`entryID`),
  UNIQUE KEY `raffleEntries_Unique` (`raffleID`,`userID`),
  KEY `raffleEntries_FK_UserID` (`userID`),
  CONSTRAINT `raffleEntries_FK_RaffleID` FOREIGN KEY (`raffleID`) REFERENCES `raffles` (`raffleID`),
  CONSTRAINT `raffleEntries_FK_UserID` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COMMENT='list of every raffle entry';