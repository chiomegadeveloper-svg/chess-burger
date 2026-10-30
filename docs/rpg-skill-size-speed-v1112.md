# Smaller, slower attack effects — v0.1112

Skill effects render at 70% of their previous width and height, using the same visible-art footprint measurements and responsive bounds. This affects skill playback and previews, while character sprite size and rune buttons retain their current sizing. The cold-load rune fallback uses a proportionately smaller frame too.

Playback speed is half its previous effective rate: the normal six-frame attack changes from 18 FPS to 9 FPS, approximately 0.33 seconds to 0.67 seconds. Travel uses the same slowed clock, and damage still applies once at frame three. The completion watchdog accommodates full playback and still bounds a stalled ticker. Cold-load fallback animation, impact timer and finish timer all double together. Reduced-motion presentation and enemy decision delays retain their existing behavior.

Verification: 11 renderer/geometry checks and three focused battle UI checks passed, covering 9 FPS playback, visible-art fitting on compact and wide frames, impact timing, cancellation, cold loads, watchdog completion and monster replies. Production build passed.
