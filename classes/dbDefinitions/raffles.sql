CREATE TABLE `raffles` (
  `raffleID` int(11) NOT NULL AUTO_INCREMENT,
  `displayMessageID` varchar(100) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `entryKeyword` varchar(100) DEFAULT NULL,
  `cost` int(11) NOT NULL DEFAULT 1,
  `displayChannelID` varchar(100) NOT NULL,
  `resolvesAt` datetime DEFAULT NULL,
  PRIMARY KEY (`raffleID`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4;