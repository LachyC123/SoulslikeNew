export const TILE = 16;

export const enum T {
  Void = 0,
  Floor = 1,
  Wall = 2,
  Water = 3,
  Pillar = 4,
}

export type RoomRole = 'arrival' | 'combat' | 'discovery' | 'recovery' | 'guarded' | 'exit' | 'connector' | 'boss' | 'shop' | 'shrine';

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cell: [number, number];
  role: RoomRole;
  /** Distance (in room hops) from the arrival room. */
  depth: number;
  shape: 'plain' | 'pool' | 'pillars' | 'garden';
}

export class TileMap {
  readonly tiles: Uint8Array;
  /** Room index per tile (-1 corridor/none). */
  readonly roomOf: Int16Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.tiles = new Uint8Array(w * h);
    this.roomOf = new Int16Array(w * h).fill(-1);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): T {
    if (!this.inBounds(x, y)) return T.Void;
    return this.tiles[y * this.w + x] as T;
  }

  set(x: number, y: number, t: T): void {
    if (this.inBounds(x, y)) this.tiles[y * this.w + x] = t;
  }

  walkable(x: number, y: number): boolean {
    return this.get(x, y) === T.Floor;
  }

  /** True if the world-space point is inside a solid tile. */
  solidAt(px: number, py: number): boolean {
    return !this.walkable(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** Projectiles fly over water but not through walls/pillars. */
  blocksProjectile(px: number, py: number): boolean {
    const t = this.get(Math.floor(px / TILE), Math.floor(py / TILE));
    return t === T.Wall || t === T.Pillar || t === T.Void;
  }

  /** Grid line of sight using sampled steps (cheap and adequate at tile scale). */
  lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(d / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.blocksProjectile(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }
}
