PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_crawl_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`urls` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
INSERT INTO `__new_crawl_jobs`("id", "urls", "status", "createdAt") SELECT "id", json_array("url"), "status", "createdAt" FROM `crawl_jobs`;--> statement-breakpoint
DROP TABLE `crawl_jobs`;--> statement-breakpoint
ALTER TABLE `__new_crawl_jobs` RENAME TO `crawl_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;