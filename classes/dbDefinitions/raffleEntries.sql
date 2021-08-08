CREATE TABLE `raffleEntries` (
  `entryID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `raffleID` int(11) NOT NULL,
  `userID` varchar(30) NOT NULL,
  `entryCount` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`entryID`),
  UNIQUE KEY `raffleEntries_Unique` (`raffleID`,`userID`),
  KEY `raffleEntries_FK_UserID` (`userID`),
  CONSTRAINT `raffleEntries_FK_RaffleID` FOREIGN KEY (`raffleID`) REFERENCES `raffles` (`raffleID`),
  CONSTRAINT `raffleEntries_FK_UserID` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4;