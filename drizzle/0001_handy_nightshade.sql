CREATE TABLE `arena_offline_results` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`record` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_offline_owner` ON `arena_offline_results` (`user_id`,`created_at`);