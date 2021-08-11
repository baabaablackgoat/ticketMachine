CREATE TABLE `guilds` (
  `guildID` varchar(100) NOT NULL,
  `disabled` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`guildID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;