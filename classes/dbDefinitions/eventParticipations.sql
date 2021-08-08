CREATE TABLE `eventParticipations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `userID` varchar(30) DEFAULT NULL,
  `eventID` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `eventParticipations_Unique` (`userID`,`eventID`),
  KEY `eventParticipations_FK_1` (`eventID`),
  CONSTRAINT `eventParticipations_FK` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`),
  CONSTRAINT `eventParticipations_FK_1` FOREIGN KEY (`eventID`) REFERENCES `awardEvents` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COMMENT='list of every participation';