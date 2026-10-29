# Aligned Hero Room loadout — v0.0992

The four active attack slots and the existing Skill Book button share one five-column row. All five frames use matching square geometry and spacing. The Power Library title and learning progress sit below that row, followed by storage slots, pagination and adventure navigation. The book retains its existing artwork, available-choice glow and learning flow.

The active-slot group uses display:contents so its four existing buttons join the shared grid without changing slot IDs, order, keyboard access or drag/drop targets. Portrait layouts also use the full panel width for the five-frame row.

Verification: three focused live UI checks passed, including rune rendering, previews, cancel/activate and replacement learning. Browser review measured five equal-height frames on a shared baseline at about 71.4px square in a 1363×936 desktop viewport and 43.5px square in a 720×360 mobile landscape iframe. The relocated book opened correctly. QA used a local fixture, with no production account or wallet. Screenshot: images/rpg-loadout-row-v0992.jpg.
