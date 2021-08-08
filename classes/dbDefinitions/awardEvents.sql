CREATE TABLE `awardEvents` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `ticketValue` int(11) NOT NULL DEFAULT 1,
  `expiry` datetime NOT NULL,
  `displayMessageID` varchar(100) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `guildID` varchar(100) NOT NULL,
  `channelID` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COMMENT='list of all events that occured';