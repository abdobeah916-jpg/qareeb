CREATE TABLE `deviceProfiles` (
	`deviceId` varchar(96) NOT NULL,
	`avatarUrl` varchar(512),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deviceProfiles_deviceId` PRIMARY KEY(`deviceId`)
);
