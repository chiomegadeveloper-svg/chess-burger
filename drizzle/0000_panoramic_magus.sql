CREATE TABLE `arena_feed` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`content` text NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`expires_at` integer,
	`cbr_delta` integer DEFAULT 0 NOT NULL,
	`gold_delta` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_feed_date` ON `arena_feed` (`created_at`);--> statement-breakpoint
CREATE TABLE `arena_hearts` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_id` text NOT NULL,
	`user_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_heart_feed` ON `arena_hearts` (`feed_id`);--> statement-breakpoint
CREATE TABLE `arena_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `arena_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `arena_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`white_id` text NOT NULL,
	`black_id` text,
	`invite_to` text,
	`code` text NOT NULL,
	`control` text NOT NULL,
	`status` text NOT NULL,
	`pgn` text DEFAULT '' NOT NULL,
	`white_ms` integer NOT NULL,
	`black_ms` integer NOT NULL,
	`last_tick` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`result` text,
	`white_cbr` integer NOT NULL,
	`black_cbr` integer DEFAULT 88 NOT NULL,
	`rating_applied` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arena_match_code` ON `arena_matches` (`code`);--> statement-breakpoint
CREATE INDEX `arena_match_white` ON `arena_matches` (`white_id`,`status`);--> statement-breakpoint
CREATE INDEX `arena_match_black` ON `arena_matches` (`black_id`,`status`);--> statement-breakpoint
CREATE INDEX `arena_match_invite` ON `arena_matches` (`invite_to`,`status`);--> statement-breakpoint
CREATE TABLE `arena_players` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text DEFAULT '' NOT NULL,
	`country_code` text DEFAULT 'PH' NOT NULL,
	`cbr` integer DEFAULT 88 NOT NULL,
	`gold_points` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`win_streak` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arena_username` ON `arena_players` (`username`);--> statement-breakpoint
CREATE INDEX `arena_rank` ON `arena_players` (`cbr`);--> statement-breakpoint
CREATE TABLE `arena_presence` (
	`user_id` text PRIMARY KEY NOT NULL,
	`lat` real,
	`lng` real,
	`accuracy` real,
	`gps` integer DEFAULT 0 NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_presence_seen` ON `arena_presence` (`seen_at`);--> statement-breakpoint
CREATE TABLE `arena_queue` (
	`user_id` text PRIMARY KEY NOT NULL,
	`control` text NOT NULL,
	`seen_at` integer NOT NULL,
	`match_id` text
);
--> statement-breakpoint
CREATE INDEX `arena_queue_search` ON `arena_queue` (`control`,`seen_at`);--> statement-breakpoint
CREATE TABLE `arena_territory` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_territory_owner` ON `arena_territory` (`user_id`,`created_at`);