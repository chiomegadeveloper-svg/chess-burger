# Larger Hero Room portrait — v0.0760

Hero Room uses each hero's existing cropped head avatar instead of shrinking the full-body sprite into the portrait frame. On short landscape screens the portrait shares a taller header row with the hero name and level; the face fills the frame. Other sizes retain a contained portrait. The original full-body sprites used elsewhere remain unchanged.

Validation: 25 live UI tests passed; production build passed. Browser review at 752 × 340 and 568 × 320 confirmed no Hero Room or hero panel overflow and the complete bag stayed inside its panel. The standard phone portrait frame measured approximately 99 × 70 pixels. Screenshot: images/rpg-hero-portrait-v0760.jpg. Preview used a fixture hero, not production user data.
