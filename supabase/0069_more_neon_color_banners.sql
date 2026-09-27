-- Add 15 neon Feed Banners to the existing rental collection.
begin;

insert into public.cb_shop_products(id,kind,name,tier,price_gold) values
  ('neon-solar-flare','feed_banner','Solar Flare','neon',214),
  ('neon-ember-arc','feed_banner','Ember Arc','neon',216),
  ('neon-amber-spark','feed_banner','Amber Spark','neon',218),
  ('neon-lemon-pulse','feed_banner','Lemon Pulse','neon',220),
  ('neon-bio-signal','feed_banner','Bio Signal','neon',222),
  ('neon-jade-reactor','feed_banner','Jade Reactor','neon',224),
  ('neon-aurora-teal','feed_banner','Aurora Teal','neon',226),
  ('neon-arctic-glow','feed_banner','Arctic Glow','neon',228),
  ('neon-glacier-beam','feed_banner','Glacier Beam','neon',230),
  ('neon-sapphire-flash','feed_banner','Sapphire Flash','neon',232),
  ('neon-indigo-rift','feed_banner','Indigo Rift','neon',234),
  ('neon-amethyst-halo','feed_banner','Amethyst Halo','neon',236),
  ('neon-fuchsia-burst','feed_banner','Fuchsia Burst','neon',238),
  ('neon-scarlet-pulse','feed_banner','Scarlet Pulse','neon',240),
  ('neon-prism-nova','feed_banner','Prism Nova','neon',242)
on conflict (id) do update set name=excluded.name,tier=excluded.tier,price_gold=excluded.price_gold,active=true;

commit;
