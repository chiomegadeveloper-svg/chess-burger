// Single catalogue shared by room, server combat, browser combat, and ct.js effects.
(function(root){
 const skills=[
  {
    "id": "basic",
    "name": "Basic Tackle",
    "category": "physical",
    "sprite": "skill_basic",
    "bonus": [
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "description": "A quick, economical shoulder impact.",
    "ap": 4,
    "mp": 2,
    "cooldown": 0,
    "scale": 0.38,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 0,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "punch",
    "name": "Super Punch",
    "category": "physical",
    "sprite": "skill_punch",
    "bonus": [
      0,
      3,
      0,
      0,
      0,
      0
    ],
    "description": "A heavy close-range punch.",
    "ap": 8,
    "mp": 4,
    "cooldown": 1,
    "scale": 0.7,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 1,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "crescent_slash",
    "name": "Crescent Slash",
    "category": "physical",
    "sprite": "skill_crescent_slash",
    "bonus": [
      0,
      2,
      0,
      0,
      0,
      2
    ],
    "description": "A broad silver blade arc.",
    "ap": 10,
    "mp": 4,
    "cooldown": 1,
    "scale": 0.82,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 2,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "piercing_thrust",
    "name": "Piercing Thrust",
    "category": "physical",
    "sprite": "skill_piercing_thrust",
    "bonus": [
      0,
      2,
      0,
      0,
      0,
      2
    ],
    "description": "A concentrated forward strike.",
    "ap": 12,
    "mp": 5,
    "cooldown": 2,
    "scale": 0.96,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 3,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "hammer_crash",
    "name": "Hammer Crash",
    "category": "physical",
    "sprite": "skill_hammer_crash",
    "bonus": [
      0,
      2,
      0,
      0,
      0,
      2
    ],
    "description": "A crushing impact that scatters stone.",
    "ap": 14,
    "mp": 6,
    "cooldown": 2,
    "scale": 1.1,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 4,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "meteor_fist",
    "name": "Meteor Fist",
    "category": "physical",
    "sprite": "skill_meteor_fist",
    "bonus": [
      0,
      2,
      0,
      0,
      0,
      2
    ],
    "description": "A costly, powerful golden finishing blow.",
    "ap": 18,
    "mp": 8,
    "cooldown": 3,
    "scale": 1.35,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 5,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "stone_shard",
    "name": "Stone Shard",
    "category": "elemental",
    "sprite": "skill_stone_shard",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "Launch a sharpened fragment of earth.",
    "ap": 3,
    "mp": 4,
    "cooldown": 0,
    "scale": 0.4,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 0,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "tidal_orb",
    "name": "Tidal Orb",
    "category": "elemental",
    "sprite": "skill_tidal_orb",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "Strike with a compressed sphere of water.",
    "ap": 5,
    "mp": 6,
    "cooldown": 1,
    "scale": 0.62,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 1,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "frost_lance",
    "name": "Frost Lance",
    "category": "elemental",
    "sprite": "skill_frost_lance",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "A sharp lance of enchanted ice.",
    "ap": 6,
    "mp": 8,
    "cooldown": 2,
    "scale": 0.85,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 2,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "thorn_burst",
    "name": "Thorn Burst",
    "category": "elemental",
    "sprite": "skill_thorn_burst",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "Unleash a cluster of magical thorns.",
    "ap": 8,
    "mp": 9,
    "cooldown": 2,
    "scale": 0.96,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 3,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "crystal_crush",
    "name": "Crystal Crush",
    "category": "elemental",
    "sprite": "skill_crystal_crush",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "Shatter a concentrated violet crystal.",
    "ap": 10,
    "mp": 11,
    "cooldown": 3,
    "scale": 1.15,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 4,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "earthbreaker",
    "name": "Earthbreaker",
    "category": "elemental",
    "sprite": "skill_earthbreaker",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "Release a deep eruption of earth energy.",
    "ap": 12,
    "mp": 14,
    "cooldown": 3,
    "scale": 1.35,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 5,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "gust",
    "name": "Gust",
    "category": "wind",
    "sprite": "skill_gust",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A fast, inexpensive pulse of air.",
    "ap": 3,
    "mp": 4,
    "cooldown": 0,
    "scale": 0.4,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 0,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "wind_blade",
    "name": "Wind Blade",
    "category": "wind",
    "sprite": "skill_wind_blade",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "Cut through the air with a mint crescent.",
    "ap": 5,
    "mp": 6,
    "cooldown": 1,
    "scale": 0.62,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 1,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "air_lance",
    "name": "Air Lance",
    "category": "wind",
    "sprite": "skill_air_lance",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A focused spear of rushing air.",
    "ap": 6,
    "mp": 8,
    "cooldown": 2,
    "scale": 0.85,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 2,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "cyclone",
    "name": "Cyclone",
    "category": "wind",
    "sprite": "skill_cyclone",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A tightly wound spinning vortex.",
    "ap": 8,
    "mp": 9,
    "cooldown": 2,
    "scale": 0.96,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 3,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "gale_burst",
    "name": "Gale Burst",
    "category": "wind",
    "sprite": "skill_gale_burst",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "Release a powerful radial gale.",
    "ap": 10,
    "mp": 11,
    "cooldown": 3,
    "scale": 1.15,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 4,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "tempest",
    "name": "Tempest",
    "category": "wind",
    "sprite": "skill_tempest",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A high-cost storm of swirling air.",
    "ap": 12,
    "mp": 14,
    "cooldown": 3,
    "scale": 1.35,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 5,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "ember",
    "name": "Ember",
    "category": "fire",
    "sprite": "skill_ember",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "A small, efficient burning spark.",
    "ap": 3,
    "mp": 4,
    "cooldown": 0,
    "scale": 0.4,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 0,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "fireball",
    "name": "Fireball",
    "category": "fire",
    "sprite": "skill_fireball",
    "bonus": [
      0,
      0,
      3,
      0,
      1,
      0
    ],
    "description": "A focused burst of fire magic.",
    "ap": 6,
    "mp": 8,
    "cooldown": 2,
    "scale": 0.85,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 1,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "flame_slash",
    "name": "Flame Slash",
    "category": "fire",
    "sprite": "skill_flame_slash",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "A sweeping arc of crimson flame.",
    "ap": 6,
    "mp": 8,
    "cooldown": 2,
    "scale": 0.85,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 2,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "scorch_lance",
    "name": "Scorch Lance",
    "category": "fire",
    "sprite": "skill_scorch_lance",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "A concentrated spear of fire.",
    "ap": 8,
    "mp": 9,
    "cooldown": 2,
    "scale": 0.96,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 3,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "inferno",
    "name": "Inferno",
    "category": "fire",
    "sprite": "skill_inferno",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "An expanding ring of searing flame.",
    "ap": 10,
    "mp": 11,
    "cooldown": 3,
    "scale": 1.15,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 4,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "phoenix_flare",
    "name": "Phoenix Flare",
    "category": "fire",
    "sprite": "skill_phoenix_flare",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "A golden phoenix-shaped magical burst.",
    "ap": 12,
    "mp": 14,
    "cooldown": 3,
    "scale": 1.35,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 5,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "spark",
    "name": "Spark",
    "category": "lightning",
    "sprite": "skill_spark",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A small, economical electric arc.",
    "ap": 3,
    "mp": 4,
    "cooldown": 0,
    "scale": 0.4,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 0,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "volt_dart",
    "name": "Volt Dart",
    "category": "lightning",
    "sprite": "skill_volt_dart",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "Fire a focused electric projectile.",
    "ap": 5,
    "mp": 6,
    "cooldown": 1,
    "scale": 0.62,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 1,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "thunder_lash",
    "name": "Thunder Lash",
    "category": "lightning",
    "sprite": "skill_thunder_lash",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A crackling whip of blue electricity.",
    "ap": 6,
    "mp": 8,
    "cooldown": 2,
    "scale": 0.85,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 2,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "lightning",
    "name": "Lightning",
    "category": "lightning",
    "sprite": "skill_lightning",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A precise golden lightning strike.",
    "ap": 10,
    "mp": 10,
    "cooldown": 3,
    "scale": 1.1,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 3,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "chain_surge",
    "name": "Chain Surge",
    "category": "lightning",
    "sprite": "skill_chain_surge",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "Interlinked violet bolts strike one opponent.",
    "ap": 10,
    "mp": 11,
    "cooldown": 3,
    "scale": 1.15,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 4,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "thunderstorm",
    "name": "Thunderstorm",
    "category": "lightning",
    "sprite": "skill_thunderstorm",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A powerful blue and gold lightning explosion.",
    "ap": 12,
    "mp": 14,
    "cooldown": 3,
    "scale": 1.35,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 5,
      "frames": 6,
      "fps": 9
    }
  }
];
 root.RPG_ATTACK_SKILLS=skills;
 if(typeof module!=="undefined"&&module.exports)module.exports=skills;
})(globalThis);
