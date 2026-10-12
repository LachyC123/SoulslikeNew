import { fbm, hash2, Rng, stream } from '../core/rng';
import { Decor, FloorPlan } from '../world/gen';
import { T, TILE } from '../world/tiles';
import { bayer, canvas, ctx2d, hex, mix, Painter, RGB } from './pixel';
import { propSprites } from './sprites';
import { RegionTheme } from './theme';

export interface TallProp {
  img: HTMLCanvasElement;
  /** Foot position (world px) used for y-sorting. */
  x: number;
  y: number;
  /** Draw offset from foot to image top-left. */
  ox: number;
  oy: number;
}

export interface Beam {
  x: number;
  y: number;
  w: number;
  len: number;
  phase: number;
}

export interface FloorVisuals {
  ground: HTMLCanvasElement;
  tall: TallProp[];
  torches: { x: number; y: number; phase: number }[];
  water: { x: number; y: number }[];
  beams: Beam[];
  stairs: HTMLCanvasElement;
}

const ramp = (cols: string[]) => cols.map(hex);

function pickRamp(r: RGB[], t: number): RGB {
  const i = Math.max(0, Math.min(r.length - 1, Math.floor(t * r.length)));
  return r[i];
}

export function buildFloorVisuals(plan: FloorPlan, theme: RegionTheme): FloorVisuals {
  const { map } = plan;
  const W = map.w * TILE;
  const H = map.h * TILE;
  const P = new Painter(W, H);
  const seed = (plan.seed ^ (plan.floor * 7919)) & 0xffff;

  const STONE = ramp(theme.stone);
  const MORTAR = hex(theme.mortar);
  const MOSS = ramp(theme.moss);
  const WATER = ramp(theme.water);
  const FACE = ramp(theme.face);
  const TOP = ramp(theme.topStone);
  const FOL = ramp(theme.foliage);
  const VOID = ramp(theme.void);
  const COPING = hex(theme.coping);

  const tile = (x: number, y: number) => map.get(x, y);
  const isWall = (x: number, y: number) => {
    const t = tile(x, y);
    return t === T.Wall || t === T.Void;
  };
  const isOpen = (x: number, y: number) => {
    const t = tile(x, y);
    return t === T.Floor || t === T.Water || t === T.Pillar;
  };

  // Tile-level proximity to walls (for moss density & wall-top darkening).
  const near = new Float32Array(map.w * map.h);
  const openDist = new Float32Array(map.w * map.h);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      let dW = 9;
      let dO = 9;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (tile(x + dx, y + dy) === T.Wall) dW = Math.min(dW, d);
          if (isOpen(x + dx, y + dy)) dO = Math.min(dO, d);
        }
      near[y * map.w + x] = Math.max(0, 1 - dW / 3);
      openDist[y * map.w + x] = dO;
    }
  const sampleNear = (px: number, py: number) => {
    const fx = px / TILE - 0.5;
    const fy = py / TILE - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const g = (x: number, y: number) => (map.inBounds(x, y) ? near[y * map.w + x] : 0);
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  };

  for (let py = 0; py < H; py++) {
    const ty = py >> 4;
    const ly = py & 15;
    for (let px = 0; px < W; px++) {
      const tx = px >> 4;
      const lx = px & 15;
      const t = tile(tx, ty);
      const grain = (hash2(px, py, seed) - 0.5) * 0.06;
      let c: RGB;

      if (t === T.Floor || t === T.Pillar) {
        // Paved slabs.
        const pat = Math.floor(hash2(tx, ty, seed + 1) * 4);
        let sw = 16;
        let sh = 16;
        let sid = 0;
        let sx = lx;
        let sy = ly;
        if (pat === 0) {
          sw = sh = 8;
          sid = (lx >> 3) + (ly >> 3) * 2;
          sx = lx & 7;
          sy = ly & 7;
        } else if (pat === 1) {
          sh = 8;
          sid = ly >> 3;
          sy = ly & 7;
        } else if (pat === 3) {
          sw = 8;
          sid = lx >> 3;
          sx = lx & 7;
        }
        const tone = (hash2(tx * 4 + sid, ty, seed + 2) - 0.5) * 0.18;
        let b = 0.56 + tone + grain;
        if (sy === 1 || sx === 1) b += 0.07;
        if (sy === sh - 1 || sx === sw - 1) b -= 0.07;
        const mortar = sx === 0 || sy === 0;
        const crackSeed = hash2(tx * 4 + sid, ty, seed + 3);
        const crack = crackSeed < 0.14 && Math.abs(sx - sy * (sw / sh) * 0.8 - crackSeed * 20) < 0.6 && sx > 1 && sy > 1;
        c = mortar || crack ? MORTAR : pickRamp(STONE, b);

        // Moss creeps into mortar first, then over slabs near walls.
        const n = sampleNear(px, py);
        const m = fbm(px / 46, py / 46, seed + 5) * 0.75 + n * 0.42 + fbm(px / 9, py / 9, seed + 6) * 0.18;
        const thr = theme.mossAmount;
        if ((mortar && m > thr - 0.12) || m > thr + bayer(px, py) * 0.1) {
          const mb = fbm(px / 5, py / 5, seed + 7) * 0.9 + (m - thr) * 0.8;
          c = pickRamp(MOSS, mb);
        }
        // Edge shading: walls to the west/north cast soft shade.
        if (isWall(tx - 1, ty) && lx < 4) c = mix(c, [20, 18, 14], ((4 - lx) / 4) * 0.28);
        if (isWall(tx + 1, ty) && lx > 12) c = mix(c, [20, 18, 14], ((lx - 12) / 4) * 0.14);
        if (isWall(tx, ty - 1) && ly < 3) c = mix(c, [20, 18, 14], ((3 - ly) / 3) * 0.22);
        // Coping stones around water.
        const wN = tile(tx, ty - 1) === T.Water && ly < 2;
        const wS = tile(tx, ty + 1) === T.Water && ly > 13;
        const wW = tile(tx - 1, ty) === T.Water && lx < 2;
        const wE = tile(tx + 1, ty) === T.Water && lx > 13;
        if (wN || wS || wW || wE) {
          c = (wS && ly === 15) || (wE && lx === 15) ? mix(COPING, [0, 0, 0], 0.35) : COPING;
          c = mix(c, [255, 255, 255], grain);
        }
      } else if (t === T.Water) {
        // Distance to shore in px (approx via neighbouring tiles).
        let d = 99;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            if (tile(tx + dx, ty + dy) === T.Water) continue;
            const rx0 = (tx + dx) * TILE;
            const ry0 = (ty + dy) * TILE;
            const ddx = Math.max(rx0 - px, 0, px - (rx0 + 15));
            const ddy = Math.max(ry0 - py, 0, py - (ry0 + 15));
            d = Math.min(d, Math.hypot(ddx, ddy));
          }
        const depth = Math.min(1, d / 22);
        const wob = fbm(px / 14, py / 7, seed + 8) * 0.25;
        c = pickRamp(WATER, 1 - depth * 0.85 - wob * 0.5 + 0.1);
        // Lip shadow from the coping to the north.
        if (tile(tx, ty - 1) !== T.Water && ly < 3) c = mix(c, [6, 30, 36], 0.35 * (1 - ly / 3));
        const ripple = Math.sin(px * 0.33 + py * 0.95 + fbm(px / 20, py / 20, seed + 9) * 9);
        if (ripple > 0.94 && depth > 0.2) c = mix(c, hex(theme.waterHi), 0.55);
        if (d < 1.5) c = mix(c, hex(theme.waterHi), 0.5);
      } else if (t === T.Wall && isOpen(tx, ty + 1)) {
        // Wall face: staggered bricks lit from above.
        const row = ly < 1 ? -1 : Math.floor((ly - 1) / 5);
        const ry = (ly - 1) % 5;
        const off = row % 2 === 0 ? 0 : 4;
        const bx = Math.floor((px + off) / 8);
        const bxl = (px + off) % 8;
        const tone = (hash2(bx, ty * 4 + row, seed + 10) - 0.5) * 0.16;
        let b = 0.72 - (ly / 16) * 0.32 + tone + grain;
        if (ry === 0) b += 0.06;
        if (ry === 4) b -= 0.08;
        c = row < 0 ? hex(theme.ledge) : ry === 4 || bxl === 0 ? MORTAR : pickRamp(FACE, b);
        if (ly >= 14) c = mix(c, [10, 10, 8], (ly - 13) * 0.22);
        // Moss drips and grass hanging from the wall top.
        const drip = hash2(px, ty, seed + 11);
        const dripLen = drip < 0.28 ? 1 + Math.floor(hash2(px, ty, seed + 12) * 9) : drip < 0.6 ? 1 + Math.floor(drip * 3) : 0;
        if (ly < dripLen) c = pickRamp(MOSS, 0.75 - ly / 14 + grain * 2);
        // Side edge where the face meets open space.
        if (!isWall(tx - 1, ty) && lx === 0) c = mix(c, [0, 0, 0], 0.3);
        if (!isWall(tx + 1, ty) && lx === 15) c = mix(c, [0, 0, 0], 0.4);
      } else if (t === T.Wall) {
        // Wall top: overgrown masonry. Rim facing open space is lit.
        const od = openDist[ty * map.w + tx];
        const f = fbm(px / 9, py / 9, seed + 13) + (hash2(px >> 1, py >> 1, seed + 14) - 0.5) * 0.25;
        const shade = Math.max(0, (od - 1) * 0.22);
        if (f > 0.47) {
          c = pickRamp(FOL, f * 1.1 - 0.15 - shade + grain);
          if (hash2(px, py, seed + 15) > 0.965) c = hex(theme.foliageHi);
        } else c = pickRamp(TOP, 0.55 + grain * 2 - shade + (hash2(px >> 2, py >> 2, seed + 16) - 0.5) * 0.25);
        // Lit rim along edges adjacent to open space.
        const rimS = isOpen(tx, ty + 1) || (!isWall(tx, ty + 1) && false);
        const faceBelow = tile(tx, ty + 1) === T.Wall && isOpen(tx, ty + 2);
        if (faceBelow && ly >= 14) c = ly === 14 ? hex(theme.ledge) : mix(hex(theme.ledge), [0, 0, 0], 0.25);
        if (rimS && ly >= 13) c = mix(hex(theme.ledge), [0, 0, 0], (ly - 13) * 0.2);
        if (isOpen(tx - 1, ty) && lx < 2) c = lx === 0 ? mix(hex(theme.ledge), [0, 0, 0], 0.3) : hex(theme.ledge);
        if (isOpen(tx + 1, ty) && lx > 13) c = lx === 15 ? mix(hex(theme.ledge), [0, 0, 0], 0.45) : hex(theme.ledge);
        if (isOpen(tx, ty - 1) && ly < 2) c = ly === 0 ? mix(hex(theme.ledge), [0, 0, 0], 0.2) : hex(theme.ledge);
      } else {
        // Void: deep canopy of leaves.
        const f = fbm(px / 7, py / 7, seed + 17);
        const leaf = hash2(px >> 1, py >> 1, seed + 18);
        const v = f * 0.9 + (leaf > 0.85 ? 0.15 : 0) - 0.1;
        c = pickRamp(VOID, v + (bayer(px, py) - 0.5) * 0.12);
      }
      P.set(px, py, c);
    }
  }

  const ground = P.toCanvas();
  const g = ctx2d(ground);
  const cos = stream(plan.seed, `vis:${plan.floor}`);
  const props = propSprites();
  const tall: TallProp[] = [];
  const torches: FloorVisuals['torches'] = [];

  // Mosaics first (they sit on the floor).
  for (const d of plan.decor) if (d.kind === 'mosaic') drawMosaic(g, d, theme);
  for (const d of plan.decor) {
    const x = d.x * TILE;
    const y = d.y * TILE;
    switch (d.kind) {
      case 'flower':
        drawFlowers(g, x, y, d.v, cos, theme);
        break;
      case 'grass':
        drawGrass(g, x, y, cos, theme);
        break;
      case 'rubble':
        drawRubble(g, x, y, cos, theme);
        break;
      case 'lily':
        drawLily(g, x, y, d.v, cos);
        break;
      case 'banner':
        drawBanner(g, x, y, d.v, theme);
        break;
      case 'vines':
        drawVines(g, x, y, d.v, cos, theme);
        break;
      case 'torch':
        drawSconce(g, x, y);
        torches.push({ x: x + 8, y: y + 6, phase: cos.next() * 10 });
        break;
      case 'urn':
        tall.push({ img: props.urn[d.v], x: x + 8, y: y + 13, ox: -6, oy: -13 });
        break;
      case 'statue':
        tall.push({ img: props.statue, x: x + 8, y: y + 14, ox: -9, oy: -29 });
        break;
      case 'fern':
        tall.push({ img: props.fern[d.v], x: x + 8, y: y + 14, ox: -8, oy: -13 });
        break;
      case 'flowerBig':
        tall.push({ img: props.flowerBig[d.v], x: x + 8, y: y + 13, ox: -7, oy: -12 });
        break;
    }
  }
  const water: FloorVisuals['water'] = [];
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      if (map.get(x, y) === T.Pillar) tall.push({ img: props.pillar, x: x * TILE + 8, y: y * TILE + 15, ox: -8, oy: -33 });
      if (map.get(x, y) === T.Water) water.push({ x, y });
    }

  // Sunbeams fall into larger rooms.
  const beams: Beam[] = [];
  if (theme.beams) {
    for (const r of plan.rooms) {
      if (r.w < 10 || cos.chance(0.35)) continue;
      const n = r.w > 14 ? 2 : 1;
      for (let i = 0; i < n; i++)
        beams.push({
          x: (r.x + 1 + cos.next() * (r.w - 4)) * TILE,
          y: (r.y - 1) * TILE,
          w: 14 + cos.next() * 18,
          len: (r.h + 1) * TILE * (0.7 + cos.next() * 0.4),
          phase: cos.next() * 10,
        });
    }
  }

  return { ground, tall, torches, water, beams, stairs: stairsSprite(theme) };
}

function drawMosaic(g: CanvasRenderingContext2D, d: Decor, theme: RegionTheme) {
  const cx = d.x * TILE + 8;
  const cy = d.y * TILE + 8;
  const P = new Painter(48, 48);
  const inlay = hex(theme.inlay);
  const inlayDark = mix(inlay, [0, 0, 0], 0.35);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const dx = x + 0.5 - 24;
      const dy = (y + 0.5 - 24) * 1.0;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (r > 22) continue;
      if (Math.abs(r - 21) < 0.8 || Math.abs(r - 16) < 0.6) P.set(x, y, inlayDark, 200);
      // four-petal leaf motif
      const petal = Math.abs(Math.cos(a * 2)) * 13;
      if (r < petal && r > 3 && Math.abs(r - petal) < 1.2) P.set(x, y, inlay, 200);
      if (r < 2.5) P.set(x, y, inlay, 220);
      if (r > 16.6 && r < 20.4 && Math.abs(Math.sin(a * 8)) > 0.92) P.set(x, y, inlay, 170);
    }
  g.drawImage(P.toCanvas(), cx - 24, cy - 24);
}

function drawFlowers(g: CanvasRenderingContext2D, x: number, y: number, v: number, rng: Rng, theme: RegionTheme) {
  const petals = theme.flowers[v % theme.flowers.length];
  const n = 1 + rng.int(0, 2);
  for (let i = 0; i < n; i++) {
    const fx = x + rng.int(2, 12);
    const fy = y + rng.int(3, 13);
    g.fillStyle = theme.moss[1];
    g.fillRect(fx - 1, fy + 1, 1, 1);
    g.fillRect(fx + 1, fy + 2, 1, 1);
    g.fillStyle = petals;
    g.fillRect(fx - 1, fy, 1, 1);
    g.fillRect(fx + 1, fy, 1, 1);
    g.fillRect(fx, fy - 1, 1, 1);
    g.fillRect(fx, fy + 1, 1, 1);
    g.fillStyle = '#ffd25a';
    g.fillRect(fx, fy, 1, 1);
  }
}

function drawGrass(g: CanvasRenderingContext2D, x: number, y: number, rng: Rng, theme: RegionTheme) {
  const blades = rng.int(3, 6);
  const bx = x + rng.int(2, 10);
  const by = y + rng.int(8, 14);
  for (let i = 0; i < blades; i++) {
    const h = rng.int(2, 5);
    g.fillStyle = theme.moss[1 + (i % 3)];
    g.fillRect(bx + i, by - h, 1, h);
  }
}

function drawRubble(g: CanvasRenderingContext2D, x: number, y: number, rng: Rng, theme: RegionTheme) {
  for (let i = 0; i < 3; i++) {
    const rx = x + rng.int(2, 12);
    const ry = y + rng.int(4, 13);
    g.fillStyle = theme.stone[1];
    g.fillRect(rx, ry, 2, 2);
    g.fillStyle = theme.stone[3];
    g.fillRect(rx, ry, 1, 1);
    g.fillStyle = theme.mortar;
    g.fillRect(rx, ry + 2, 2, 1);
  }
}

function drawLily(g: CanvasRenderingContext2D, x: number, y: number, v: number, rng: Rng) {
  const cx = x + rng.int(4, 11);
  const cy = y + rng.int(4, 11);
  const P = new Painter(9, 7);
  P.blob(4.5, 3.5, 4, 3, ['#2f6a2a', '#3f8a34', '#5aa83e', '#7cc456']);
  P.set(4, 1, '#1f4a1c');
  P.set(5, 2, '#1f4a1c');
  if (v === 1) {
    P.set(3, 3, '#ffd0e0');
    P.set(4, 3, '#ffeef4');
    P.set(3, 2, '#ffd0e0');
  }
  g.drawImage(P.toCanvas(), cx - 4, cy - 3);
}

function drawBanner(g: CanvasRenderingContext2D, x: number, y: number, v: number, theme: RegionTheme) {
  const P = new Painter(10, 16);
  const cloth = theme.banner[v % theme.banner.length];
  const c = hex(cloth);
  const dark = mix(c, [0, 0, 0], 0.4);
  P.rect(0, 0, 10, 1, '#5a4020');
  for (let yy = 1; yy < 15; yy++)
    for (let xx = 1; xx < 9; xx++) {
      if (yy > 12 && Math.abs(xx - 4.5) < yy - 12) continue;
      P.set(xx, yy, xx === 1 || xx === 8 ? dark : c);
    }
  // gold leaf emblem
  const gold = '#d8b45a';
  P.set(4, 4, gold);
  P.set(5, 4, gold);
  P.set(4, 5, gold);
  P.set(5, 5, gold);
  P.set(3, 6, gold);
  P.set(6, 6, gold);
  P.set(4, 7, gold);
  P.set(5, 7, gold);
  P.set(4, 8, gold);
  P.set(5, 9, gold);
  g.drawImage(P.toCanvas(), x + 3, y + 1);
}

function drawVines(g: CanvasRenderingContext2D, x: number, y: number, v: number, rng: Rng, theme: RegionTheme) {
  const strands = 1 + (v % 3);
  for (let s = 0; s < strands; s++) {
    const vx = x + rng.int(1, 14);
    const len = rng.int(6, 16);
    for (let i = 0; i < len; i++) {
      const ox = Math.round(Math.sin(i * 0.6 + s) * 0.8);
      g.fillStyle = theme.moss[i % 3 === 0 ? 2 : 1];
      g.fillRect(vx + ox, y + i, 1, 1);
      if (i % 3 === 1) {
        g.fillStyle = theme.moss[3];
        g.fillRect(vx + ox + (i % 2 ? 1 : -1), y + i, 1, 1);
      }
    }
    if (rng.chance(0.4)) {
      g.fillStyle = theme.flowers[0];
      g.fillRect(vx, y + len - 1, 1, 1);
    }
  }
}

function drawSconce(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = '#2a2420';
  g.fillRect(x + 6, y + 6, 4, 4);
  g.fillRect(x + 7, y + 10, 2, 2);
  g.fillStyle = '#5a4a3a';
  g.fillRect(x + 6, y + 6, 4, 1);
}

function stairsSprite(theme: RegionTheme): HTMLCanvasElement {
  const P = new Painter(32, 32);
  const stone = theme.stone;
  const frame = hex(stone[3]);
  const frameDark = hex(stone[1]);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const edge = x < 3 || x > 28 || y < 3;
      if (edge) {
        P.set(x, y, x === 0 || x === 31 || y === 0 ? frameDark : frame);
        continue;
      }
      // Steps descend toward the bottom; deeper is darker with warm glow far below.
      const step = Math.floor((y - 3) / 4);
      const sy = (y - 3) % 4;
      const depth = step / 7;
      let c: RGB = mix(hex(stone[2]), [12, 10, 8], depth * 0.9);
      if (sy === 0) c = mix(c, [255, 255, 255], 0.12 * (1 - depth));
      if (sy === 3) c = mix(c, [0, 0, 0], 0.3);
      if (step >= 5) c = mix(c, hex('#ffb85a'), (step - 4) * 0.12);
      P.set(x, y, c);
    }
  // carved rim leaves
  for (let i = 0; i < 6; i++) {
    P.set(4 + i * 5, 1, '#5f9a3a');
    P.set(5 + i * 5, 2, '#86c24a');
  }
  return P.toCanvas();
}

export function makeLowResCanvas(w: number, h: number): HTMLCanvasElement {
  return canvas(w, h);
}
