import { Rng, stream } from '../core/rng';
import { ENEMIES } from '../data/enemies';
import { Room, RoomRole, T, TILE, TileMap } from './tiles';

/** Bump when generation output changes so saves can detect incompatible floors. */
export const GEN_VERSION = 2;

export type EnemyKind = 'root' | 'moth' | 'thornling' | 'sentinel' | 'bulb' | 'wisp' | 'beetle';

export interface EnemySpawn {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  room: number;
  elite: boolean;
}

export interface ChestSpawn {
  id: number;
  x: number;
  y: number;
  room: number;
  guarded: boolean;
}

export interface FeatureSpawn {
  id: number;
  kind: 'spring' | 'shrine' | 'merchant';
  x: number;
  y: number;
  room: number;
}

export type DecorKind =
  | 'flower'
  | 'flowerBig'
  | 'grass'
  | 'fern'
  | 'urn'
  | 'statue'
  | 'lily'
  | 'mosaic'
  | 'rubble'
  | 'banner'
  | 'torch'
  | 'vines'
  | 'arch';

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  v: number;
}

export interface FloorPlan {
  version: number;
  seed: number;
  floor: number;
  map: TileMap;
  rooms: Room[];
  edges: [number, number][];
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  chests: ChestSpawn[];
  enemies: EnemySpawn[];
  features: FeatureSpawn[];
  decor: Decor[];
  boss: { x: number; y: number; room: number } | null;
  attempts: number;
}

const COLS = 4;
const ROWS = 3;
const CELL_W = 20;
const CELL_H = 16;
const OX = 1;
const OY = 1;

export const isBossFloor = (floor: number) => floor % 3 === 0;

export function generateFloor(seed: number, floor: number): FloorPlan {
  for (let attempt = 0; attempt < 40; attempt++) {
    const plan = tryGenerate(seed, floor, attempt);
    if (plan && validateFloor(plan).ok) {
      plan.attempts = attempt + 1;
      return plan;
    }
  }
  throw new Error(`Failed to generate floor ${floor} for seed ${seed}`);
}

type Cell = [number, number];
const key = (c: Cell) => c[0] + c[1] * COLS;
const DIRS: Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function tryGenerate(seed: number, floor: number, attempt: number): FloorPlan | null {
  const layout = stream(seed, `layout:${floor}:${attempt}`);
  const enc = stream(seed, `encounters:${floor}:${attempt}`);
  const cos = stream(seed, `cosmetic:${floor}:${attempt}`);
  const boss = isBossFloor(floor);

  // 1-2. Route graph over a macro grid of cells.
  const pathLen = boss ? layout.int(3, 4) : layout.int(5, 6);
  const targetRooms = boss ? pathLen + layout.int(1, 2) : layout.int(8, 10);
  const used = new Map<number, Cell>();
  const path: Cell[] = [];

  const start: Cell = [layout.pick([0, COLS - 1]), layout.int(0, ROWS - 1)];
  if (!walk(start)) return null;

  function walk(c: Cell): boolean {
    path.push(c);
    used.set(key(c), c);
    if (path.length === pathLen) return true;
    const opts = layout.shuffle(DIRS.map((d) => [c[0] + d[0], c[1] + d[1]] as Cell)).filter(
      (n) => n[0] >= 0 && n[1] >= 0 && n[0] < COLS && n[1] < ROWS && !used.has(key(n)),
    );
    for (const n of opts) {
      // Boss arenas occupy two horizontal cells; the final cell needs a free neighbour.
      if (walk(n)) return true;
    }
    path.pop();
    used.delete(key(c));
    return false;
  }

  const edges = new Set<string>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (let i = 1; i < path.length; i++) edges.add(edgeKey(key(path[i - 1]), key(path[i])));

  // Boss floor: the final path cell expands into a wide arena using an adjacent cell.
  let arenaPartner: Cell | null = null;
  if (boss) {
    const last = path[path.length - 1];
    const candidates = ([[1, 0], [-1, 0]] as Cell[])
      .map((d) => [last[0] + d[0], last[1]] as Cell)
      .filter((n) => n[0] >= 0 && n[0] < COLS && !used.has(key(n)));
    if (candidates.length === 0) return null;
    arenaPartner = layout.pick(candidates);
    used.set(key(arenaPartner), arenaPartner);
  }

  // Branches hang off the critical path (never off the exit/boss cell).
  const branchCells: Cell[] = [];
  let guard = 0;
  while (used.size - (arenaPartner ? 1 : 0) < targetRooms && guard++ < 200) {
    const pool = [...path.slice(0, -1), ...branchCells];
    const from = layout.pick(pool);
    const d = layout.pick(DIRS);
    const n: Cell = [from[0] + d[0], from[1] + d[1]];
    if (n[0] < 0 || n[1] < 0 || n[0] >= COLS || n[1] >= ROWS || used.has(key(n))) continue;
    used.set(key(n), n);
    branchCells.push(n);
    edges.add(edgeKey(key(from), key(n)));
  }

  // One optional loop where space permits.
  const loopCandidates: [number, number][] = [];
  for (const c of [...path.slice(0, -1), ...branchCells]) {
    for (const d of DIRS) {
      const n: Cell = [c[0] + d[0], c[1] + d[1]];
      const nk = key(n);
      if (!used.has(nk)) continue;
      if (arenaPartner && (nk === key(arenaPartner) || nk === key(path[path.length - 1]))) continue;
      if (!edges.has(edgeKey(key(c), nk))) loopCandidates.push([key(c), nk]);
    }
  }
  if (loopCandidates.length && !boss) {
    const [a, b] = layout.pick(loopCandidates);
    edges.add(edgeKey(a, b));
  }

  // 3-4. Rooms and corridors.
  const map = new TileMap(COLS * CELL_W + OX * 2, ROWS * CELL_H + OY * 2 + 1);
  const rooms: Room[] = [];
  const roomByCell = new Map<number, Room>();
  const cellList: Cell[] = [...path, ...branchCells];
  const depthOf = new Map<number, number>();
  path.forEach((c, i) => depthOf.set(key(c), i));

  for (const c of cellList) {
    const isExit = c === path[path.length - 1];
    let cx = OX + c[0] * CELL_W;
    const cy = OY + c[1] * CELL_H;
    let w: number;
    let h: number;
    let x: number;
    let y: number;
    if (isExit && arenaPartner) {
      cx = OX + Math.min(c[0], arenaPartner[0]) * CELL_W;
      w = layout.int(26, 30);
      h = CELL_H - 4;
      x = cx + Math.floor((CELL_W * 2 - w) / 2);
      y = cy + 3;
    } else {
      const small = !isExit && c !== start && layout.chance(0.25);
      w = small ? layout.int(7, 9) : layout.int(10, CELL_W - 5);
      h = small ? layout.int(6, 7) : layout.int(8, CELL_H - 6);
      x = cx + layout.int(2, CELL_W - 2 - w);
      y = cy + layout.int(3, CELL_H - 2 - h);
    }
    const room: Room = {
      id: rooms.length,
      x,
      y,
      w,
      h,
      cell: c,
      role: 'combat',
      depth: depthOf.get(key(c)) ?? -1,
      shape: 'plain',
    };
    rooms.push(room);
    roomByCell.set(key(c), room);
    if (arenaPartner && isExit) roomByCell.set(key(arenaPartner), room);
    carveRect(map, x, y, w, h, T.Floor, room.id);
  }

  const roomEdges: [number, number][] = [];
  for (const e of edges) {
    const [ak, bk] = e.split('-').map(Number);
    const a = roomByCell.get(ak)!;
    const b = roomByCell.get(bk)!;
    if (a === b) continue;
    carveCorridor(map, a, b, ak % COLS === bk % COLS ? 'v' : 'h', layout);
    roomEdges.push([a.id, b.id]);
  }

  // Depth for branch rooms via BFS over room graph.
  const adj = rooms.map(() => [] as number[]);
  for (const [a, b] of roomEdges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const startRoom = roomByCell.get(key(start))!;
  const exitRoom = roomByCell.get(key(path[path.length - 1]))!;
  const bfsDepth = rooms.map(() => -1);
  bfsDepth[startRoom.id] = 0;
  const q = [startRoom.id];
  while (q.length) {
    const r = q.shift()!;
    for (const n of adj[r]) {
      if (bfsDepth[n] < 0) {
        bfsDepth[n] = bfsDepth[r] + 1;
        q.push(n);
      }
    }
  }
  rooms.forEach((r) => (r.depth = bfsDepth[r.id]));

  // 3. Purposes.
  startRoom.role = 'arrival';
  exitRoom.role = boss ? 'boss' : 'exit';
  const branchRooms = branchCells.map((c) => roomByCell.get(key(c))!);
  layout.shuffle(branchRooms);
  const branchRoles: RoomRole[] = [
    'discovery',
    'guarded',
    layout.chance(0.8) ? 'shop' : 'combat',
    layout.chance(0.65) ? 'shrine' : 'discovery',
    'recovery',
    'combat',
    'connector',
  ];
  branchRooms.forEach((r, i) => {
    r.role = branchRoles[i] ?? 'combat';
    if (r.w <= 9 && r.role === 'combat') r.role = 'connector';
    if ((r.role === 'shop' || r.role === 'shrine') && (r.w < 8 || r.h < 7)) r.role = 'discovery';
  });
  if (boss) {
    // A preparation space just before the arena: recovery is guaranteed.
    const prev = roomByCell.get(key(path[path.length - 2]))!;
    if (prev.role !== 'arrival') prev.role = 'recovery';
  }

  // Interior shapes.
  for (const r of rooms) {
    if (r.role === 'boss') {
      r.shape = 'pillars';
      const px = [r.x + 5, r.x + r.w - 6];
      const py = [r.y + 3, r.y + r.h - 3];
      for (const xx of px) for (const yy of py) map.set(xx, yy, T.Pillar);
      continue;
    }
    if (r.role === 'arrival') {
      r.shape = r.w >= 12 && r.h >= 9 ? 'pool' : 'garden';
    } else if (r.w >= 13 && r.h >= 10 && layout.chance(0.45)) r.shape = 'pool';
    else if (r.w >= 10 && r.h >= 8 && layout.chance(0.4)) r.shape = 'pillars';
    else r.shape = layout.chance(0.5) ? 'garden' : 'plain';

    if (r.shape === 'pool') {
      const pw = r.w - 6;
      const ph = r.h - 6;
      if (pw >= 3 && ph >= 2) {
        for (let yy = r.y + 3; yy < r.y + 3 + ph; yy++)
          for (let xx = r.x + 3; xx < r.x + 3 + pw; xx++) map.set(xx, yy, T.Water);
      } else r.shape = 'garden';
    } else if (r.shape === 'pillars') {
      for (const [xx, yy] of [
        [r.x + 2, r.y + 2],
        [r.x + r.w - 3, r.y + 2],
        [r.x + 2, r.y + r.h - 3],
        [r.x + r.w - 3, r.y + r.h - 3],
      ])
        map.set(xx, yy, T.Pillar);
    }
  }

  // 5. Walls around everything walkable; 2-tile tall above floors for wall faces.
  buildWalls(map);

  // Spawn and exit.
  const spawnTile = findOpenTile(map, startRoom, layout, true)!;
  const spawn = { x: (spawnTile[0] + 0.5) * TILE, y: (spawnTile[1] + 0.5) * TILE };
  let exitTile: [number, number];
  let bossPos: FloorPlan['boss'] = null;
  if (boss) {
    exitTile = [exitRoom.x + Math.floor(exitRoom.w / 2) - 1, exitRoom.y + 1];
    bossPos = {
      x: (exitRoom.x + exitRoom.w / 2) * TILE,
      y: (exitRoom.y + exitRoom.h / 2) * TILE,
      room: exitRoom.id,
    };
  } else {
    const t = findOpenTile(map, exitRoom, layout, true, 2);
    if (!t) return null;
    exitTile = [t[0] - 1, t[1] - 1];
  }
  // Stairs occupy a 2x2 tile footprint; keep it clear of pillars/water.
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) if (map.get(exitTile[0] + dx, exitTile[1] + dy) !== T.Floor) return null;

  // 6-7. Encounters, rewards and services.
  const occupied: [number, number][] = [spawnTile, exitTile, [exitTile[0] + 1, exitTile[1] + 1]];
  const chests: ChestSpawn[] = [];
  const enemies: EnemySpawn[] = [];
  const features: FeatureSpawn[] = [];
  let nextId = 1;

  const pool = enemyPool(floor);
  for (const r of rooms) {
    if (r.role === 'arrival' || r.role === 'boss' || r.role === 'recovery' || r.role === 'shop' || r.role === 'shrine') continue;
    let budget = 0;
    let elites = 0;
    if (r.role === 'combat') budget = 3.4 + floor * 1.3 + enc.range(0, 1.6);
    else if (r.role === 'exit') budget = 3 + floor * 1.1;
    else if (r.role === 'guarded') {
      budget = 4 + floor * 1.3;
      elites = floor >= 3 ? 2 : 1;
    } else if (r.role === 'connector') budget = enc.chance(0.75) ? 1.5 + floor * 0.4 : 0;
    else if (r.role === 'discovery') budget = enc.chance(0.55) ? 2 + floor * 0.4 : 0;
    // The first fight on the first floor is a little gentler.
    if (floor === 1 && r.depth === 1) budget = Math.min(budget, 2.2);
    budget = Math.min(budget, (r.w * r.h) / 15);
    if (r.role !== 'guarded' && floor >= 2 && enc.chance(0.15 * floor)) elites = 1;

    let guardLoop = 0;
    while (budget >= 0.99 && guardLoop++ < 20) {
      const affordable = pool.filter(([k]) => cost(k) <= budget + 0.01);
      if (!affordable.length) break;
      const kind = enc.weighted(affordable);
      const t = findOpenTile(map, r, enc, false, 1, occupied, 2);
      if (!t) break;
      occupied.push(t);
      const elite = elites > 0;
      if (elite) elites--;
      enemies.push({ id: nextId++, kind, x: (t[0] + 0.5) * TILE, y: (t[1] + 0.5) * TILE, room: r.id, elite });
      budget -= cost(kind) * (elite ? 1.5 : 1);
    }
  }

  const chestRooms = rooms.filter((r) => r.role === 'discovery' || r.role === 'guarded');
  if (chestRooms.length < 2) {
    const extra = rooms.filter((r) => r.role === 'combat' && !chestRooms.includes(r));
    layout.shuffle(extra);
    while (chestRooms.length < 2 && extra.length) chestRooms.push(extra.pop()!);
  }
  for (const r of chestRooms) {
    const t = findOpenTile(map, r, layout, true, 1, occupied, 2) ?? findOpenTile(map, r, layout, true, 0, occupied, 1);
    if (!t) continue;
    occupied.push(t);
    chests.push({ id: nextId++, x: (t[0] + 0.5) * TILE, y: (t[1] + 0.5) * TILE, room: r.id, guarded: r.role === 'guarded' });
  }
  for (const r of rooms.filter((r) => r.role === 'recovery' || r.role === 'shop' || r.role === 'shrine')) {
    const t = findOpenTile(map, r, layout, true, 1, occupied, 2);
    if (!t) continue;
    occupied.push(t);
    const kind = r.role === 'shop' ? 'merchant' : r.role === 'shrine' ? 'shrine' : 'spring';
    features.push({ id: nextId++, kind, x: (t[0] + 0.5) * TILE, y: (t[1] + 0.5) * TILE, room: r.id });
  }

  // 8. Cosmetic detail in permitted zones (separate stream: never shifts loot).
  const decor = decorate(map, rooms, cos, occupied);

  return {
    version: GEN_VERSION,
    seed,
    floor,
    map,
    rooms,
    edges: roomEdges,
    spawn,
    exit: { x: exitTile[0], y: exitTile[1] },
    chests,
    enemies,
    features,
    decor,
    boss: bossPos,
    attempts: attempt + 1,
  };
}

function cost(k: EnemyKind): number {
  return ENEMIES[k].cost;
}

function enemyPool(floor: number): [EnemyKind, number][] {
  if (floor <= 1)
    return [
      ['root', 3],
      ['moth', 1.6],
      ['thornling', 1.4],
      ['beetle', 0.6],
      ['bulb', 0.6],
    ];
  return [
    ['root', 2.4],
    ['moth', 2],
    ['thornling', 2],
    ['beetle', 1.4],
    ['bulb', 1.3],
    ['wisp', 1.2 + floor * 0.2],
    ['sentinel', 0.7 + floor * 0.3],
  ];
}

function carveRect(map: TileMap, x: number, y: number, w: number, h: number, t: T, room: number) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      map.set(xx, yy, t);
      if (map.inBounds(xx, yy)) map.roomOf[yy * map.w + xx] = room;
    }
}

function carveFloor(map: TileMap, x: number, y: number) {
  if (map.get(x, y) === T.Void) map.set(x, y, T.Floor);
}

function carveCorridor(map: TileMap, a: Room, b: Room, dir: 'h' | 'v', rng: Rng) {
  const carve = (x: number, y: number) => {
    for (let k = 0; k < 3; k++) carveFloor(map, dir === 'h' ? x : x + k, dir === 'h' ? y + k : y);
  };
  if (dir === 'h') {
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    const lo = Math.max(l.y + 1, r.y + 1);
    const hi = Math.min(l.y + l.h - 4, r.y + r.h - 4);
    if (hi >= lo) {
      const y0 = rng.int(lo, hi);
      for (let x = l.x + l.w; x < r.x; x++) carve(x, y0);
      return;
    }
    const y1 = rng.int(l.y + 1, l.y + l.h - 4);
    const y2 = rng.int(r.y + 1, r.y + r.h - 4);
    const mx = rng.int(l.x + l.w, Math.max(l.x + l.w, r.x - 3));
    for (let x = l.x + l.w; x <= mx + 2; x++) for (let k = 0; k < 3; k++) carveFloor(map, x, y1 + k);
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2) + 2; y++) for (let k = 0; k < 3; k++) carveFloor(map, mx + k, y);
    for (let x = mx; x < r.x; x++) for (let k = 0; k < 3; k++) carveFloor(map, x, y2 + k);
    return;
  }
  const [t, d] = a.y < b.y ? [a, b] : [b, a];
  const lo = Math.max(t.x + 1, d.x + 1);
  const hi = Math.min(t.x + t.w - 4, d.x + d.w - 4);
  if (hi >= lo) {
    const x0 = rng.int(lo, hi);
    for (let y = t.y + t.h; y < d.y; y++) carve(x0, y);
    return;
  }
  const x1 = rng.int(t.x + 1, t.x + t.w - 4);
  const x2 = rng.int(d.x + 1, d.x + d.w - 4);
  const my = rng.int(t.y + t.h, Math.max(t.y + t.h, d.y - 3));
  for (let y = t.y + t.h; y <= my + 2; y++) for (let k = 0; k < 3; k++) carveFloor(map, x1 + k, y);
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2) + 2; x++) for (let k = 0; k < 3; k++) carveFloor(map, x, my + k);
  for (let y = my; y < d.y; y++) for (let k = 0; k < 3; k++) carveFloor(map, x2 + k, y);
}

function buildWalls(map: TileMap) {
  const open = (t: T) => t === T.Floor || t === T.Water || t === T.Pillar;
  const toWall: number[] = [];
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      if (map.get(x, y) !== T.Void) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1; dx++) if (open(map.get(x + dx, y + dy))) near = true;
      if (!near && open(map.get(x, y + 2))) near = true;
      if (!near && (open(map.get(x - 1, y + 2)) || open(map.get(x + 1, y + 2)))) near = true;
      if (near) toWall.push(y * map.w + x);
    }
  for (const i of toWall) map.tiles[i] = T.Wall;
  // Map edges never stay walkable.
  for (let x = 0; x < map.w; x++) {
    if (map.get(x, 0) !== T.Void) map.set(x, 0, T.Wall);
    if (map.get(x, map.h - 1) !== T.Void) map.set(x, map.h - 1, T.Wall);
  }
}

function findOpenTile(
  map: TileMap,
  r: Room,
  rng: Rng,
  central: boolean,
  clearance = 1,
  avoid: [number, number][] = [],
  avoidDist = 1,
): [number, number] | null {
  const cands: [number, number, number][] = [];
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  for (let y = r.y + 1; y < r.y + r.h - 1; y++)
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      let ok = true;
      for (let dy = -clearance; dy <= clearance && ok; dy++)
        for (let dx = -clearance; dx <= clearance; dx++) if (map.get(x + dx, y + dy) !== T.Floor) ok = false;
      if (!ok) continue;
      if (avoid.some(([ax, ay]) => Math.abs(ax - x) <= avoidDist && Math.abs(ay - y) <= avoidDist)) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      cands.push([x, y, central ? d + rng.next() * 2 : rng.next()]);
    }
  if (!cands.length) return null;
  cands.sort((a, b) => a[2] - b[2]);
  return [cands[0][0], cands[0][1]];
}

function decorate(map: TileMap, rooms: Room[], rng: Rng, occupied: [number, number][]): Decor[] {
  const decor: Decor[] = [];
  const blocked = new Set(occupied.map(([x, y]) => `${x},${y}`));
  const isFloor = (x: number, y: number) => map.get(x, y) === T.Floor;
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = map.get(x, y);
      if (t === T.Wall && isFloor(x, y + 1) && map.get(x, y - 1) === T.Wall) {
        // Wall face: banners, torches and hanging vines.
        const roll = rng.next();
        if (roll < 0.06) decor.push({ kind: 'banner', x, y, v: rng.int(0, 2) });
        else if (roll < 0.13) decor.push({ kind: 'torch', x, y, v: 0 });
        else if (roll < 0.38) decor.push({ kind: 'vines', x, y, v: rng.int(0, 3) });
      }
      if (t === T.Water && rng.chance(0.18)) decor.push({ kind: 'lily', x, y, v: rng.int(0, 2) });
      if (t !== T.Floor || blocked.has(`${x},${y}`)) continue;
      const wallN = map.get(x, y - 1) === T.Wall;
      const wallAdj = wallN || map.get(x - 1, y) === T.Wall || map.get(x + 1, y) === T.Wall || map.get(x, y + 1) === T.Wall;
      const waterAdj =
        map.get(x - 1, y) === T.Water || map.get(x + 1, y) === T.Water || map.get(x, y - 1) === T.Water || map.get(x, y + 1) === T.Water;
      const roll = rng.next();
      if (wallAdj) {
        if (roll < 0.12) decor.push({ kind: 'flower', x, y, v: rng.int(0, 3) });
        else if (roll < 0.2) decor.push({ kind: 'grass', x, y, v: rng.int(0, 2) });
        else if (roll < 0.25) decor.push({ kind: 'fern', x, y, v: rng.int(0, 1) });
        else if (roll < 0.28) decor.push({ kind: 'urn', x, y, v: rng.int(0, 1) });
        else if (roll < 0.3) decor.push({ kind: 'flowerBig', x, y, v: rng.int(0, 1) });
      } else if (waterAdj) {
        if (roll < 0.15) decor.push({ kind: 'grass', x, y, v: rng.int(0, 2) });
        else if (roll < 0.22) decor.push({ kind: 'flower', x, y, v: rng.int(0, 3) });
      } else if (roll < 0.025) decor.push({ kind: 'grass', x, y, v: rng.int(0, 2) });
      else if (roll < 0.035) decor.push({ kind: 'rubble', x, y, v: rng.int(0, 2) });
      else if (roll < 0.045) decor.push({ kind: 'flower', x, y, v: rng.int(0, 3) });
    }
  for (const r of rooms) {
    if ((r.role === 'arrival' || r.role === 'combat') && r.shape !== 'pool' && r.w >= 10 && r.h >= 8 && rng.chance(0.6)) {
      decor.push({ kind: 'mosaic', x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2), v: 0 });
    }
    if (r.role === 'arrival' || r.role === 'recovery' || rng.chance(0.25)) {
      // A statue tucked into a top corner.
      const sx = rng.chance(0.5) ? r.x : r.x + r.w - 1;
      if (isFloor(sx, r.y) && !blocked.has(`${sx},${r.y}`)) decor.push({ kind: 'statue', x: sx, y: r.y, v: 0 });
    }
  }
  return decor;
}

export interface Validation {
  ok: boolean;
  reasons: string[];
}

/** Required checks from the plan: reachable exit, safe arrival, rewards not in collision, etc. */
export function validateFloor(plan: FloorPlan): Validation {
  const { map } = plan;
  const reasons: string[] = [];
  const sx = Math.floor(plan.spawn.x / TILE);
  const sy = Math.floor(plan.spawn.y / TILE);
  if (!map.walkable(sx, sy)) reasons.push('spawn not walkable');
  const seen = new Uint8Array(map.w * map.h);
  const q: number[] = [sy * map.w + sx];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % map.w;
    const y = (i / map.w) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!map.walkable(nx, ny)) continue;
      const ni = ny * map.w + nx;
      if (!seen[ni]) {
        seen[ni] = 1;
        q.push(ni);
      }
    }
  }
  const reach = (x: number, y: number) => map.inBounds(x, y) && seen[y * map.w + x] === 1;
  if (!reach(plan.exit.x, plan.exit.y)) reasons.push('exit unreachable');
  for (const c of plan.chests) if (!reach(Math.floor(c.x / TILE), Math.floor(c.y / TILE))) reasons.push(`chest ${c.id} unreachable`);
  for (const e of plan.enemies) if (!reach(Math.floor(e.x / TILE), Math.floor(e.y / TILE))) reasons.push(`enemy ${e.id} unreachable`);
  for (const f of plan.features) if (!reach(Math.floor(f.x / TILE), Math.floor(f.y / TILE))) reasons.push(`feature ${f.id} unreachable`);
  if (plan.boss && !reach(Math.floor(plan.boss.x / TILE), Math.floor(plan.boss.y / TILE))) reasons.push('boss unreachable');
  for (const r of plan.rooms) {
    const cx = r.x + Math.floor(r.w / 2);
    let any = false;
    for (let y = r.y; y < r.y + r.h && !any; y++) for (let x = r.x; x < r.x + r.w; x++) if (reach(x, y)) any = true;
    if (!any) reasons.push(`room ${r.id} (${cx}) unreachable`);
  }
  // Safe arrival: no enemies within 6 tiles of spawn.
  for (const e of plan.enemies) if (Math.hypot(e.x - plan.spawn.x, e.y - plan.spawn.y) < 6 * TILE) reasons.push('enemy near arrival');
  const roomCount = plan.rooms.length;
  if (!isBossFloor(plan.floor) && (roomCount < 7 || roomCount > 11)) reasons.push(`room count ${roomCount}`);
  if (!isBossFloor(plan.floor) && plan.chests.length < 2) reasons.push('too few rewards');
  return { ok: reasons.length === 0, reasons };
}
