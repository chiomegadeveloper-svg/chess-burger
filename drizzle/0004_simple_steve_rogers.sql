CREATE TABLE `social_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_link_unique` ON `social_links` (`user_id`,`target_id`,`kind`);--> statement-breakpoint
CREATE INDEX `social_link_target` ON `social_links` (`target_id`,`kind`);--> statement-breakpoint
CREATE TABLE `social_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `social_message_recipient` ON `social_messages` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_message_sender` ON `social_messages` (`sender_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `social_presence` (
	`user_id` text PRIMARY KEY NOT NULL,
	`seen_at` integer NOT NULL
);
