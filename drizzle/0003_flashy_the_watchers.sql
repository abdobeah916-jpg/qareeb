CREATE TABLE `directCallLogs` (
	`id` varchar(64) NOT NULL,
	`conversationId` varchar(64) NOT NULL,
	`callerId` varchar(96) NOT NULL,
	`recipientId` varchar(96) NOT NULL,
	`callType` enum('audio','video') NOT NULL,
	`status` enum('ringing','accepted','missed','rejected','ended','failed') NOT NULL DEFAULT 'ringing',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`answeredAt` timestamp,
	`endedAt` timestamp,
	CONSTRAINT `directCallLogs_id` PRIMARY KEY(`id`)
);
