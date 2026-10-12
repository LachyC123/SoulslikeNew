import type { Boon } from '../data/boons';
import type { Item, WeaponFamily } from '../data/items';
import type { FloorStateSave } from '../sim/world';
import type { StatusState } from '../sim/player';

export const SAVE_VERSION = 2;
const META_KEY = 'pixel-dungeon.meta.v1';
const RUN_KEY = 'pixel-dungeon.run.v1';

export interface Settings {
  reducedShake: boolean;
  reducedFlashes: boolean;
  lowEffects: boolean;
  leftHanded: boolean;
  showTouch: 'auto' | 'on' | 'off';
  volume: number;
}

export interface Meta {
  version: number;
  embers: number;
  bestFloor: number;
  runs: number;
  wins: number;
  upgrades: { vigor: number; flask: number };
  unlocked: WeaponFamily[];
  starter: WeaponFamily;
  tutorialDone: boolean;
  seenHints: string[];
  /** Recently seen item/boon signatures, to keep new finds fresh across runs. */
  seen: string[];
  settings: Settings;
}

export interface RunSave {
  version: number;
  genVersion: number;
  seed: number;
  floor: number;
  firstRun: boolean;
  startedAt: number;
  kills: number;
  playTime?: number;
  embersEarned: number;
  lootRng: [number, number, number, number];
  offered: string[];
  player: {
    x: number;
    y: number;
    hp: number;
    flasks: number;
    maxFlasks: number;
    gold: number;
    weaponIndex: 0 | 1;
    skillCd: [number, number];
    loadout: { weapons: [Item | null, Item | null]; chest: Item | null; boots: Item | null; rings: [Item | null, Item | null]; relic: Item | null };
    bag: (Item | null)[];
    boons: Boon[];
    relicCd: number;
    poison: StatusState;
  };
  mods: string;
  floorState: FloorStateSave | null;
}

export const defaultSettings = (): Settings => ({
  reducedShake: false,
  reducedFlashes: false,
  lowEffects: false,
  leftHanded: false,
  showTouch: 'auto',
  volume: 0.7,
});

export function defaultMeta(): Meta {
  return {
    version: SAVE_VERSION,
    embers: 0,
    bestFloor: 0,
    runs: 0,
    wins: 0,
    upgrades: { vigor: 0, flask: 0 },
    unlocked: ['sword'],
    starter: 'sword',
    tutorialDone: false,
    seenHints: [],
    seen: [],
    settings: defaultSettings(),
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadMeta(): Meta {
  const s = storage();
  const base = defaultMeta();
  if (!s) return base;
  try {
    const raw = s.getItem(META_KEY);
    if (!raw) return base;
    const m = JSON.parse(raw) as Partial<Meta>;
    // Merge so older saves gain new fields instead of breaking.
    return { ...base, ...m, upgrades: { ...base.upgrades, ...m.upgrades }, settings: { ...base.settings, ...m.settings } };
  } catch {
    return base;
  }
}

export function saveMeta(m: Meta): void {
  try {
    storage()?.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage full or blocked: keep playing */
  }
}

export function loadRun(genVersion: number): RunSave | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunSave;
    if (r.version !== SAVE_VERSION || r.genVersion !== genVersion) return null;
    if (!r.player || !r.player.loadout || !Array.isArray(r.player.bag)) return null;
    return r;
  } catch {
    return null;
  }
}

export function saveRun(r: RunSave): void {
  try {
    storage()?.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

export function clearRun(): void {
  try {
    storage()?.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function exportBackup(): string {
  const s = storage();
  const data = { meta: s?.getItem(META_KEY) ?? null, run: s?.getItem(RUN_KEY) ?? null };
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

export function importBackup(code: string): boolean {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(code.trim())))) as { meta: string | null; run: string | null };
    if (data.meta) JSON.parse(data.meta);
    const s = storage();
    if (!s) return false;
    if (data.meta) s.setItem(META_KEY, data.meta);
    if (data.run) s.setItem(RUN_KEY, data.run);
    else s.removeItem(RUN_KEY);
    return true;
  } catch {
    return false;
  }
}
