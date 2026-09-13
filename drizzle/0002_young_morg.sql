CREATE TABLE `app_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`avatar_url` text DEFAULT '' NOT NULL,
	`card_photo_url` text DEFAULT '' NOT NULL,
	`country_code` text DEFAULT 'PH' NOT NULL,
	`featured_photos` text DEFAULT '[]' NOT NULL,
	`featured_badges` text DEFAULT '[]' NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_profile_username` ON `app_profiles` (`username`);--> statement-breakpoint
CREATE INDEX `app_profile_updated` ON `app_profiles` (`updated_at`);