/**
 * Defines the ROM regions that contain palettes we can modify.
 * All offsets are for unheadered ROMs; header offset is added at apply time.
 *
 * Only includes regions verified to contain valid BGR555 palette data.
 * Enemy palette offsets derived from species headers in bank $A0 using
 * the algorithm from super_metroid_editor's readEnemyPalette().
 * Map Rando does NOT touch any sprite palettes — all offsets are safe.
 */

export interface PaletteRegion {
  id: string;
  name: string;
  description: string;
  offset: number;      // PC offset (unheadered)
  colorCount: number;   // number of BGR555 colors (not bytes)
  category: "samus" | "beams" | "environment" | "bosses" | "enemies";
}

// Samus palette blocks: each suit has 33 palettes x 16 colors = 528 colors
export const REGIONS: PaletteRegion[] = [
  // ─── Samus ───
  {
    id: "samus_power",
    name: "Power Suit",
    description: "Default suit (all animation frames)",
    offset: 0x0d9400,
    colorCount: 528,
    category: "samus",
  },
  {
    id: "samus_varia",
    name: "Varia Suit",
    description: "Varia suit (all animation frames)",
    offset: 0x0d9820,
    colorCount: 528,
    category: "samus",
  },
  {
    id: "samus_gravity",
    name: "Gravity Suit",
    description: "Gravity suit (all animation frames)",
    offset: 0x0d9c40,
    colorCount: 528,
    category: "samus",
  },
  // 27 rows × 16 colors = 432 (verified: row 27 at 0x0DA3C0 is game code, not palette)
  {
    id: "samus_extra",
    name: "Samus Extra",
    description: "Ship, crystal flash, hyper beam palettes",
    offset: 0x0da060,
    colorCount: 432,
    category: "samus",
  },

  // ─── Beams ───
  {
    id: "beam_standard",
    name: "Standard Beam",
    description: "Power beam projectile colors",
    offset: 0x0d7c00,
    colorCount: 16,
    category: "beams",
  },

  // ─── Bosses ───
  // Derived from species headers in bank $A0. Each boss has 1 palette row (16 colors).
  // Most bosses use multiple CGRAM rows at runtime; species header only points to row 0.
  // Some bosses (Phantoon body, Kraid body) also use tileset palette rows (covered by Environment).
  // All offsets verified by extract-palettes.mjs against test ROM.
  { id: "boss_spore_spawn", name: "Spore Spawn", description: "Spore Spawn palette", offset: 0x12e359, colorCount: 16, category: "bosses" },
  { id: "boss_ridley", name: "Ridley", description: "Ridley / Ceres Ridley palette", offset: 0x13614f, colorCount: 16, category: "bosses" },
  { id: "boss_kraid", name: "Kraid", description: "Kraid palette (all parts share)", offset: 0x138687, colorCount: 16, category: "bosses" },
  { id: "boss_phantoon", name: "Phantoon", description: "Phantoon palette (all parts share)", offset: 0x13ca01, colorCount: 16, category: "bosses" },
  { id: "boss_draygon", name: "Draygon", description: "Draygon palette (body/tail/arms share)", offset: 0x12a1f7, colorCount: 16, category: "bosses" },
  { id: "boss_crocomire", name: "Crocomire", description: "Crocomire palette", offset: 0x12387d, colorCount: 16, category: "bosses" },
  { id: "boss_mother_brain", name: "Mother Brain", description: "Mother Brain P1 and P2 palette", offset: 0x149472, colorCount: 16, category: "bosses" },
  { id: "boss_botwoon", name: "Botwoon", description: "Botwoon palette", offset: 0x199319, colorCount: 16, category: "bosses" },
  { id: "boss_torizo", name: "Torizo", description: "Torizo / Golden Torizo palette", offset: 0x150687, colorCount: 16, category: "bosses" },
  { id: "boss_big_metroid", name: "Big Metroid", description: "Baby Metroid (end-game) palette", offset: 0x14f8e6, colorCount: 16, category: "bosses" },
  { id: "boss_mini_kraid", name: "Mini Kraid", description: "Mini Kraid palette", offset: 0x13198c, colorCount: 16, category: "bosses" },

  // ─── Enemies ───
  // All offsets extracted from species headers via readEnemyPalette() algorithm.
  // Verified against ROM: valid BGR555 data at each offset, 16 colors per entry.

  // Metroids
  { id: "enemy_metroid", name: "Metroid", description: "Metroid palette", offset: 0x11e9af, colorCount: 16, category: "enemies" },
  { id: "enemy_metroid_modified", name: "Metroid (modified)", description: "Metroid variant palette", offset: 0x11a725, colorCount: 16, category: "enemies" },

  // Space Pirates (6 distinct color variants)
  { id: "enemy_space_pirate", name: "Space Pirate", description: "Space Pirate palette (Crateria)", offset: 0x190687, colorCount: 16, category: "enemies" },
  { id: "enemy_space_pirate_brinstar", name: "Space Pirate (Brinstar)", description: "Space Pirate Brinstar palette", offset: 0x1906a7, colorCount: 16, category: "enemies" },
  { id: "enemy_space_pirate_norfair", name: "Space Pirate (Norfair)", description: "Space Pirate Norfair palette", offset: 0x190727, colorCount: 16, category: "enemies" },
  { id: "enemy_space_pirate_maridia", name: "Space Pirate (Maridia)", description: "Space Pirate Maridia palette", offset: 0x1906c7, colorCount: 16, category: "enemies" },
  { id: "enemy_space_pirate_tourian", name: "Space Pirate (Tourian)", description: "Space Pirate Tourian palette", offset: 0x190707, colorCount: 16, category: "enemies" },
  { id: "enemy_tourian_escape_pirate", name: "Tourian Escape Pirate", description: "Tourian escape sequence pirate palette", offset: 0x19e525, colorCount: 16, category: "enemies" },

  // Kihunters (3 color variants)
  { id: "enemy_kihunter_green", name: "Kihunter (green)", description: "Kihunter green palette", offset: 0x14699a, colorCount: 16, category: "enemies" },
  { id: "enemy_kihunter_red", name: "Kihunter (red)", description: "Kihunter red palette", offset: 0x1469ba, colorCount: 16, category: "enemies" },
  { id: "enemy_kihunter_gold", name: "Kihunter (gold)", description: "Kihunter gold palette", offset: 0x1469da, colorCount: 16, category: "enemies" },

  // Common enemies
  { id: "enemy_zoomer", name: "Zoomer", description: "Zoomer palette", offset: 0x11e5b0, colorCount: 16, category: "enemies" },
  { id: "enemy_geemer", name: "Geemer (horizontal)", description: "Geemer palette", offset: 0x11dfa2, colorCount: 16, category: "enemies" },
  { id: "enemy_ripper", name: "Ripper", description: "Ripper palette", offset: 0x116457, colorCount: 16, category: "enemies" },
  { id: "enemy_ripper_ii", name: "Ripper II", description: "Ripper II palette", offset: 0x11617b, colorCount: 16, category: "enemies" },
  { id: "enemy_sidehopper", name: "Sidehopper", description: "Sidehopper palette", offset: 0x11aa48, colorCount: 16, category: "enemies" },
  { id: "enemy_sidehopper_big", name: "Sidehopper (big)", description: "Big Sidehopper palette", offset: 0x11b085, colorCount: 16, category: "enemies" },
  { id: "enemy_dessgeega", name: "Dessgeega", description: "Dessgeega palette", offset: 0x11af85, colorCount: 16, category: "enemies" },
  { id: "enemy_waver", name: "Waver", description: "Waver palette", offset: 0x118687, colorCount: 16, category: "enemies" },
  { id: "enemy_reo", name: "Reo", description: "Reo palette", offset: 0x113a7b, colorCount: 16, category: "enemies" },
  { id: "enemy_skree", name: "Skree", description: "Skree palette", offset: 0x119b9b, colorCount: 16, category: "enemies" },
  { id: "enemy_skree_norfair", name: "Skree (Norfair)", description: "Norfair Skree palette", offset: 0x11c63e, colorCount: 16, category: "enemies" },
  { id: "enemy_viola", name: "Viola", description: "Viola palette", offset: 0x11b5b3, colorCount: 16, category: "enemies" },
  { id: "enemy_multiviola", name: "Multiviola", description: "Multiviola palette", offset: 0x1132bc, colorCount: 16, category: "enemies" },
  { id: "enemy_zeela", name: "Zeela", description: "Zeela palette", offset: 0x11e23c, colorCount: 16, category: "enemies" },
  { id: "enemy_sova", name: "Sova", description: "Sova palette", offset: 0x11e57c, colorCount: 16, category: "enemies" },
  { id: "enemy_sciser", name: "Sciser", description: "Sciser (Maridia crab) palette", offset: 0x11965b, colorCount: 16, category: "enemies" },
  { id: "enemy_skultera", name: "Skultera", description: "Skultera palette", offset: 0x11900a, colorCount: 16, category: "enemies" },
  { id: "enemy_dragon", name: "Dragon", description: "Dragon palette (Norfair lava dragon)", offset: 0x11657b, colorCount: 16, category: "enemies" },

  // Flyers and shooters
  { id: "enemy_geruta", name: "Geruta", description: "Geruta palette", offset: 0x1140d1, colorCount: 16, category: "enemies" },
  { id: "enemy_holtz", name: "Holtz", description: "Holtz palette", offset: 0x1145fa, colorCount: 16, category: "enemies" },
  { id: "enemy_squeept", name: "Squeept", description: "Squeept palette", offset: 0x113e1c, colorCount: 16, category: "enemies" },
  { id: "enemy_cacatac", name: "Cacatac", description: "Cacatac palette", offset: 0x111e6a, colorCount: 16, category: "enemies" },
  { id: "enemy_owtch", name: "Owtch", description: "Owtch (spike enemy) palette", offset: 0x11238b, colorCount: 16, category: "enemies" },

  // Maridia / Aquatic
  { id: "enemy_beetom", name: "Beetom", description: "Beetom palette", offset: 0x14365e, colorCount: 16, category: "enemies" },
  { id: "enemy_atomic", name: "Atomic", description: "Atomic palette", offset: 0x146230, colorCount: 16, category: "enemies" },
  { id: "enemy_zoa", name: "Zoa", description: "Zoa palette", offset: 0x11b3a1, colorCount: 16, category: "enemies" },
  { id: "enemy_oum", name: "Oum", description: "Oum palette", offset: 0x11980b, colorCount: 16, category: "enemies" },
  { id: "enemy_alcoon", name: "Alcoon", description: "Alcoon palette", offset: 0x145bc7, colorCount: 16, category: "enemies" },
  { id: "enemy_puu", name: "Puu", description: "Puu (Maridia ghost) palette", offset: 0x144143, colorCount: 16, category: "enemies" },
  { id: "enemy_evir", name: "Evir", description: "Evir palette", offset: 0x140687, colorCount: 16, category: "enemies" },
  { id: "enemy_yapping_maw", name: "Yapping Maw", description: "Yapping Maw palette", offset: 0x141f4f, colorCount: 16, category: "enemies" },
  { id: "enemy_namihe", name: "Namihe", description: "Namihe palette", offset: 0x14159d, colorCount: 16, category: "enemies" },
  { id: "enemy_fune", name: "Fune", description: "Fune palette", offset: 0x141379, colorCount: 16, category: "enemies" },

  // Norfair
  { id: "enemy_lavaman", name: "Lavaman", description: "Lavaman palette", offset: 0x142c1c, colorCount: 16, category: "enemies" },
  { id: "enemy_puromi", name: "Puromi", description: "Puromi palette", offset: 0x131470, colorCount: 16, category: "enemies" },
  { id: "enemy_hibashi", name: "Hibashi", description: "Hibashi (flame) palette", offset: 0x130cfb, colorCount: 16, category: "enemies" },
  { id: "enemy_fireflea", name: "Fireflea", description: "Fireflea palette", offset: 0x118c0f, colorCount: 16, category: "enemies" },

  // Spawner enemies
  { id: "enemy_zeb", name: "Zeb", description: "Zeb (pipe bug) palette", offset: 0x19878b, colorCount: 16, category: "enemies" },
  { id: "enemy_zebbo", name: "Zebbo", description: "Zebbo palette", offset: 0x1989fd, colorCount: 16, category: "enemies" },
  { id: "enemy_gamet", name: "Gamet", description: "Gamet palette", offset: 0x198ac1, colorCount: 16, category: "enemies" },
  { id: "enemy_geega", name: "Geega", description: "Geega palette", offset: 0x198edc, colorCount: 16, category: "enemies" },

  // Misc notable
  { id: "enemy_koma", name: "Koma", description: "Koma palette", offset: 0x1467ac, colorCount: 16, category: "enemies" },
  { id: "enemy_shaktool", name: "Shaktool", description: "Shaktool palette", offset: 0x155911, colorCount: 16, category: "enemies" },
  { id: "enemy_work_robot", name: "Work Robot", description: "Work Robot palette", offset: 0x1446b3, colorCount: 16, category: "enemies" },
  { id: "enemy_wrecked_ship_robot", name: "Wrecked Ship Robot", description: "Wrecked Ship Robot palette", offset: 0x14f8a6, colorCount: 16, category: "enemies" },

  // Friendly NPCs
  { id: "enemy_etecoon", name: "Etecoon", description: "Etecoon palette", offset: 0x13e7fe, colorCount: 16, category: "enemies" },
  { id: "enemy_dachora", name: "Dachora", description: "Dachora palette", offset: 0x13f225, colorCount: 16, category: "enemies" },

  // Ship as enemy sprite (in-game landing pad appearance)
  { id: "enemy_samus_ship", name: "Samus Ship (sprite)", description: "Samus ship enemy sprite palette", offset: 0x11259e, colorCount: 16, category: "enemies" },
];

export function getRegionsByCategory(category: PaletteRegion["category"] | "all"): PaletteRegion[] {
  if (category === "all") return REGIONS;
  return REGIONS.filter(r => r.category === category);
}

export const CATEGORIES = [
  { id: "all" as const, name: "Everything" },
  { id: "environment" as const, name: "Environment" },
  { id: "samus" as const, name: "Samus" },
  { id: "beams" as const, name: "Beams" },
  { id: "bosses" as const, name: "Bosses" },
  { id: "enemies" as const, name: "Enemies" },
] as const;
