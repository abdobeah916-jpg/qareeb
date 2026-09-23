CREATE TABLE `directConversationPreferences` (
	`id` varchar(64) NOT NULL,
	`conversationId` varchar(64) NOT NULL,
	`deviceId` varchar(96) NOT NULL,
	`peerId` varchar(96) NOT NULL,
	`isMuted` boolean NOT NULL DEFAULT false,
	`isBlocked` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `directConversationPreferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `directReadStates` (
	`id` varchar(64) NOT NULL,
	`conversationId` varchar(64) NOT NULL,
	`deviceId` varchar(96) NOT NULL,
	`lastReadAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `directReadStates_id` PRIMARY KEY(`id`)
);
