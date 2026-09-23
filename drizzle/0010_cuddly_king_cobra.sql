ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `availability` enum('available','busy','away') DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `language` enum('ar','en') DEFAULT 'ar' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `privacyMode` enum('everyone','contacts','nobody') DEFAULT 'everyone' NOT NULL;