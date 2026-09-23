ALTER TABLE `chatMessages` ADD `replyToId` varchar(64);--> statement-breakpoint
ALTER TABLE `chatMessages` ADD `reactions` text;--> statement-breakpoint
ALTER TABLE `chatMessages` ADD `editedAt` timestamp;--> statement-breakpoint
ALTER TABLE `chatMessages` ADD `deletedAt` timestamp;