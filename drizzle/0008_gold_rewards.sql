CREATE TABLE `arena_gold_ledger` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`delta` integer NOT NULL,`kind` text NOT NULL,`reference_id` text NOT NULL,`created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `arena_gold_ledger_user_date` ON `arena_gold_ledger` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `arena_gold_ledger_reference` ON `arena_gold_ledger` (`reference_id`);
