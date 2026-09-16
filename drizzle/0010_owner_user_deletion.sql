CREATE TABLE `deleted_users` (
  `user_id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `deleted_by` text NOT NULL,
  `deleted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deleted_users_date` ON `deleted_users` (`deleted_at`);
