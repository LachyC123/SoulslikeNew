import { Sfx } from './audio/sfx';
import { Rng, stream } from './core/rng';
import { AffixId, hasAffix, Item, makeRing, makeWeapon, randomLoot, starterWeapon, WeaponFamily } from './data/items';
import { loadoutItems, synergiesFor } from './data/synergy';
import { Renderer } from './render/renderer';
import { playerLook } from './render/renderer';
import { VERDANT } from './render/theme';
import { clearRun, defaultSettings, loadMeta, loadRun, Meta, RunSave, saveMeta, saveRun, SAVE_VERSION } from './save/save';
import { createPlayer, newStatus, Player, refreshBuild } from './sim/player';
import { emptyIntent, FloorStateSave, FxSink, Pickup, World, WorldCallbacks } from './sim/world';
import { EquipmentUI } from './ui/equipment';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import {
  confirmScreen,
  helpScreen,
  mapScreen,
  pauseMenu,
  recapScreen,
  rewardScreen,
  settingsScreen,
  titleScreen,
  UPGRADES,
  upgradesScreen,
} from './ui/screens';
import { GEN_VERSION, generateFloor } from './world/gen';

type Mode = 'title' | 'playing' | 'paused' | 'menu' | 'dead' | 'transition';

const REGION_FLOORS = 3;

interface RunState {
  seed: number;
  floor: number;
  firstRun: boolean;
  startedAt: number;
  playTime: number;
  kills: number;
  goldTotal: number;
  embersEarned: number;
  lootRng: Rng;
  offered: string[];
  guaranteeWeapon: boolean;
  guaranteeRing: boolean;
  unlocks: string[];
}

const $ = (id: string) => document.getElementById(id)!;

export class Game {
  private renderer: Renderer;
  private input: Input;
  private hud: Hud;
  private sfx = new Sfx();
  private meta: Meta;
  private mode: Mode = 'title';
  private world: World | null = null;
  private player: Player | null = null;
  private run: RunState | null = null;
  private overlay = $('overlay');
  private hitstop = 0;
  private last = performance.now();
  private equipUI: EquipmentUI | null = null;
  private readyT = 0;
  private snapshotT = 0;
  private hintState = { moved: 0, attacked: false, dodged: false, sawWindup: false, sawEnemy: false };
  private titleWorld: World | null = null;
  private titleT = 0;
  private deathT = -1;
  private wasNearStairs = false;

  constructor() {
    this.meta = loadMeta();
    const screen = $('screen') as HTMLCanvasElement;
    this.renderer = new Renderer(screen, VERDANT, this.meta.settings);
    this.input = new Input($('game'));
    this.input.toWorld = (x, y) => this.renderer.toWorld(x, y);
    this.input.playerPos = () => (this.player ? { x: this.player.x, y: this.player.y } : { x: 0, y: 0 });
    this.input.onAction = (a) => this.onUiAction(a);
    this.input.bindTouch({
      joyZone: $('joy-zone'),
      joyBase: $('joy-base'),
      joyKnob: $('joy-knob'),
      attack: $('btn-attack'),
      dodge: $('btn-dodge'),
      skill: $('btn-skill'),
      flask: $('btn-flask'),
      swap: $('btn-swap'),
      skillCancel: $('skill-cancel'),
    });
    this.hud = new Hud(this.renderer, this.input);
    $('btn-pause').addEventListener('click', () => this.pause());
    $('btn-bag').addEventListener('click', () => this.openEquipment(null));
    $('minimap').addEventListener('click', () => this.openMap());
    $('btn-bag').innerHTML = bagIconSvg();

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.checkOrientation();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.onFocusLost();
      else this.sfx.resume();
    });
    window.addEventListener('blur', () => this.onFocusLost());
    window.addEventListener('pagehide', () => this.saveNow());
    const unlock = () => {
      this.sfx.unlock();
      this.sfx.setVolume(this.meta.settings.volume);
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('touchstart', () => this.setTouch(true), { passive: true, capture: true });
    this.applySettings();
    this.checkOrientation();
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------------------
  // Settings & device

  private touchDetected = matchMedia('(pointer: coarse)').matches;

  private setTouch(v: boolean) {
    if (this.touchDetected === v) return;
    this.touchDetected = v;
    this.applySettings();
  }

  private isTouch(): boolean {
    const s = this.meta.settings.showTouch;
    return s === 'on' || (s === 'auto' && this.touchDetected);
  }

  private applySettings() {
    const s = this.meta.settings;
    document.body.classList.toggle('touch', this.isTouch());
    document.body.classList.toggle('left-handed', s.leftHanded);
    this.renderer.settings = s;
    this.renderer.particles.lowEffects = s.lowEffects;
    this.sfx.setVolume(s.volume);
  }

  private checkOrientation() {
    const portrait = this.isTouch() && window.innerHeight > window.innerWidth;
    $('rotate').classList.toggle('hidden', !portrait);
    if (portrait && this.mode === 'playing') this.pause();
  }

  // ---------------------------------------------------------------------------
  // Main loop

  private frame(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    try {
      this.tick(dt);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private tick(dt: number) {
    if (this.mode === 'title') {
      this.renderTitle(dt);
      return;
    }
    const world = this.world;
    if (!world) return;
    if (this.mode === 'playing') {
      if (this.readyT > 0) {
        this.readyT -= dt;
        this.input.poll();
        if (this.readyT <= 0) document.querySelector('.ready')?.remove();
      } else if (this.hitstop > 0) {
        this.hitstop -= dt;
      } else {
        const intent = this.input.poll();
        world.update(dt, intent);
        this.run!.playTime += dt;
        const nearStairs = world.nearby?.kind === 'stairs';
        if (nearStairs && !this.wasNearStairs) this.stairsReminder();
        this.wasNearStairs = nearStairs;
        this.tutorial(dt, intent.mx !== 0 || intent.my !== 0, intent.attack, intent.dodge);
      }
      this.snapshotT += dt;
      if (this.snapshotT > 20) this.saveNow();
    } else if (this.mode === 'dead') {
      // Let the death settle before the recap.
      world.update(dt, emptyIntent());
      this.deathT += dt;
      if (this.deathT > 1.5 && !this.overlay.children.length) this.showRecap(false);
    }
    this.renderer.update(this.mode === 'playing' || this.mode === 'dead' ? dt : 0, world);
    this.renderer.render(world);
    this.hud.update(world, dt, this.meta.upgrades.vigor * 10);
  }

  // ---------------------------------------------------------------------------
  // Title

  private showTitle() {
    this.mode = 'title';
    this.world = null;
    this.player = null;
    this.clearOverlay();
    $('hud').classList.add('hidden');
    $('controls').classList.add('hidden');
    $('interact').classList.add('hidden');
    this.sfx.stopAmbience();
    this.renderer.hidePlayer = true;
    // A live, slowly panning floor behind the menu.
    if (!this.titleWorld) {
      const plan = generateFloor(20261012, 1);
      const p = createPlayer(plan.spawn.x, plan.spawn.y, starterWeapon(new Rng(1)));
      this.titleWorld = new World(plan, p, { ...nullFxLike() }, nullCallbacks(), 1);
      this.renderer.prepareFloor(this.titleWorld);
    } else this.renderer.prepareFloor(this.titleWorld);
    const hasRun = !!loadRun(GEN_VERSION);
    titleScreen(this.overlay, this.meta, hasRun, this.isTouch(), {
      cont: () => this.continueRun(),
      newRun: () => {
        if (hasRun) confirmScreen(this.overlay, 'Abandon run?', 'Starting a new run abandons the one in progress. Embers you earned are kept.', 'Start new', () => this.newRun(), () => this.showTitle());
        else this.newRun();
      },
      upgrades: () => this.showUpgradesFromTitle(),
      settings: () => this.showSettings(() => this.showTitle()),
      help: () => {
        this.clearOverlay();
        helpScreen(this.overlay, this.isTouch(), () => this.showTitle());
      },
    });
  }

  private showUpgradesFromTitle() {
    this.clearOverlay();
    upgradesScreen(
      this.overlay,
      this.meta,
      () => saveMeta(this.meta),
      () => this.showTitle(),
    );
  }

  private renderTitle(dt: number) {
    const w = this.titleWorld!;
    this.titleT += dt;
    const r = this.renderer;
    const mw = w.map.w * 16;
    const mh = w.map.h * 16;
    const px = mw / 2 + Math.cos(this.titleT * 0.05) * (mw * 0.3);
    const py = mh / 2 + Math.sin(this.titleT * 0.07) * (mh * 0.25);
    w.player.x = px;
    w.player.y = py;
    w.player.state = 'dead';
    w.player.stateT = 10;
    r.update(dt, w);
    r.render(w);
  }

  // ---------------------------------------------------------------------------
  // Runs & floors

  private newRun() {
    clearRun();
    const seed = (Math.random() * 2 ** 31) | 0;
    const firstRun = !this.meta.tutorialDone && this.meta.runs === 0;
    this.meta.runs++;
    saveMeta(this.meta);
    const lootRng = stream(seed, 'loot');
    const starter = starterWeapon(lootRng, this.meta.starter);
    const p = createPlayer(0, 0, starter, this.meta.upgrades.vigor * 10, this.meta.upgrades.flask);
    this.player = p;
    this.run = {
      seed,
      floor: 1,
      firstRun,
      startedAt: Date.now(),
      playTime: 0,
      kills: 0,
      goldTotal: 0,
      embersEarned: 0,
      lootRng,
      offered: [],
      guaranteeWeapon: false,
      guaranteeRing: false,
      unlocks: [],
    };
    this.hintState = { moved: 0, attacked: false, dodged: false, sawWindup: false, sawEnemy: false };
    this.startFloor(null, true);
  }

  private continueRun() {
    const save = loadRun(GEN_VERSION);
    if (!save) return this.showTitle();
    const p = createPlayer(0, 0, save.player.loadout.weapons[0] ?? starterWeapon(new Rng(1)), this.meta.upgrades.vigor * 10, this.meta.upgrades.flask);
    p.loadout = save.player.loadout;
    p.bag = save.player.bag;
    p.maxFlasks = save.player.maxFlasks;
    p.flasks = save.player.flasks;
    p.gold = save.player.gold;
    p.weaponIndex = save.player.weaponIndex;
    p.skillCd = save.player.skillCd;
    p.poison = save.player.poison ?? newStatus();
    refreshBuild(p, this.meta.upgrades.vigor * 10);
    p.hp = Math.min(save.player.hp, p.build.maxHp);
    this.player = p;
    const lootRng = new Rng(1);
    lootRng.setState(save.lootRng);
    this.run = {
      seed: save.seed,
      floor: save.floor,
      firstRun: save.firstRun,
      startedAt: save.startedAt,
      playTime: save.playTime ?? 0,
      kills: save.kills,
      goldTotal: p.gold,
      embersEarned: save.embersEarned,
      lootRng,
      offered: save.offered,
      guaranteeWeapon: save.offered.includes('!weapon'),
      guaranteeRing: save.offered.includes('!ring'),
      unlocks: [],
    };
    this.hintState = { moved: 99, attacked: true, dodged: true, sawWindup: true, sawEnemy: true };
    this.startFloor(save.floorState, false, { x: save.player.x, y: save.player.y });
  }

  private startFloor(saved: FloorStateSave | null, fadeIn: boolean, pos?: { x: number; y: number }) {
    const run = this.run!;
    const p = this.player!;
    const plan = generateFloor(run.seed, run.floor);
    p.state = 'free';
    p.vx = p.vy = 0;
    p.invuln = 0;
    p.hurtT = 0;
    this.world = new World(plan, p, this.fx(), this.callbacks(), (run.seed ^ (run.floor * 2654435761)) >>> 0, saved ?? undefined);
    if (pos && saved) {
      p.x = pos.x;
      p.y = pos.y;
      if (this.world.map.solidAt(p.x, p.y)) {
        p.x = plan.spawn.x;
        p.y = plan.spawn.y;
      }
    }
    this.renderer.hidePlayer = false;
    this.renderer.prepareFloor(this.world);
    this.clearOverlay();
    this.hud.clearToasts();
    $('hud').classList.remove('hidden');
    $('controls').classList.remove('hidden');
    this.hud.setBanner(`VERDANT RUINS · FLOOR ${run.floor}`);
    this.hud.setObjective(plan.boss ? 'Defeat the Thorn Warden' : 'Find the stairs');
    this.mode = 'playing';
    this.sfx.startAmbience();
    if (fadeIn) {
      const f = $('fade');
      f.textContent = run.floor === 1 ? 'VERDANT RUINS' : `FLOOR ${run.floor}`;
      f.classList.add('on');
      setTimeout(() => {
        f.classList.remove('on');
        setTimeout(() => (f.textContent = ''), 400);
      }, 650);
      this.readyT = 0.6;
    } else this.showReady();
    if (run.firstRun && run.floor === 1 && !saved) {
      this.hint('move', this.isTouch() ? 'Drag on the left side of the screen to move.' : 'Move with WASD or the arrow keys.');
    }
    if (plan.boss && !saved) this.hud.toast('The air grows heavy. A spring waits before the arena.', 'warn', 4);
    this.saveNow();
  }

  private showReady() {
    this.readyT = 1.0;
    const r = document.createElement('div');
    r.className = 'ready';
    r.textContent = 'READY';
    $('game').appendChild(r);
    setTimeout(() => r.remove(), 1000);
  }

  private descend() {
    const run = this.run!;
    const p = this.player!;
    const world = this.world!;
    if (run.floor >= REGION_FLOORS) {
      this.showRecap(true);
      return;
    }
    // Recovery between floors: one flask, plus warding.
    p.flasks = Math.min(p.maxFlasks, p.flasks + 1 + p.build.warding);
    run.floor++;
    this.award(2);
    this.recordBest(run.floor);
    if (run.floor === 2 && !this.meta.unlocked.includes('daggers')) {
      this.meta.unlocked.push('daggers');
      run.unlocks.push('New starting weapon unlocked: Daggers');
      this.hud.toast('Unlocked: Daggers as a starting weapon', 'synergy');
    }
    saveMeta(this.meta);
    this.mode = 'transition';
    void world;
    const f = $('fade');
    f.textContent = `FLOOR ${run.floor}`;
    f.classList.add('on');
    setTimeout(() => this.startFloor(null, true), 450);
  }

  private recordBest(floor: number) {
    if (floor > this.meta.bestFloor) this.meta.bestFloor = floor;
  }

  private award(n: number) {
    this.meta.embers += n;
    this.run!.embersEarned += n;
    saveMeta(this.meta);
  }

  // ---------------------------------------------------------------------------
  // Saving

  private saveNow() {
    this.snapshotT = 0;
    const run = this.run;
    const p = this.player;
    const w = this.world;
    if (!run || !p || !w || p.state === 'dead' || this.mode === 'dead') return;
    const offered = [...run.offered.filter((o) => !o.startsWith('!'))];
    if (run.guaranteeWeapon) offered.push('!weapon');
    if (run.guaranteeRing) offered.push('!ring');
    const save: RunSave = {
      version: SAVE_VERSION,
      genVersion: GEN_VERSION,
      seed: run.seed,
      floor: run.floor,
      firstRun: run.firstRun,
      startedAt: run.startedAt,
      kills: run.kills,
      playTime: run.playTime,
      embersEarned: run.embersEarned,
      lootRng: run.lootRng.getState(),
      offered,
      player: {
        x: p.x,
        y: p.y,
        hp: p.hp,
        flasks: p.flasks,
        maxFlasks: p.maxFlasks,
        gold: p.gold,
        weaponIndex: p.weaponIndex,
        skillCd: p.skillCd,
        loadout: p.loadout,
        bag: p.bag,
        poison: p.poison,
      },
      floorState: w.saveState(),
    };
    saveRun(save);
  }

  // ---------------------------------------------------------------------------
  // Simulation wiring

  private fx(): FxSink {
    return {
      number: (x, y, t, k) => this.renderer.particles.number(x, y, t, k),
      burst: (k, x, y, a, s) => this.renderer.particles.burst(k, x, y, a, s),
      sound: (id, v) => {
        if (id === 'hurt') this.renderer.hurtFlash = 1;
        if (id === 'enemyWarn' && !this.hintState.sawWindup && this.run?.firstRun) {
          this.hintState.sawWindup = true;
          this.hint('dodge', this.isTouch() ? 'Amber marks warn of attacks — tap ➶ to dodge through them.' : 'Amber marks warn of attacks — press Space to dodge through them.');
        }
        this.sfx.play(id, v);
      },
      shake: (a) => this.renderer.shake(a),
      hitstop: (t) => (this.hitstop = Math.max(this.hitstop, Math.min(0.12, t))),
      toast: (m, k) => this.hud.toast(m, k),
    };
  }

  private callbacks(): WorldCallbacks {
    return {
      inspect: (p) => this.openEquipment(p),
      descend: () => this.descend(),
      rollChestLoot: (c) => {
        const item = this.rollLoot(c.guarded);
        // Opening changes floor state: commit immediately so a reload can't duplicate it.
        setTimeout(() => this.saveNow(), 0);
        return item;
      },
      bossDefeated: () => this.onBossDefeated(),
      playerDied: () => this.onDeath(),
      milestone: (kind, n) => {
        if (kind === 'kill') {
          this.run!.kills += n;
          if (this.run!.kills % 5 === 0) this.award(1);
          if (!this.hintState.attacked) this.hintState.attacked = true;
        } else this.award(12);
      },
    };
  }

  private rollLoot(guarded: boolean): Item {
    const run = this.run!;
    const p = this.player!;
    const rng = run.lootRng;
    const level = run.floor;
    let item: Item;
    const starterFam = p.loadout.weapons[0]?.family;
    if (!run.guaranteeWeapon) {
      // Bounded randomness: an early alternative weapon family.
      run.guaranteeWeapon = true;
      const fam: WeaponFamily = run.firstRun ? 'hammer' : rng.pick((['sword', 'daggers', 'hammer'] as WeaponFamily[]).filter((f) => f !== starterFam));
      item = makeWeapon(rng, level, run.firstRun ? { family: fam, element: 'frost', rarity: 'uncommon', name: 'Winterbell' } : { family: fam, rarity: rng.pick(['uncommon', 'rare'] as const) });
    } else if (!run.guaranteeRing) {
      // …and a meaningful build modifier that connects to something you own.
      run.guaranteeRing = true;
      const owned = [...loadoutItems(p.loadout), ...p.bag.filter((i): i is Item => !!i)];
      let sig: AffixId = 'shadowEcho';
      if (owned.some((i) => i.family === 'hammer' || hasAffix(i, 'shatterer'))) sig = 'frostNova';
      else if (owned.some((i) => i.element === 'poison')) sig = 'sporeBloom';
      else if (owned.some((i) => i.element === 'frost')) sig = 'rimeHeart';
      item = makeRing(rng, level, sig, 'rare');
    } else {
      item = randomLoot(rng, level, guarded ? 1 : 0);
      // Reduce repetition: reroll once if this signature/name was already offered.
      const sigKey = item.slot === 'ring' ? `ring:${item.affixes[0]?.id}` : `${item.slot}:${item.family ?? ''}:${item.element}`;
      if (run.offered.includes(sigKey)) item = randomLoot(rng, level, guarded ? 1 : 0);
    }
    const k = item.slot === 'ring' ? `ring:${item.affixes[0]?.id}` : `${item.slot}:${item.family ?? ''}:${item.element}`;
    run.offered.push(k);
    if (run.offered.length > 30) run.offered.shift();
    return item;
  }

  private onBossDefeated() {
    const run = this.run!;
    const p = this.player!;
    p.hp = Math.min(p.build.maxHp, p.hp + Math.round(p.build.maxHp * 0.3));
    if (!this.meta.unlocked.includes('hammer')) {
      this.meta.unlocked.push('hammer');
      run.unlocks.push('New starting weapon unlocked: Hammer');
    }
    this.meta.wins++;
    saveMeta(this.meta);
    this.hud.setObjective('The stairs are open');
    setTimeout(() => {
      if (this.mode !== 'playing') return;
      const rng = run.lootRng;
      const items = [makeWeapon(rng, run.floor + 1, { rarity: rng.pick(['rare', 'epic'] as const) }), makeRing(rng, run.floor + 1, undefined, 'epic'), randomLoot(rng, run.floor + 1, 2)];
      this.mode = 'menu';
      this.clearOverlay();
      rewardScreen(
        this.overlay,
        items,
        (it) => synergiesFor(it, loadoutItems(p.loadout)),
        (it) => {
          const free = p.bag.indexOf(null);
          if (free >= 0) p.bag[free] = it;
          else this.world!.dropItem(it, p.x, p.y + 8);
          this.sfx.play('pickup');
          this.clearOverlay();
          this.mode = 'playing';
          this.hud.toast(`${it.name} added to your backpack. Open equipment to equip it.`, 'info', 4);
          this.saveNow();
        },
      );
    }, 1600);
  }

  private onDeath() {
    this.hud.clearToasts();
    this.mode = 'dead';
    this.deathT = 0;
    this.recordBest(this.run!.floor);
    saveMeta(this.meta);
    clearRun();
    this.sfx.stopAmbience();
  }

  private showRecap(victory: boolean) {
    const run = this.run!;
    const p = this.player!;
    if (victory) {
      this.recordBest(REGION_FLOORS);
      clearRun();
      this.meta.tutorialDone = true;
      saveMeta(this.meta);
    }
    if (run.firstRun) {
      this.meta.tutorialDone = true;
      saveMeta(this.meta);
    }
    this.mode = victory ? 'menu' : 'dead';
    this.clearOverlay();
    $('controls').classList.add('hidden');
    $('interact').classList.add('hidden');
    recapScreen(
      this.overlay,
      {
        victory,
        floor: run.floor,
        cause: p.causeOfDeath,
        kills: run.kills,
        gold: p.gold,
        embers: run.embersEarned,
        items: loadoutItems(p.loadout),
        unlocks: run.unlocks,
        time: run.playTime,
      },
      { again: () => this.newRun(), title: () => this.showTitle() },
    );
  }

  // ---------------------------------------------------------------------------
  // Menus

  private onUiAction(a: 'pause' | 'inventory' | 'map' | string) {
    if (a === 'pause') {
      if (this.mode === 'playing') this.pause();
      else if (this.mode === 'paused' || this.mode === 'menu') this.closeMenus();
    } else if (a === 'inventory') {
      if (this.mode === 'playing') this.openEquipment(null);
      else if (this.equipUI) this.closeMenus();
    } else if (a === 'map') {
      if (this.mode === 'playing') this.openMap();
      else if (this.mode === 'menu') this.closeMenus();
    }
  }

  private onFocusLost() {
    // Losing focus pauses solo play immediately and releases held inputs.
    this.input.releaseAll();
    this.sfx.suspend();
    if (this.mode === 'playing') this.pause();
    this.saveNow();
  }

  private pause() {
    if (this.mode !== 'playing' || !this.world) return;
    this.mode = 'paused';
    this.input.releaseAll();
    this.saveNow();
    this.clearOverlay();
    pauseMenu(this.overlay, {
      resume: () => this.closeMenus(),
      equipment: () => this.openEquipment(null),
      map: () => this.openMap(),
      settings: () => this.showSettings(() => this.pauseAgain()),
      abandon: () =>
        confirmScreen(this.overlay, 'Abandon run?', 'Your run gear will be lost. Embers already earned are kept.', 'Abandon', () => {
          clearRun();
          this.showTitle();
        }, () => this.pauseAgain()),
      quit: () => {
        this.saveNow();
        this.showTitle();
      },
    });
  }

  private pauseAgain() {
    this.mode = 'playing';
    this.pause();
  }

  private closeMenus() {
    if (!this.world || this.player?.state === 'dead') return;
    const wasPaused = this.mode === 'paused' || this.mode === 'menu';
    this.clearOverlay();
    this.mode = 'playing';
    if (wasPaused) {
      this.readyT = 0.35;
      this.sfx.resume();
    }
  }

  private clearOverlay() {
    this.equipUI?.destroy();
    this.equipUI = null;
    this.overlay.innerHTML = '';
  }

  private openEquipment(pickup: Pickup | null) {
    if (!this.world || !this.player) return;
    if (this.mode !== 'playing' && this.mode !== 'paused') return;
    this.clearOverlay();
    this.mode = 'menu';
    this.input.releaseAll();
    this.sfx.play('ui');
    const p = this.player;
    this.equipUI = new EquipmentUI(this.overlay, p, pickup?.item ?? null, {
      changed: (msg, kind) => {
        refreshBuild(p, this.meta.upgrades.vigor * 10);
        if (msg) this.hud.toast(msg, kind ?? 'info', kind === 'synergy' ? 4.5 : 2.8);
        this.sfx.play(kind === 'synergy' ? 'heal' : 'pickup');
        this.saveNow();
      },
      takeFound: () => {
        if (pickup) this.world!.removePickup(pickup);
      },
      drop: (item) => this.world!.dropItem(item, p.x, p.y + 6),
      close: () => this.closeMenus(),
      sound: () => this.sfx.play('ui'),
      look: () => playerLook(this.world!),
    });
  }

  private openMap() {
    if (!this.world || (this.mode !== 'playing' && this.mode !== 'paused')) return;
    this.clearOverlay();
    this.mode = 'menu';
    this.input.releaseAll();
    mapScreen(this.overlay, (cv) => this.hud.drawMap(this.world!, cv, 4, false), () => this.closeMenus());
  }

  private showSettings(back: () => void) {
    this.clearOverlay();
    settingsScreen(
      this.overlay,
      this.meta.settings ?? defaultSettings(),
      (s) => {
        this.meta.settings = s;
        saveMeta(this.meta);
        this.applySettings();
      },
      () => {
        this.clearOverlay();
        back();
      },
    );
  }

  // ---------------------------------------------------------------------------
  // First-run guidance: appears when relevant, disappears after success, never repeats.

  private hint(id: string, text: string) {
    if (this.meta.seenHints.includes(id)) return;
    this.meta.seenHints.push(id);
    saveMeta(this.meta);
    this.hud.toast(text, 'hint', 7, id);
  }

  private tutorial(dt: number, moving: boolean, attacked: boolean, dodged: boolean) {
    const run = this.run;
    const w = this.world;
    if (!run?.firstRun || !w) return;
    if (moving) this.hintState.moved += dt;
    if (this.hintState.moved > 1.2) this.hud.dismiss('move');
    if (!this.hintState.sawEnemy) {
      const near = w.enemies.find((e) => e.aggro && e.state !== 'dead');
      if (near) {
        this.hintState.sawEnemy = true;
        this.hint('attack', this.isTouch() ? 'Tap ⚔ to strike. Hold it to keep attacking.' : 'Attack with J or left-click. Hold to keep attacking.');
      }
    }
    if (attacked) {
      this.hintState.attacked = true;
      this.hud.dismiss('attack');
    }
    if (dodged) {
      this.hintState.dodged = true;
      this.hud.dismiss('dodge');
    }
    if (this.player!.state === 'flask') this.hud.dismiss('flask');
    if (w.chests.some((c) => c.opened)) this.hud.dismiss('chest');
    if (w.nearby?.kind === 'stairs')
      this.hint('stairs', this.isTouch() ? 'Hold the prompt to descend. You never need to clear the whole floor.' : 'Hold E to descend. You never need to clear the whole floor.');
    if (w.nearby?.kind === 'chest') this.hint('chest', this.isTouch() ? 'Tap the prompt to open the chest.' : 'Press E to open the chest.');
    const p = this.player!;
    if (p.loadout.weapons[1]) this.hint('swap', this.isTouch() ? 'Tap ⇄ to swap weapons. Each keeps its own skill cooldown.' : 'Press Q to swap weapons; L or right-click uses the weapon skill.');
    if (p.state !== 'dead' && p.hp > 0 && p.hp < p.build.maxHp * 0.5 && p.flasks > 0) this.hint('flask', this.isTouch() ? 'Low health — tap the red flask to heal.' : 'Low health — press F to drink a flask.');
  }

  /** Called when the player approaches the stairs: remind them of what they'd leave behind. */
  stairsReminder(): void {
    const w = this.world;
    if (!w) return;
    const chests = w.chests.filter((c) => !c.opened && w.explored[c.room]).length;
    const items = w.pickups.filter((p) => p.kind === 'item').length;
    const parts: string[] = [];
    if (chests) parts.push(`${chests} unopened chest${chests > 1 ? 's' : ''}`);
    if (items) parts.push(`${items} item${items > 1 ? 's' : ''} left behind`);
    if (parts.length) this.hud.toast(`Before you go: ${parts.join(', ')}.`, 'info', 3);
  }

  get upgrades() {
    return UPGRADES;
  }
}

function nullFxLike(): FxSink {
  return { number() {}, burst() {}, sound() {}, shake() {}, hitstop() {}, toast() {} };
}

function nullCallbacks(): WorldCallbacks {
  return {
    inspect() {},
    descend() {},
    rollChestLoot: () => starterWeapon(new Rng(2)),
    bossDefeated() {},
    playerDied() {},
    milestone() {},
  };
}

function bagIconSvg(): string {
  return `<svg viewBox="0 0 16 16" width="70%" height="70%" shape-rendering="crispEdges"><rect x="5" y="2" width="6" height="2" fill="#a7834e"/><rect x="4" y="3" width="1" height="2" fill="#a7834e"/><rect x="11" y="3" width="1" height="2" fill="#a7834e"/><rect x="3" y="5" width="10" height="9" fill="#8a5a34"/><rect x="3" y="5" width="10" height="2" fill="#b07a48"/><rect x="6" y="8" width="4" height="3" fill="#5e3a20"/><rect x="7" y="9" width="2" height="1" fill="#e3c58c"/></svg>`;
}
