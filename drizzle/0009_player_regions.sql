CREATE TABLE `arena_player_regions` (
  `user_id` text PRIMARY KEY NOT NULL,
  `barangay` text NOT NULL,
  `locality` text NOT NULL,
  `country_code` text NOT NULL DEFAULT 'PH',
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_player_regions_barangay` ON `arena_player_regions` (`barangay`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `arena_player_regions_locality` ON `arena_player_regions` (`locality`,`updated_at`);
