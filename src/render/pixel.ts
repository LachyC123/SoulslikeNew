/** Low-level helpers for building pixel-art sprites in code. */

export type RGB = [number, number, number];

export function hex(c: string): RGB {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgba(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d', { willReadFrequently: false })!;
  g.imageSmoothingEnabled = false;
  return g;
}

/** Build a sprite from rows of palette characters ('.' = transparent). */
export function fromMap(rows: string[], pal: Record<string, string>, name = 'sprite'): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = canvas(w, h);
  const g = ctx2d(c);
  const img = g.createImageData(w, h);
  rows.forEach((row, y) => {
    if (row.length !== w) console.warn(`${name}: row ${y} has length ${row.length}, expected ${w}`);
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) continue;
      const [r, gg, b] = hex(col);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  });
  g.putImageData(img, 0, 0);
  return c;
}

/** A tiny software painter on ImageData for procedural sprites. */
export class Painter {
  readonly data: Uint8ClampedArray;
  readonly img: ImageData;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.img = new ImageData(w, h);
    this.data = this.img.data;
  }

  set(x: number, y: number, c: RGB | string, a = 255): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const col = typeof c === 'string' ? hex(c) : c;
    const i = (y * this.w + x) * 4;
    if (a >= 255) {
      this.data[i] = col[0];
      this.data[i + 1] = col[1];
      this.data[i + 2] = col[2];
      this.data[i + 3] = 255;
    } else {
      const t = a / 255;
      const ea = this.data[i + 3] / 255;
      this.data[i] = this.data[i] * (1 - t) + col[0] * t;
      this.data[i + 1] = this.data[i + 1] * (1 - t) + col[1] * t;
      this.data[i + 2] = this.data[i + 2] * (1 - t) + col[2] * t;
      this.data[i + 3] = Math.round((ea + t * (1 - ea)) * 255);
    }
  }

  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  rect(x: number, y: number, w: number, h: number, c: RGB | string) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB | string) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /**
   * Shaded ellipse: lighting from the upper-left quantised to a ramp of colours.
   * `ramp` goes dark → light.
   */
  blob(cx: number, cy: number, rx: number, ry: number, ramp: string[], opts: { tex?: (x: number, y: number) => number; light?: [number, number] } = {}) {
    const [lx, ly] = opts.light ?? [-0.55, -0.75];
    const cols = ramp.map(hex);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        let l = -(nx * lx + ny * ly) * 0.6 + nz * 0.55;
        if (opts.tex) l += opts.tex(x, y);
        const idx = Math.max(0, Math.min(cols.length - 1, Math.floor(l * cols.length)));
        this.set(x, y, cols[idx]);
      }
  }

  /** Dark outline around opaque pixels (8-neighbourhood, transparent cells only). */
  outline(c: string, diagonal = false) {
    const col = hex(c);
    const mark: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) > 0) continue;
        const n =
          this.alpha(x - 1, y) > 128 ||
          this.alpha(x + 1, y) > 128 ||
          this.alpha(x, y - 1) > 128 ||
          this.alpha(x, y + 1) > 128 ||
          (diagonal && (this.alpha(x - 1, y - 1) > 128 || this.alpha(x + 1, y + 1) > 128 || this.alpha(x - 1, y + 1) > 128 || this.alpha(x + 1, y - 1) > 128));
        if (n) mark.push(x, y);
      }
    for (let i = 0; i < mark.length; i += 2) this.set(mark[i], mark[i + 1], col);
  }

  toCanvas(): HTMLCanvasElement {
    const c = canvas(this.w, this.h);
    ctx2d(c).putImageData(this.img, 0, 0);
    return c;
  }
}

export function flipX(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas(src.width, src.height);
  const g = ctx2d(c);
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

/** Solid-colour silhouette of a sprite (hit flashes, shadows, outlines). */
export function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = canvas(src.width, src.height);
  const g = ctx2d(c);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Simple 4x4 Bayer threshold for ordered dithering (0..1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
