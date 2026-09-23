CREATE TABLE `backupManifests` (
	`id` varchar(96) NOT NULL,
	`scopeType` enum('room','global') NOT NULL,
	`scopeId` varchar(64),
	`createdBy` varchar(96) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(512) NOT NULL,
	`sizeBytes` int NOT NULL DEFAULT 0,
	`status` enum('ready','failed','restored') NOT NULL DEFAULT 'ready',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`restoredAt` timestamp,
	CONSTRAINT `backupManifests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messagePins` (
	`id` varchar(120) NOT NULL,
	`scopeType` enum('room','direct') NOT NULL,
	`scopeId` varchar(64) NOT NULL,
	`messageId` varchar(64) NOT NULL,
	`pinnedBy` varchar(96) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messagePins_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_pins_scope_message_unique` UNIQUE(`scopeType`,`scopeId`,`messageId`)
);
--> statement-breakpoint
CREATE TABLE `messageReceipts` (
	`id` varchar(120) NOT NULL,
	`messageId` varchar(64) NOT NULL,
	`scopeType` enum('room','direct') NOT NULL,
	`readerId` varchar(96) NOT NULL,
	`status` enum('sent','delivered','read') NOT NULL DEFAULT 'delivered',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `messageReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_receipts_reader_unique` UNIQUE(`messageId`,`scopeType`,`readerId`)
);
--> statement-breakpoint
CREATE TABLE `moderationActions` (
	`id` varchar(96) NOT NULL,
	`reportId` varchar(96),
	`actorId` varchar(96) NOT NULL,
	`targetUserId` varchar(96) NOT NULL,
	`action` enum('warn','mute','ban','unban','dismiss') NOT NULL,
	`scopeType` enum('room','direct','global') NOT NULL,
	`scopeId` varchar(64),
	`note` varchar(240),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `moderationActions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rateLimitBuckets` (
	`id` varchar(180) NOT NULL,
	`subjectKey` varchar(120) NOT NULL,
	`action` varchar(48) NOT NULL,
	`windowStartedAt` timestamp NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rateLimitBuckets_id` PRIMARY KEY(`id`),
	CONSTRAINT `rate_limit_bucket_unique` UNIQUE(`subjectKey`,`action`,`windowStartedAt`)
);
--> statement-breakpoint
CREATE TABLE `retentionPolicies` (
	`id` varchar(96) NOT NULL,
	`roomId` varchar(16) NOT NULL,
	`messageRetentionDays` int NOT NULL DEFAULT 0,
	`fileRetentionDays` int NOT NULL DEFAULT 0,
	`adminActivityRetentionDays` int NOT NULL DEFAULT 365,
	`updatedBy` varchar(96) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `retentionPolicies_id` PRIMARY KEY(`id`),
	CONSTRAINT `retention_policies_room_unique` UNIQUE(`roomId`)
);
--> statement-breakpoint
CREATE TABLE `roomAnalyticsDaily` (
	`id` varchar(96) NOT NULL,
	`roomId` varchar(16) NOT NULL,
	`day` varchar(10) NOT NULL,
	`activeMembers` int NOT NULL DEFAULT 0,
	`messageCount` int NOT NULL DEFAULT 0,
	`fileCount` int NOT NULL DEFAULT 0,
	`callCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roomAnalyticsDaily_id` PRIMARY KEY(`id`),
	CONSTRAINT `room_analytics_day_unique` UNIQUE(`roomId`,`day`)
);
--> statement-breakpoint
CREATE TABLE `uploadSessions` (
	`id` varchar(120) NOT NULL,
	`ownerId` varchar(96) NOT NULL,
	`scopeType` enum('room','direct','avatar') NOT NULL,
	`scopeId` varchar(64) NOT NULL,
	`fileName` varchar(120) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`totalBytes` int NOT NULL DEFAULT 0,
	`receivedBytes` int NOT NULL DEFAULT 0,
	`storageKey` varchar(512),
	`status` enum('pending','uploading','complete','aborted') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `uploadSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userDevices` (
	`id` varchar(96) NOT NULL,
	`userId` varchar(96) NOT NULL,
	`label` varchar(120) NOT NULL,
	`userAgent` varchar(255),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `userDevices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userNotifications` (
	`id` varchar(96) NOT NULL,
	`recipientId` varchar(96) NOT NULL,
	`kind` varchar(48) NOT NULL,
	`title` varchar(120) NOT NULL,
	`body` varchar(240) NOT NULL,
	`roomId` varchar(16),
	`conversationId` varchar(64),
	`messageId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `userNotifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userPreferences` (
	`id` varchar(96) NOT NULL,
	`userId` varchar(96) NOT NULL,
	`theme` enum('light','dark','system') NOT NULL DEFAULT 'system',
	`readingBackground` enum('soft','paper','night') NOT NULL DEFAULT 'soft',
	`fontScale` int NOT NULL DEFAULT 100,
	`compactMode` boolean NOT NULL DEFAULT false,
	`ringtoneEnabled` boolean NOT NULL DEFAULT true,
	`notificationsEnabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_preferences_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `userReports` (
	`id` varchar(96) NOT NULL,
	`reporterId` varchar(96) NOT NULL,
	`targetUserId` varchar(96) NOT NULL,
	`roomId` varchar(16),
	`conversationId` varchar(64),
	`messageId` varchar(64),
	`reason` varchar(64) NOT NULL,
	`details` text,
	`status` enum('open','reviewed','resolved','dismissed') NOT NULL DEFAULT 'open',
	`reviewedBy` varchar(96),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	CONSTRAINT `userReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `chatRooms` ADD `retentionDays` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `directMessages` ADD `editedAt` timestamp;--> statement-breakpoint
ALTER TABLE `directMessages` ADD `deletedAt` timestamp;