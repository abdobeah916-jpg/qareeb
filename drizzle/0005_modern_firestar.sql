ALTER TABLE `chatMessages` ADD `pinnedAt` timestamp;--> statement-breakpoint
ALTER TABLE `chatMessages` ADD `pinnedBy` varchar(96);--> statement-breakpoint
ALTER TABLE `chatRooms` ADD `name` varchar(80) DEFAULT 'غرفة قريب' NOT NULL;--> statement-breakpoint
ALTER TABLE `chatRooms` ADD `ownerId` varchar(96);--> statement-breakpoint
ALTER TABLE `chatRooms` ADD `pinnedMessageId` varchar(64);