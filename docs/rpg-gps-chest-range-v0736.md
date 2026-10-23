# RPG GPS startup and chest range — v0.0736

GPS now requests a quick cached/network location alongside the continuous accurate watch. The 10-second refresh loop no longer restarts a watch still acquiring its initial fix. Cached sample timestamps remain intact, stale callbacks are ignored, and late coarse readings cannot replace newer accurate fixes. Location estimates are distinguished from accurate GPS in the UI.

Chest opening requires a fresh GPS sample, accuracy within 50 meters, and distance at most 50 meters. The API enforces the limits. The chest dialog shows distance and disables opening until the requirements are met. Monster/player interaction remains 200 meters.

Validation: 90 regression tests passed; production build passed. Browser preview using simulated GPS opened a real Tacloban fixture chest at 49 meters and displayed the 50-meter range. API tests reject 51-meter distance and 51-meter accuracy. GPS tests cover uninterrupted slow acquisition, late cached callbacks, timestamps and stopped-world callbacks. Physical device acquisition time still depends on hardware, signal and location permissions.

Preview evidence: images/rpg-chest-range-v0736.jpg. No database migration required.
