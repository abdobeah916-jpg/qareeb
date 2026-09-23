CREATE TABLE `roomModeratorInvitations` (
	`id` varchar(160) NOT NULL,
	`roomId` varchar(16) NOT NULL,
	`targetDeviceId` varchar(96) NOT NULL,
	`targetName` varchar(40) NOT NULL,
	`targetColor` varchar(7) NOT NULL,
	`invitedBy` varchar(96) NOT NULL,
	`invitedByName` varchar(40) NOT NULL,
	`canPin` boolean NOT NULL DEFAULT false,
	`canRename` boolean NOT NULL DEFAULT false,
	`canManageMembers` boolean NOT NULL DEFAULT false,
	`canClearMessages` boolean NOT NULL DEFAULT false,
	`canViewActivity` boolean NOT NULL DEFAULT true,
	`status` enum('pending','approved','declined','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`decidedAt` timestamp,
	`decidedBy` varchar(96),
	CONSTRAINT `roomModeratorInvitations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `roomNotifications` (
	`id` varchar(64) NOT NULL,
	`roomId` varchar(16) NOT NULL,
	`targetDeviceId` varchar(96) NOT NULL,
	`activityId` varchar(64) NOT NULL,
	`kind` varchar(64) NOT NULL,
	`title` varchar(120) NOT NULL,
	`body` varchar(240) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `roomNotifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `roomAdminActivity` MODIFY COLUMN `action` enum('moderator_granted','moderator_updated','moderator_removed','moderator_invited','moderator_invite_approved','moderator_invite_declined','moderator_invite_cancelled','room_renamed','member_removed','member_restored','message_pinned','message_unpinned','messages_cleared') NOT NULL;