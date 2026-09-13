import {sqliteTable,text,integer,real,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const arenaPlayers=sqliteTable('arena_players',{
 user_id:text().primaryKey(),username:text().notNull(),display_name:text().notNull(),avatar_url:text().notNull().default(''),country_code:text().notNull().default('PH'),
 cbr:integer().notNull().default(88),gold_points:integer().notNull().default(0),wins:integer().notNull().default(0),losses:integer().notNull().default(0),win_streak:integer().notNull().default(0),updated_at:integer().notNull(),
},t=>[uniqueIndex('arena_username').on(t.username),index('arena_rank').on(t.cbr)]);
export const arenaPresence=sqliteTable('arena_presence',{
 user_id:text().primaryKey(),lat:real(),lng:real(),accuracy:real(),gps:integer().notNull().default(0),seen_at:integer().notNull(),
},t=>[index('arena_presence_seen').on(t.seen_at)]);
export const arenaQueue=sqliteTable('arena_queue',{
 user_id:text().primaryKey(),control:text().notNull(),seen_at:integer().notNull(),match_id:text(),
},t=>[index('arena_queue_search').on(t.control,t.seen_at)]);
export const arenaMatches=sqliteTable('arena_matches',{
 id:text().primaryKey(),host_id:text().notNull(),white_id:text().notNull(),black_id:text(),invite_to:text(),code:text().notNull(),control:text().notNull(),status:text().notNull(),pgn:text().notNull().default(''),
 white_ms:integer().notNull(),black_ms:integer().notNull(),last_tick:integer().notNull(),version:integer().notNull().default(0),result:text(),white_cbr:integer().notNull(),black_cbr:integer().notNull().default(88),rating_applied:integer().notNull().default(0),created_at:integer().notNull(),
},t=>[uniqueIndex('arena_match_code').on(t.code),index('arena_match_white').on(t.white_id,t.status),index('arena_match_black').on(t.black_id,t.status),index('arena_match_invite').on(t.invite_to,t.status)]);
export const arenaLedger=sqliteTable('arena_ledger',{id:text().primaryKey(),user_id:text().notNull(),delta:integer().notNull(),kind:text().notNull(),created_at:integer().notNull()});
export const arenaFeed=sqliteTable('arena_feed',{id:text().primaryKey(),user_id:text().notNull(),kind:text().notNull(),display_name:text().notNull(),content:text().notNull(),image_url:text().notNull().default(''),expires_at:integer(),cbr_delta:integer().notNull().default(0),gold_delta:integer().notNull().default(0),created_at:integer().notNull()},t=>[index('arena_feed_date').on(t.created_at)]);
export const arenaHearts=sqliteTable('arena_hearts',{id:text().primaryKey(),feed_id:text().notNull(),user_id:text().notNull()},t=>[index('arena_heart_feed').on(t.feed_id)]);
export const arenaLogs=sqliteTable('arena_logs',{id:text().primaryKey(),actor_user_id:text().notNull(),action:text().notNull(),details:text().notNull(),created_at:integer().notNull()});
export const arenaTerritory=sqliteTable('arena_territory',{id:text().primaryKey(),user_id:text().notNull(),lat:real().notNull(),lng:real().notNull(),created_at:integer().notNull()},t=>[index('arena_territory_owner').on(t.user_id,t.created_at)]);

export const arenaOfflineResults=sqliteTable('arena_offline_results',{id:text().primaryKey(),user_id:text().notNull(),record:text().notNull(),created_at:integer().notNull()},t=>[index('arena_offline_owner').on(t.user_id,t.created_at)]);

export const appProfiles=sqliteTable('app_profiles',{
 user_id:text().primaryKey(),username:text().notNull(),display_name:text().notNull(),bio:text().notNull().default(''),avatar_url:text().notNull().default(''),card_photo_url:text().notNull().default(''),country_code:text().notNull().default('PH'),
 featured_photos:text().notNull().default('[]'),featured_badges:text().notNull().default('[]'),role:text().notNull().default('player'),created_at:integer().notNull(),updated_at:integer().notNull(),
},t=>[uniqueIndex('app_profile_username').on(t.username),index('app_profile_updated').on(t.updated_at)]);

export const appFeature=sqliteTable('app_feature',{id:text().primaryKey(),image_url:text().notNull().default(''),updated_at:integer().notNull()});

export const socialLinks=sqliteTable('social_links',{
 id:text().primaryKey(),user_id:text().notNull(),target_id:text().notNull(),kind:text().notNull(),status:text().notNull().default('active'),created_at:integer().notNull(),
},t=>[uniqueIndex('social_link_unique').on(t.user_id,t.target_id,t.kind),index('social_link_target').on(t.target_id,t.kind)]);
export const socialPresence=sqliteTable('social_presence',{user_id:text().primaryKey(),seen_at:integer().notNull()});
export const socialMessages=sqliteTable('social_messages',{
 id:text().primaryKey(),sender_id:text().notNull(),recipient_id:text(),body:text().notNull(),created_at:integer().notNull(),
},t=>[index('social_message_recipient').on(t.recipient_id,t.created_at),index('social_message_sender').on(t.sender_id,t.created_at)]);
