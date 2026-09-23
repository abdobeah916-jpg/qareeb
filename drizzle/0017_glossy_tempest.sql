CREATE TABLE `uploadChunks` (
	`id` varchar(140) NOT NULL,
	`sessionId` varchar(120) NOT NULL,
	`chunkIndex` int NOT NULL,
	`byteLength` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `uploadChunks_id` PRIMARY KEY(`id`),
	CONSTRAINT `upload_chunks_session_chunk_unique` UNIQUE(`sessionId`,`chunkIndex`)
);
