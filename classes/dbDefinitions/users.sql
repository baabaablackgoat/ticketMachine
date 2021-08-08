CREATE TABLE `users` (
  `userID` varchar(30) NOT NULL,
  `ticketCount` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`userID`),
  CONSTRAINT `users_CHECK` CHECK (`ticketCount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='stores users and their ticket counts';