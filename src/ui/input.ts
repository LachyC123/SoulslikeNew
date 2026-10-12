import { emptyIntent, Intent } from '../sim/world';

type Action = 'attack' | 'dodge' | 'skill' | 'swap' | 'flask' | 'interact' | 'pause' | 'inventory' | 'map';

const KEYMAP: Record<string, Action> = {
  KeyJ: 'attack',
  Space: 'dodge',
  KeyK: 'dodge',
  ShiftLeft: 'dodge',
  KeyL: 'skill',
  KeyQ: 'swap',
  KeyF: 'flask',
  KeyR: 'flask',
  KeyE: 'interact',
  Enter: 'interact',
  Escape: 'pause',
  KeyP: 'pause',
  KeyI: 'inventory',
  Tab: 'inventory',
  KeyM: 'map',
};

/**
 * Collects keyboard, mouse and touch input into a per-frame Intent.
 * UI-level actions (pause, inventory, map) are delivered via `onAction`.
 */
export class Input {
  private keys = new Set<string>();
  private edges = new Set<Action>();
  private held = new Set<Action>();
  private mouse = { x: 0, y: 0, lastMove: -1e9, down: false, right: false };
  private mouseAttack = false;
  private mouseSkill = false;
  // touch
  joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  touchAim: { attack: number | null; skill: number | null } = { attack: null, skill: null };
  skillCancel = false;
  lastDevice: 'keyboard' | 'touch' = 'keyboard';
  onAction: (a: Action) => void = () => {};
  /** Converts CSS screen coords to world coords (set by game). */
  toWorld: (x: number, y: number) => { x: number; y: number } = (x, y) => ({ x, y });
  playerPos: () => { x: number; y: number } = () => ({ x: 0, y: 0 });
  enabled = true;

  constructor(private root: HTMLElement) {
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    const cv = root.querySelector('canvas')!;
    cv.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.lastMove = performance.now();
    });
    cv.addEventListener('mousedown', (e) => {
      this.lastDevice = 'keyboard';
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.lastMove = performance.now();
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouseAttack = true;
        this.press('attack');
      } else if (e.button === 2) {
        this.mouseSkill = true;
        this.press('skill');
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouse.down = false;
        this.held.delete('attack');
      }
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private key(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    const a = KEYMAP[e.code];
    if (a || e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    if (down) {
      this.lastDevice = 'keyboard';
      if (!this.keys.has(e.code) && a) {
        this.press(a);
        if (a === 'attack') this.mouseAttack = false;
      }
      this.keys.add(e.code);
    } else {
      this.keys.delete(e.code);
      if (a) this.held.delete(a);
    }
  }

  press(a: Action): void {
    if (a === 'pause' || a === 'inventory' || a === 'map') {
      this.onAction(a);
      return;
    }
    this.edges.add(a);
    this.held.add(a);
  }

  release(a: Action): void {
    this.held.delete(a);
  }

  releaseAll(): void {
    this.keys.clear();
    this.held.clear();
    this.edges.clear();
    this.joy.active = false;
    this.joy.id = -1;
    this.mouse.down = false;
    this.touchAim = { attack: null, skill: null };
  }

  /** Build the intent for this frame and clear one-shot edges. */
  poll(): Intent {
    const it = emptyIntent();
    if (!this.enabled) {
      this.edges.clear();
      return it;
    }
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (mx && my) {
      mx *= Math.SQRT1_2;
      my *= Math.SQRT1_2;
    }
    if (this.joy.active) {
      const dx = this.joy.x - this.joy.ox;
      const dy = this.joy.y - this.joy.oy;
      const r = 46;
      const l = Math.hypot(dx, dy);
      if (l > 6) {
        const m = Math.min(1, l / r);
        mx = (dx / l) * m;
        my = (dy / l) * m;
      }
    }
    it.mx = mx;
    it.my = my;
    it.attack = this.edges.has('attack');
    it.attackHeld = this.held.has('attack');
    it.dodge = this.edges.has('dodge');
    it.skill = this.edges.has('skill');
    it.swap = this.edges.has('swap');
    it.flask = this.edges.has('flask');
    it.interact = this.edges.has('interact');
    it.interactHeld = this.held.has('interact');
    // Aim: mouse when the attack came from the mouse; touch drag-aim; otherwise assisted.
    const pp = this.playerPos();
    if ((it.attack || it.attackHeld) && this.mouseAttack && this.mouse.down) {
      const w = this.toWorld(this.mouse.x, this.mouse.y);
      it.aim = Math.atan2(w.y - (pp.y - 6), w.x - pp.x);
    } else if (it.skill && this.mouseSkill) {
      const w = this.toWorld(this.mouse.x, this.mouse.y);
      it.aim = Math.atan2(w.y - (pp.y - 6), w.x - pp.x);
      this.mouseSkill = false;
    } else if (this.touchAim.attack !== null && (it.attack || it.attackHeld)) it.aim = this.touchAim.attack;
    else if (this.touchAim.skill !== null && it.skill) it.aim = this.touchAim.skill;
    this.edges.clear();
    if (it.skill) this.touchAim.skill = null;
    return it;
  }

  // ---------------------------------------------------------------------------
  // Touch controls

  bindTouch(els: {
    joyZone: HTMLElement;
    joyBase: HTMLElement;
    joyKnob: HTMLElement;
    attack: HTMLElement;
    dodge: HTMLElement;
    skill: HTMLElement;
    flask: HTMLElement;
    swap: HTMLElement;
    skillCancel: HTMLElement;
  }): void {
    const { joyZone, joyBase, joyKnob } = els;
    const setJoyVisual = () => {
      if (this.joy.active) {
        joyBase.style.transform = `translate(${this.joy.ox}px, ${this.joy.oy}px)`;
        const dx = this.joy.x - this.joy.ox;
        const dy = this.joy.y - this.joy.oy;
        const l = Math.hypot(dx, dy);
        const m = Math.min(46, l);
        const kx = l > 0 ? (dx / l) * m : 0;
        const ky = l > 0 ? (dy / l) * m : 0;
        joyKnob.style.transform = `translate(${this.joy.ox + kx}px, ${this.joy.oy + ky}px)`;
        joyBase.classList.add('on');
        joyKnob.classList.add('on');
      } else {
        joyBase.classList.remove('on');
        joyKnob.classList.remove('on');
        joyBase.style.transform = '';
        joyKnob.style.transform = '';
      }
    };
    joyZone.addEventListener('pointerdown', (e) => {
      if (this.joy.active) return;
      e.preventDefault();
      this.lastDevice = 'touch';
      joyZone.setPointerCapture(e.pointerId);
      const r = this.root.getBoundingClientRect();
      this.joy = { active: true, id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x: e.clientX - r.left, y: e.clientY - r.top };
      setJoyVisual();
    });
    joyZone.addEventListener('pointermove', (e) => {
      if (!this.joy.active || e.pointerId !== this.joy.id) return;
      const r = this.root.getBoundingClientRect();
      this.joy.x = e.clientX - r.left;
      this.joy.y = e.clientY - r.top;
      // Floating joystick: drag the base along if the thumb travels far.
      const dx = this.joy.x - this.joy.ox;
      const dy = this.joy.y - this.joy.oy;
      const l = Math.hypot(dx, dy);
      if (l > 70) {
        this.joy.ox += (dx / l) * (l - 70);
        this.joy.oy += (dy / l) * (l - 70);
      }
      setJoyVisual();
    });
    const endJoy = (e: PointerEvent) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.active = false;
      this.joy.id = -1;
      setJoyVisual();
    };
    joyZone.addEventListener('pointerup', endJoy);
    joyZone.addEventListener('pointercancel', endJoy);
    joyZone.addEventListener('lostpointercapture', endJoy);

    // Attack: tap = assisted strike, hold = repeat, drag = manual aim.
    this.dragButton(els.attack, {
      down: () => {
        this.touchAim.attack = null;
        this.press('attack');
      },
      move: (a) => (this.touchAim.attack = a),
      up: () => {
        this.release('attack');
        this.touchAim.attack = null;
      },
    });
    // Skill: drag-to-aim, release-to-cast, cancel zone.
    this.dragButton(els.skill, {
      down: () => {
        this.touchAim.skill = null;
        this.skillCancel = false;
        els.skillCancel.classList.add('on');
      },
      move: (a, d, ev) => {
        this.touchAim.skill = d > 14 ? a : null;
        const cr = els.skillCancel.getBoundingClientRect();
        this.skillCancel = ev.clientX >= cr.left && ev.clientX <= cr.right && ev.clientY >= cr.top && ev.clientY <= cr.bottom;
        els.skillCancel.classList.toggle('hot', this.skillCancel);
      },
      up: () => {
        els.skillCancel.classList.remove('on', 'hot');
        if (!this.skillCancel) {
          this.edges.add('skill');
        }
        this.skillCancel = false;
      },
    });
    for (const [el, a] of [
      [els.dodge, 'dodge'],
      [els.flask, 'flask'],
      [els.swap, 'swap'],
    ] as const) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.lastDevice = 'touch';
        this.press(a);
        el.classList.add('pressed');
      });
      const up = () => {
        this.release(a);
        el.classList.remove('pressed');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    }
  }

  private dragButton(el: HTMLElement, h: { down: () => void; move: (angle: number, dist: number, e: PointerEvent) => void; up: () => void }) {
    let id = -1;
    let sx = 0;
    let sy = 0;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (id !== -1) return;
      this.lastDevice = 'touch';
      id = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.classList.add('pressed');
      h.down();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      const d = Math.hypot(dx, dy);
      if (d > 14) h.move(Math.atan2(dy, dx), d, e);
      else h.move(0, d, e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      el.classList.remove('pressed');
      h.up();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }
}
