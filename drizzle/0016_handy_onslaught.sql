CREATE TABLE `abuseEvents` (
	`id` varchar(96) NOT NULL,
	`actorId` varchar(96) NOT NULL,
	`action` varchar(48) NOT NULL,
	`subjectKey` varchar(120) NOT NULL,
	`details` varchar(240),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `abuseEvents_id` PRIMARY KEY(`id`)
);
