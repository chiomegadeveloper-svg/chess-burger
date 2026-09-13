-- Enforce the limit for every feed writer, including registration and announcements.
CREATE TRIGGER arena_feed_keep_latest AFTER INSERT ON arena_feed BEGIN
 DELETE FROM arena_feed WHERE id IN (SELECT id FROM arena_feed ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 50);
END;
--> statement-breakpoint
CREATE TRIGGER arena_feed_delete_hearts AFTER DELETE ON arena_feed BEGIN
 DELETE FROM arena_hearts WHERE feed_id=OLD.id;
END;
--> statement-breakpoint
-- Enforce blocking even when a block races with a follow or friend request.
CREATE TRIGGER social_links_block_guard BEFORE INSERT ON social_links
WHEN NEW.kind IN ('follow','friend') AND EXISTS(
 SELECT 1 FROM social_links WHERE kind='block' AND ((user_id=NEW.user_id AND target_id=NEW.target_id) OR(user_id=NEW.target_id AND target_id=NEW.user_id))
) BEGIN SELECT RAISE(ABORT,'This player is unavailable.'); END;
