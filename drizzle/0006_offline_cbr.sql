ALTER TABLE `arena_players` ADD `ocbr` integer DEFAULT 88 NOT NULL;
--> statement-breakpoint
CREATE INDEX `arena_offline_rank` ON `arena_players` (`ocbr`);
