CREATE TABLE `directConversations` (
	`id` varchar(64) NOT NULL,
	`participantOne` varchar(96) NOT NULL,
	`participantOneName` varchar(40) NOT NULL,
	`participantOneColor` varchar(7) NOT NULL,
	`participantTwo` varchar(96) NOT NULL,
	`participantTwoName` varchar(40) NOT NULL,
	`participantTwoColor` varchar(7) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `directConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `directMessages` (
	`id` varchar(64) NOT NULL,
	`conversationId` varchar(64) NOT NULL,
	`senderId` varchar(96) NOT NULL,
	`senderName` varchar(40) NOT NULL,
	`senderColor` varchar(7) NOT NULL,
	`text` text NOT NULL,
	`attachmentName` varchar(120),
	`attachmentType` varchar(100),
	`attachmentUrl` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `directMessages_id` PRIMARY KEY(`id`)
);
