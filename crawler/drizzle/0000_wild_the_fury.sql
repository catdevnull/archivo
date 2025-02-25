CREATE TABLE `crawl_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` text DEFAULT (CURRENT_TIMESTAMP)
);
