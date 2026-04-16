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
  category: "samus" | "beams" | "environment";
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
] as const;
