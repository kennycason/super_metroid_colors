/**
 * Defines the ROM regions that contain palettes we can modify.
 * All offsets are for unheadered ROMs; header offset is added at apply time.
 *
 * Only includes regions verified to contain valid BGR555 palette data.
 */

export interface PaletteRegion {
  id: string;
  name: string;
  description: string;
  offset: number;      // PC offset (unheadered)
  colorCount: number;   // number of BGR555 colors (not bytes)
  category: "samus" | "beams" | "environment" | "bosses";
}

// Samus palette blocks: each suit has 33 palettes x 16 colors = 528 colors
export const REGIONS: PaletteRegion[] = [
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
  // Additional Samus palettes after gravity suit (ship, crystal flash, hyper beam)
  // 27 rows × 16 colors = 432 (verified: row 27 at 0x0DA3C0 is game code, not palette)
  {
    id: "samus_extra",
    name: "Samus Extra",
    description: "Ship, crystal flash, hyper beam palettes",
    offset: 0x0da060,
    colorCount: 432,
    category: "samus",
  },
  // samus_intro (0x06DBB0) removed — vanilla SM has file-select palette here,
  // but ROM hacks (e.g. Containment Chamber) overwrite this area with game code.
  {
    id: "beam_standard",
    name: "Standard Beam",
    description: "Power beam projectile colors",
    offset: 0x0d7c00,
    colorCount: 16,
    category: "beams",
  },
  // Boss palettes — derived from species headers in bank $A0.
  // Each boss has exactly 1 palette row (16 colors).
  // Addresses verified against super_metroid_editor's readEnemyPalette().
  //
  // NOTE: Most bosses use multiple CGRAM palette rows at runtime. The species
  // header only points to row 0, so we only patch a subset of each boss's colors.
  // Some bosses (Phantoon body, Kraid body, Draygon body) use tileset palette
  // rows loaded separately — those are covered by the Environment tileset patching.
  //
  // Only Spore Spawn confirmed fully working. Others commented out pending
  // per-boss isolation testing (some caused crashes on Containment Chamber).
  {
    id: "boss_spore_spawn",
    name: "Spore Spawn",
    description: "Spore Spawn palette",
    offset: 0x12e359,
    colorCount: 16,
    category: "bosses",
  },
  // Uncomment after individual testing:
  // { id: "boss_ridley", name: "Ridley", description: "Ridley / Ceres Ridley palette", offset: 0x13614f, colorCount: 16, category: "bosses" },
  // { id: "boss_kraid", name: "Kraid", description: "Kraid palette", offset: 0x138687, colorCount: 16, category: "bosses" },
  // { id: "boss_phantoon", name: "Phantoon", description: "Phantoon palette", offset: 0x13ca01, colorCount: 16, category: "bosses" },
  // { id: "boss_draygon", name: "Draygon", description: "Draygon palette", offset: 0x12a1f7, colorCount: 16, category: "bosses" },
  // { id: "boss_crocomire", name: "Crocomire", description: "Crocomire palette", offset: 0x12387d, colorCount: 16, category: "bosses" },
  // { id: "boss_mother_brain", name: "Mother Brain", description: "Mother Brain P1 and P2 palette", offset: 0x149472, colorCount: 16, category: "bosses" },
  // { id: "boss_botwoon", name: "Botwoon", description: "Botwoon palette", offset: 0x199319, colorCount: 16, category: "bosses" },
  // { id: "boss_torizo", name: "Torizo", description: "Torizo / Golden Torizo palette", offset: 0x150687, colorCount: 16, category: "bosses" },
  // { id: "boss_big_metroid", name: "Big Metroid", description: "Baby Metroid (end-game) palette", offset: 0x14f8e6, colorCount: 16, category: "bosses" },
  // { id: "boss_mini_kraid", name: "Mini Kraid", description: "Mini Kraid palette", offset: 0x13198c, colorCount: 16, category: "bosses" },
];

export function getRegionsByCategory(category: PaletteRegion["category"] | "all"): PaletteRegion[] {
  if (category === "all") return REGIONS;
  return REGIONS.filter(r => r.category === category);
}

export const CATEGORIES = [
  { id: "all" as const, name: "Everything" },
  { id: "samus" as const, name: "Samus" },
  { id: "environment" as const, name: "Environment" },
  { id: "beams" as const, name: "Beams" },
  { id: "bosses" as const, name: "Bosses" },
] as const;
