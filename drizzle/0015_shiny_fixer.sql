ALTER TABLE `chatMessages` ADD `editedBy` varchar(96);--> statement-breakpoint
ALTER TABLE `chatMessages` ADD `deletedBy` varchar(96);--> statement-breakpoint
ALTER TABLE `directMessages` ADD `editedBy` varchar(96);--> statement-breakpoint
ALTER TABLE `directMessages` ADD `deletedBy` varchar(96);