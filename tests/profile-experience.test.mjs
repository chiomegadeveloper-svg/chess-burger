import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const recent = read("../app/recent-plays.tsx");
const history = read("../app/game-history.ts");
const media = read("../app/media.ts");
const bucket = read("../app/profile-photo-bucket.tsx");
const testimonials = read("../app/testimonials.tsx");
const api = read("../api/arena.ts");
const migration = read("../supabase/0023_profile_testimonials.sql");
const dailyRanks = read("../supabase/0024_daily_top10_gold.sql");
const rankings = read("../app/rankings.tsx");

test("recent plays display five per page and retain twenty", () => {
  assert.match(recent, /slice\(0,20\)/);
  assert.match(recent, /slice\(\(page-1\)\*5,page\*5\)/);
  assert.match(history, /games\.slice\(0,20\)/);
  assert.match(recent, /aria-expanded=\{expanded\}/);
  assert.match(recent, /className="history-details"/);
});

test("all image processing targets WebP under 600 KB", () => {
  assert.match(media, /MAX_IMAGE_BYTES = 600_000/);
  assert.match(media, /"image\/webp"/);
});

test("featured photos use direct uploads and a tap-to-close responsive viewer", () => {
  assert.match(bucket, /type="file"/);
  assert.match(bucket, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(bucket, /onUpload\(file,index\)/);
  assert.match(bucket, /aria-label="Return to thumbnails"/);
});

test("testimonials enforce one entry with paging, hearts, and authorized deletion", () => {
  assert.match(testimonials, /testimonial-add/);
  assert.match(testimonials, /testimonial-heart/);
  assert.match(testimonials, /testimonial-delete/);
  assert.match(testimonials, /Page \{page\} of \{pages\}/);
  assert.match(api, /pageSize=10/);
  assert.match(api, /Only the author or profile owner can delete this testimonial/);
  assert.match(migration, /profile_id=auth\.uid\(\) or author_id=auth\.uid\(\)/);
  assert.match(migration, /cb_profile_testimonials_one_per_author_idx/);
  assert.match(migration, /primary key \(testimonial_id, user_id\)/);
});

test("daily Top 10 Gold rewards are ranked, idempotent, scheduled, and announced", () => {
  assert.match(dailyRanks, /when v_player\.rank = 1 then 10/);
  assert.match(dailyRanks, /when v_player\.rank = 2 then 9/);
  assert.match(dailyRanks, /when v_player\.rank = 3 then 8/);
  assert.match(dailyRanks, /else 5/);
  assert.match(dailyRanks, /primary key \(reward_date, user_id\)/);
  assert.match(dailyRanks, /'top10'/);
  assert.match(dailyRanks, /'5 16 \* \* \*'/);
  assert.match(rankings, /Gold \/ day/);
});
