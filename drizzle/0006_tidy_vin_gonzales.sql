CREATE TABLE `roomMemberBans` (
	`id` varchar(120) NOT NULL,
	`roomId` varchar(16) NOT NULL,
	`deviceId` varchar(96) NOT NULL,
	`bannedBy` varchar(96) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `roomMemberBans_id` PRIMARY KEY(`id`)
);
