CREATE TABLE `chatMessages` (
	`id` varchar(64) NOT NULL,
	`roomId` varchar(16) NOT NULL,
	`senderId` varchar(96) NOT NULL,
	`senderName` varchar(40) NOT NULL,
	`senderColor` varchar(7) NOT NULL,
	`text` text NOT NULL,
	`attachmentName` varchar(120),
	`attachmentType` varchar(100),
	`attachmentUrl` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatParticipants` (
	`id` varchar(120) NOT NULL,
	`roomId` varchar(16) NOT NULL,
	`deviceId` varchar(96) NOT NULL,
	`name` varchar(40) NOT NULL,
	`color` varchar(7) NOT NULL,
	`lastSeen` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatParticipants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatRooms` (
	`id` varchar(16) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chatRooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
