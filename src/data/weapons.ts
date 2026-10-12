export type WeaponFamily = 'sword' | 'daggers' | 'hammer' | 'spear' | 'scythe' | 'axe' | 'bow' | 'wand' | 'chakram';
export const ALL_FAMILIES: WeaponFamily[] = ['sword', 'daggers', 'hammer', 'spear', 'scythe', 'axe', 'bow', 'wand', 'chakram'];

export type ProjKind = 'arrow' | 'bolt' | 'orb' | 'chakram' | 'wave' | 'shard' | 'seed' | 'firebolt' | 'mortar';

export interface ShotSpec {
  proj: ProjKind;
  speed: number;
  count: number;
  spread: number;
  pierce: number;
  returns: boolean;
  life: number;
  radius: number;
  homing: number;
  /** Seconds before the same projectile can hit the same foe again (0 = once). */
  rehit: number;
}

export interface AttackStep {
  windup: number;
  active: number;
  recovery: number;
  mul: number;
  reach: number;
  arc: number;
  lunge: number;
  poise: number;
  hitstop: number;
  shake: number;
  sweep: 1 | -1;
  shot?: ShotSpec;
  /** Heavy impact: shatters frozen foes and staggers. */
  heavy?: boolean;
}

export type SkillId = 'crescent' | 'lunge' | 'fracture' | 'rush' | 'reap' | 'leap' | 'volley' | 'burst' | 'recall';

export interface Variant {
  label: string;
  speed: number;
  reach: number;
  arc: number;
  dmg: number;
  poise: number;
  crit: number;
  desc: string;
  shot?: Partial<ShotSpec>;
}

export interface FamilyDef {
  id: WeaponFamily;
  label: string;
  heavy: boolean;
  ranged: boolean;
  baseDamage: [number, number];
  baseBuild: number;
  combo: AttackStep[];
  skill: { id: SkillId; name: string; cooldown: number; desc: string };
  innate: string;
  variants: Variant[];
  nouns: string[];
}

const deg = (d: number) => (d * Math.PI) / 180;
const step = (s: Partial<AttackStep> & Pick<AttackStep, 'windup' | 'active' | 'recovery' | 'mul' | 'reach' | 'arc'>): AttackStep => ({
  lunge: 5,
  poise: 12,
  hitstop: 0.03,
  shake: 0.6,
  sweep: 1,
  ...s,
});
const shot = (s: Partial<ShotSpec> & Pick<ShotSpec, 'proj' | 'speed'>): ShotSpec => ({
  count: 1,
  spread: 0,
  pierce: 0,
  returns: false,
  life: 0.9,
  radius: 3,
  homing: 0,
  rehit: 0,
  ...s,
});

const V = (label: string, speed: number, reach: number, arc: number, dmg: number, desc: string, extra: Partial<Variant> = {}): Variant => ({
  label,
  speed,
  reach,
  arc,
  dmg,
  poise: 1,
  crit: 0,
  desc,
  ...extra,
});

export const FAMILIES: Record<WeaponFamily, FamilyDef> = {
  sword: {
    id: 'sword',
    label: 'Sword',
    heavy: false,
    ranged: false,
    baseDamage: [11, 14],
    baseBuild: 15,
    combo: [
      step({ windup: 0.07, active: 0.08, recovery: 0.2, mul: 1, reach: 24, arc: deg(130), lunge: 6 }),
      step({ windup: 0.07, active: 0.08, recovery: 0.2, mul: 1, reach: 24, arc: deg(130), lunge: 6, sweep: -1 }),
      step({ windup: 0.12, active: 0.1, recovery: 0.32, mul: 1.5, reach: 27, arc: deg(170), lunge: 10, poise: 25, hitstop: 0.05, shake: 1.2 }),
    ],
    skill: { id: 'crescent', name: 'Travelling Crescent', cooldown: 4.5, desc: 'Launch a piercing crescent wave.' },
    innate: 'Balanced arcs and mobile combos.',
    variants: [
      V('Knight', 1, 1, 1, 1, 'Reliable arcs.'),
      V('Duelist', 1.22, 0.9, 0.8, 0.88, 'Quick, precise cuts.', { crit: 8 }),
      V('Broad', 0.85, 1.15, 1.25, 1.22, 'Wide, heavy sweeps.', { poise: 1.6 }),
    ],
    nouns: ['Blade', 'Sword', 'Brand', 'Sabre', 'Falchion', 'Edge', 'Longsword', 'Arming Sword'],
  },
  daggers: {
    id: 'daggers',
    label: 'Daggers',
    heavy: false,
    ranged: false,
    baseDamage: [6, 8],
    baseBuild: 8,
    combo: [
      step({ windup: 0.04, active: 0.05, recovery: 0.11, mul: 1, reach: 18, arc: deg(100), lunge: 4, poise: 5, hitstop: 0.015, shake: 0.3 }),
      step({ windup: 0.04, active: 0.05, recovery: 0.11, mul: 1, reach: 18, arc: deg(100), lunge: 4, poise: 5, hitstop: 0.015, shake: 0.3, sweep: -1 }),
      step({ windup: 0.04, active: 0.05, recovery: 0.11, mul: 1, reach: 18, arc: deg(100), lunge: 4, poise: 5, hitstop: 0.015, shake: 0.3 }),
      step({ windup: 0.06, active: 0.06, recovery: 0.2, mul: 1.6, reach: 20, arc: deg(140), lunge: 8, poise: 12, sweep: -1 }),
    ],
    skill: { id: 'lunge', name: 'Crossing Lunge', cooldown: 3.5, desc: 'Dash through foes, cutting twice.' },
    innate: 'Fast cuts build status quickly.',
    variants: [V('Twin', 1, 1, 1, 1, 'Paired blades.'), V('Assassin', 0.95, 1, 0.9, 1.05, 'Lethal criticals.', { crit: 14 }), V('Flurry', 1.28, 0.95, 1, 0.84, 'A storm of cuts.')],
    nouns: ['Knives', 'Twins', 'Fangs', 'Stilettos', 'Kris', 'Daggers', 'Dirks', 'Talons'],
  },
  hammer: {
    id: 'hammer',
    label: 'Hammer',
    heavy: true,
    ranged: false,
    baseDamage: [25, 31],
    baseBuild: 30,
    combo: [
      step({ windup: 0.34, active: 0.1, recovery: 0.4, mul: 1, reach: 30, arc: deg(170), lunge: 6, poise: 60, hitstop: 0.08, shake: 3, heavy: true }),
      step({ windup: 0.4, active: 0.12, recovery: 0.52, mul: 1.35, reach: 32, arc: deg(200), lunge: 10, poise: 90, hitstop: 0.1, shake: 4, sweep: -1, heavy: true }),
    ],
    skill: { id: 'fracture', name: 'Ground Fracture', cooldown: 6.5, desc: 'Slam the ground: a wide radial shockwave.' },
    innate: 'Every hit is heavy: shatters frozen foes.',
    variants: [V('Maul', 1, 1, 1, 1, 'Crushing blows.'), V('Bell', 0.85, 1.25, 1.15, 1.15, 'Enormous, ringing impacts.', { poise: 1.4 }), V('Pick', 1.2, 0.95, 0.75, 0.88, 'Faster, narrower strikes.', { crit: 6 })],
    nouns: ['Maul', 'Hammer', 'Bell', 'Mallet', 'Warhammer', 'Anvil', 'Gavel', 'Sledge'],
  },
  spear: {
    id: 'spear',
    label: 'Spear',
    heavy: false,
    ranged: false,
    baseDamage: [9, 12],
    baseBuild: 14,
    combo: [
      step({ windup: 0.1, active: 0.08, recovery: 0.22, mul: 1, reach: 38, arc: deg(28), lunge: 8 }),
      step({ windup: 0.1, active: 0.08, recovery: 0.22, mul: 1, reach: 38, arc: deg(28), lunge: 8 }),
      step({ windup: 0.14, active: 0.1, recovery: 0.34, mul: 1.4, reach: 33, arc: deg(170), lunge: 4, poise: 25, shake: 1.2 }),
    ],
    skill: { id: 'rush', name: 'Piercing Rush', cooldown: 5, desc: 'Charge forward, skewering everything in a line.' },
    innate: 'Long thrusts keep foes at bay.',
    variants: [V('Pike', 1, 1, 1, 1, 'Long, straight thrusts.'), V('Glaive', 0.95, 0.92, 1.8, 1.05, 'Bladed head: wider strikes.'), V('Partisan', 0.9, 1.12, 1, 1.12, 'Heavier, longer reach.', { poise: 1.3 })],
    nouns: ['Spear', 'Pike', 'Glaive', 'Lance', 'Partisan', 'Halberd', 'Trident', 'Ranseur'],
  },
  scythe: {
    id: 'scythe',
    label: 'Scythe',
    heavy: false,
    ranged: false,
    baseDamage: [12, 15],
    baseBuild: 16,
    combo: [
      step({ windup: 0.14, active: 0.1, recovery: 0.26, mul: 1, reach: 30, arc: deg(210), lunge: 4 }),
      step({ windup: 0.14, active: 0.1, recovery: 0.26, mul: 1, reach: 30, arc: deg(210), lunge: 4, sweep: -1 }),
      step({ windup: 0.18, active: 0.16, recovery: 0.34, mul: 1.6, reach: 32, arc: Math.PI * 2, lunge: 2, poise: 30, shake: 1.5, heavy: true }),
    ],
    skill: { id: 'reap', name: 'Reaping Orbit', cooldown: 6, desc: 'Spin three times, hooking every foe around you.' },
    innate: 'Broad sweeps; the spin finisher shatters.',
    variants: [V('Reaper', 1, 1, 1, 1, 'Sweeping crescents.'), V('Sickle', 1.25, 0.85, 0.9, 0.88, 'Quick hooked cuts.'), V('Harvester', 0.85, 1.2, 1.1, 1.12, 'Vast, slow harvests.')],
    nouns: ['Scythe', 'Reaper', 'Sickle', 'Harvester', 'Crook', 'Reaving Hook'],
  },
  axe: {
    id: 'axe',
    label: 'Axe',
    heavy: false,
    ranged: false,
    baseDamage: [12, 15],
    baseBuild: 18,
    combo: [
      step({ windup: 0.16, active: 0.08, recovery: 0.26, mul: 1.15, reach: 26, arc: deg(150), lunge: 6, poise: 25, hitstop: 0.04 }),
      step({ windup: 0.16, active: 0.08, recovery: 0.26, mul: 1.15, reach: 26, arc: deg(150), lunge: 6, poise: 25, hitstop: 0.04, sweep: -1 }),
      step({ windup: 0.28, active: 0.1, recovery: 0.42, mul: 2.1, reach: 28, arc: deg(90), lunge: 10, poise: 70, hitstop: 0.08, shake: 3, heavy: true }),
    ],
    skill: { id: 'leap', name: 'Splitting Leap', cooldown: 6, desc: 'Leap to your target and cleave the ground.' },
    innate: 'Brutal chops; the overhead finisher shatters.',
    variants: [V('Hatchet', 1.15, 0.92, 1, 0.9, 'Light and fast.'), V('Battleaxe', 1, 1, 1, 1, 'Wide crescent chops.'), V('Cleaver', 0.9, 1, 0.9, 1.12, 'Bites deep.', { crit: 7 })],
    nouns: ['Axe', 'Hatchet', 'Cleaver', 'Bearded Axe', 'Splitter', 'Woodsman', 'Labrys'],
  },
  bow: {
    id: 'bow',
    label: 'Bow',
    heavy: false,
    ranged: true,
    baseDamage: [11, 14],
    baseBuild: 15,
    combo: [step({ windup: 0.14, active: 0.02, recovery: 0.26, mul: 1, reach: 0, arc: 0, lunge: -3, poise: 10, shot: shot({ proj: 'arrow', speed: 280, life: 0.8 }) })],
    skill: { id: 'volley', name: 'Splitting Volley', cooldown: 5, desc: 'Loose a fan of seven arrows.' },
    innate: 'Directed shots from a safe distance; every third shot is a finisher.',
    variants: [
      V('Shortbow', 1, 1, 1, 1, 'Quick shots.'),
      V('Longbow', 0.72, 1, 1, 1.6, 'Powerful piercing shots.', { shot: { pierce: 2, speed: 360 } }),
      V('Repeater', 0.85, 1, 1, 0.5, 'Three arrows per shot.', { shot: { count: 3, spread: 0.2 } }),
    ],
    nouns: ['Bow', 'Longbow', 'Recurve', 'Shortbow', 'Greatbow', 'Warbow', 'Hornbow'],
  },
  wand: {
    id: 'wand',
    label: 'Wand',
    heavy: false,
    ranged: true,
    baseDamage: [9, 11],
    baseBuild: 22,
    combo: [step({ windup: 0.12, active: 0.02, recovery: 0.24, mul: 1, reach: 0, arc: 0, lunge: 0, poise: 6, shot: shot({ proj: 'bolt', speed: 190, life: 1, homing: 3 }) })],
    skill: { id: 'burst', name: 'Pattern Burst', cooldown: 5.5, desc: 'Release a ring of ten bolts.' },
    innate: 'Homing elemental bolts with strong buildup; every third is a finisher.',
    variants: [
      V('Bolt', 1, 1, 1, 1, 'Seeking bolts.'),
      V('Scatter', 0.95, 1, 1, 0.48, 'Three bolts at once.', { shot: { count: 3, spread: 0.35 } }),
      V('Orb', 0.7, 1, 1, 1.75, 'Slow, piercing orbs.', { shot: { proj: 'orb', speed: 110, pierce: 99, radius: 7, homing: 0, rehit: 0.3, life: 1.6 } }),
    ],
    nouns: ['Wand', 'Rod', 'Sceptre', 'Focus', 'Branch', 'Stave', 'Wandlet'],
  },
  chakram: {
    id: 'chakram',
    label: 'Returning Blade',
    heavy: false,
    ranged: true,
    baseDamage: [8, 10],
    baseBuild: 12,
    combo: [step({ windup: 0.12, active: 0.04, recovery: 0.34, mul: 1, reach: 0, arc: 0, lunge: 0, poise: 10, shot: shot({ proj: 'chakram', speed: 240, returns: true, pierce: 99, life: 0.45, radius: 5 }) })],
    skill: { id: 'recall', name: 'Curved Recall', cooldown: 5, desc: 'Throw three blades that curve out and return.' },
    innate: 'Hits on the way out and back; every third throw is a finisher.',
    variants: [
      V('Ring', 1, 1, 1, 1, 'A single returning blade.'),
      V('Twinmoon', 0.92, 1, 1, 0.62, 'Two blades at once.', { shot: { count: 2, spread: 0.32 } }),
      V('Saw', 0.85, 1, 1, 0.6, 'Lingers and grinds foes.', { shot: { speed: 170, life: 0.65, rehit: 0.15, radius: 7 } }),
    ],
    nouns: ['Chakram', 'Ring', 'Disc', 'Moon', 'Halo', 'Glaive-Ring', 'Wheel'],
  },
};

/** The concrete moveset for a weapon: family combo with its variant applied. */
export function comboFor(family: WeaponFamily, variant = 0): AttackStep[] {
  const fam = FAMILIES[family];
  const v = fam.variants[variant] ?? fam.variants[0];
  return fam.combo.map((s) => ({
    ...s,
    reach: s.reach * v.reach,
    arc: Math.min(Math.PI * 2, s.arc * v.arc),
    poise: s.poise * v.poise,
    mul: s.mul * v.dmg,
    shot: s.shot ? { ...s.shot, ...v.shot } : undefined,
  }));
}

export function variantOf(family: WeaponFamily, variant = 0): Variant {
  const f = FAMILIES[family];
  return f.variants[variant] ?? f.variants[0];
}
