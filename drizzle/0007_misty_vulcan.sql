CREATE TABLE `roomAdminActivity` (
	`id` varchar(64) NOT NULL,
	`roomId` varchar(16) NOT NULL,
	`actorDeviceId` varchar(96) NOT NULL,
	`actorName` varchar(40) NOT NULL,
	`action` enum('moderator_granted','moderator_updated','moderator_removed','room_renamed','member_removed','member_restored','message_pinned','message_unpinned','messages_cleared') NOT NULL,
	`targetDeviceId` varchar(96),
	`targetName` varchar(40),
	`details` varchar(180),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `roomAdminActivity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `roomModerators` (
	`id` varchar(120) NOT NULL,
	`roomId` varchar(16) NOT NULL,
	`deviceId` varchar(96) NOT NULL,
	`canPin` boolean NOT NULL DEFAULT false,
	`canRename` boolean NOT NULL DEFAULT false,
	`canManageMembers` boolean NOT NULL DEFAULT false,
	`canClearMessages` boolean NOT NULL DEFAULT false,
	`canViewActivity` boolean NOT NULL DEFAULT true,
	`assignedBy` varchar(96) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roomModerators_id` PRIMARY KEY(`id`)
);
