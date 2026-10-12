import { Sfx } from './audio/sfx';
import { Rng, stream } from './core/rng';
import { Boon, makeBargain, makeBoon } from './data/boons';
import { Item, itemPrice, itemSig, makeRelic, makeRing, makeWeapon, randomLoot, setFamiliarity, starterWeapon, WeaponFamily } from './data/items';
import { propSig } from './data/props';
import { loadoutItems, synergiesFor } from './data/synergy';
import { ALL_FAMILIES } from './data/weapons';
import { Renderer, playerLook } from './render/renderer';
import { VERDANT } from './render/theme';
import { clearRun, defaultSettings, loadMeta, loadRun, Meta, RunSave, saveMeta, saveRun, SAVE_VERSION } from './save/save';
import { BOON_SLOTS, createPlayer, newStatus, Player, refreshBuild } from './sim/player';
import { emptyIntent, Feature, FloorMods, FloorStateSave, FxSink, NO_MODS, Pickup, World, WorldCallbacks } from './sim/world';
import { EquipmentUI } from './ui/equipment';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import { boonScreen, confirmScreen, helpScreen, mapScreen, pauseMenu, recapScreen, rewardScreen, settingsScreen, shopScreen, ShopState, shrineScreen, titleScreen, upgradesScreen } from './ui/screens';
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
  embersEarned: number;
  lootRng: Rng;
  offered: string[];
  guaranteeWeapon: boolean;
  guaranteeRing: boolean;
  unlocks: string[];
  mods: FloorMods;
  bestCombo: number;
}

const FLOOR_MODS: FloorMods[] = [
  { id: 'overgrown', name: 'Overgrown', desc: 'Foes are hardier; treasure is richer.', hpMul: 1.18, mutationBonus: 0, forced: null, goldMul: 1.2, lootBonus: 1, aggroMul: 1 },
  { id: 'bloodmoon', name: 'Blood Moon', desc: 'Mutations everywhere. Double gold.', hpMul: 1, mutationBonus: 0.45, forced: null, goldMul: 2, lootBonus: 0, aggroMul: 1.2 },
  { id: 'volatile', name: 'Volatile Air', desc: 'Every foe explodes on death.', hpMul: 0.95, mutationBonus: 0, forced: 'volatile', goldMul: 1.4, lootBonus: 0, aggroMul: 1 },
  { id: 'mist', name: 'Morning Mist', desc: 'Foes notice you later.', hpMul: 1, mutationBonus: 0, forced: null, goldMul: 1, lootBonus: 0, aggroMul: 0.55 },
  { id: 'swift', name: 'Restless Roots', desc: 'All foes are swift.', hpMul: 0.9, mutationBonus: 0, forced: 'hasted', goldMul: 1.3, lootBonus: 1, aggroMul: 1 },
  { id: 'warded', name: 'Warded Halls', desc: 'All foes carry wards.', hpMul: 0.9, mutationBonus: 0, forced: 'warded', goldMul: 1.3, lootBonus: 1, aggroMul: 1 },
  { id: 'brood', name: 'The Brood', desc: 'Foes split in two when slain.', hpMul: 0.85, mutationBonus: 0, forced: 'splitter', goldMul: 1.2, lootBonus: 0, aggroMul: 1 },
];

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
  private shops = new Map<number, ShopState>();
  private pendingBoon = false;

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
      relic: $('btn-relic'),
      skillCancel: $('skill-cancel'),
    });
    this.hud = new Hud(this.renderer, this.input);
    $('btn-pause').addEventListener('click', () => this.pause());
    $('btn-bag').addEventListener('click', () => this.openEquipment(null));
    $('minimap').addEventListener('click', () => this.openMap());
    $('btn-bag').innerHTML = bagIconSvg();
    setFamiliarity((sig) => this.familiarity(sig));

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
  // Novelty memory: things you've seen recently are less likely to roll again.

  private familiarity(sig: string): number {
    let n = 0;
    const seen = this.meta.seen;
    for (let i = seen.length - 1, w = 1; i >= 0 && i >= seen.length - 400; i--, w *= 0.996) if (seen[i] === sig) n += w;
    if (this.run) for (const o of this.run.offered) if (o === sig) n += 1.5;
    return n;
  }

  private remember(sigs: string[]) {
    this.meta.seen.push(...sigs);
    if (this.meta.seen.length > 500) this.meta.seen.splice(0, this.meta.seen.length - 500);
    if (this.run) {
      this.run.offered.push(...sigs);
      if (this.run.offered.length > 120) this.run.offered.splice(0, this.run.offered.length - 120);
    }
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
        this.run!.bestCombo = Math.max(this.run!.bestCombo, world.bestCombo);
        const nearStairs = world.nearby?.kind === 'stairs';
        if (nearStairs && !this.wasNearStairs) this.stairsReminder();
        this.wasNearStairs = nearStairs;
        this.tutorial(dt, intent.mx !== 0 || intent.my !== 0, intent.attack, intent.dodge);
      }
      this.snapshotT += dt;
      if (this.snapshotT > 20) this.saveNow();
    } else if (this.mode === 'dead') {
      world.update(dt, emptyIntent());
      this.deathT += dt;
      if (this.deathT > 1.5 && !this.overlay.children.length) this.showRecap(false);
    }
    this.renderer.update(this.mode === 'playing' || this.mode === 'dead' ? dt : 0, world);
    this.renderer.render(world);
    this.hud.update(world, dt, 0);
  }

  // ---------------------------------------------------------------------------
  // Title

  private showTitle() {
    this.mode = 'title';
    this.world = null;
    this.player = null;
    this.run = null;
    this.clearOverlay();
    $('hud').classList.add('hidden');
    $('controls').classList.add('hidden');
    $('interact').classList.add('hidden');
    this.sfx.stopAmbience();
    this.renderer.hidePlayer = true;
    if (!this.titleWorld) {
      const plan = generateFloor(20261012, 1);
      const p = createPlayer(plan.spawn.x, plan.spawn.y, starterWeapon(new Rng(1)));
      this.titleWorld = new World(plan, p, nullFx(), nullCallbacks(), 1);
    }
    this.renderer.prepareFloor(this.titleWorld);
    const hasRun = !!loadRun(GEN_VERSION);
    titleScreen(this.overlay, this.meta, hasRun, this.isTouch(), {
      cont: () => this.continueRun(),
      newRun: () => {
        if (hasRun) confirmScreen(this.overlay, 'Abandon run?', 'Starting a new run abandons the one in progress. Embers you earned are kept.', 'Start new', () => this.newRun(), () => this.showTitle());
        else this.newRun();
      },
      upgrades: () => {
        this.clearOverlay();
        upgradesScreen(this.overlay, this.meta, () => saveMeta(this.meta), () => this.showTitle());
      },
      settings: () => this.showSettings(() => this.showTitle()),
      help: () => {
        this.clearOverlay();
        helpScreen(this.overlay, this.isTouch(), () => this.showTitle());
      },
    });
  }

  private renderTitle(dt: number) {
    const w = this.titleWorld!;
    this.titleT += dt;
    const mw = w.map.w * 16;
    const mh = w.map.h * 16;
    w.player.x = mw / 2 + Math.cos(this.titleT * 0.05) * (mw * 0.3);
    w.player.y = mh / 2 + Math.sin(this.titleT * 0.07) * (mh * 0.25);
    w.player.state = 'dead';
    w.player.stateT = 10;
    this.renderer.update(dt, w);
    this.renderer.render(w);
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
    this.player = createPlayer(0, 0, starter, this.meta.upgrades.vigor * 10, this.meta.upgrades.flask);
    this.run = {
      seed,
      floor: 1,
      firstRun,
      startedAt: Date.now(),
      playTime: 0,
      kills: 0,
      embersEarned: 0,
      lootRng,
      offered: [],
      guaranteeWeapon: false,
      guaranteeRing: false,
      unlocks: [],
      mods: NO_MODS,
      bestCombo: 0,
    };
    this.shops.clear();
    this.hintState = { moved: 0, attacked: false, dodged: false, sawWindup: false, sawEnemy: false };
    this.startFloor(null, true);
  }

  private continueRun() {
    const save = loadRun(GEN_VERSION);
    if (!save) return this.showTitle();
    const p = createPlayer(0, 0, save.player.loadout.weapons[0] ?? starterWeapon(new Rng(1)), this.meta.upgrades.vigor * 10, this.meta.upgrades.flask);
    p.loadout = { ...save.player.loadout, relic: save.player.loadout.relic ?? null };
    p.bag = save.player.bag;
    p.boons = save.player.boons ?? [];
    p.maxFlasks = save.player.maxFlasks;
    p.flasks = save.player.flasks;
    p.gold = save.player.gold;
    p.weaponIndex = save.player.weaponIndex;
    p.skillCd = save.player.skillCd;
    p.relicCd = save.player.relicCd ?? 0;
    p.poison = save.player.poison ?? newStatus();
    refreshBuild(p);
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
      embersEarned: save.embersEarned,
      lootRng,
      offered: save.offered.filter((o) => !o.startsWith('!')),
      guaranteeWeapon: save.offered.includes('!weapon'),
      guaranteeRing: save.offered.includes('!ring'),
      unlocks: [],
      mods: FLOOR_MODS.find((m) => m.id === save.mods) ?? NO_MODS,
      bestCombo: 0,
    };
    this.hintState = { moved: 99, attacked: true, dodged: true, sawWindup: true, sawEnemy: true };
    this.startFloor(save.floorState, false, { x: save.player.x, y: save.player.y }, true);
  }

  private rollMods(): FloorMods {
    const run = this.run!;
    if (run.floor === 1) return NO_MODS;
    const r = stream(run.seed, `mods:${run.floor}`);
    if (r.chance(0.4)) return NO_MODS;
    return r.pick(FLOOR_MODS);
  }

  private startFloor(saved: FloorStateSave | null, fadeIn: boolean, pos?: { x: number; y: number }, keepMods = false) {
    const run = this.run!;
    const p = this.player!;
    if (!keepMods) run.mods = this.rollMods();
    const plan = generateFloor(run.seed, run.floor);
    p.state = 'free';
    p.vx = p.vy = 0;
    p.invuln = 0;
    p.hurtT = 0;
    p.shield = 0;
    this.world = new World(plan, p, this.fx(), this.callbacks(), (run.seed ^ (run.floor * 2654435761)) >>> 0, saved ?? undefined, run.mods);
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
    this.hud.setFloorMod(run.mods.name ? `${run.mods.name}: ${run.mods.desc}` : '');
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
    if (run.firstRun && run.floor === 1 && !saved) this.hint('move', this.isTouch() ? 'Drag on the left side of the screen to move.' : 'Move with WASD or the arrow keys.');
    if (run.mods.name && !saved) setTimeout(() => this.hud.callout(run.mods.name.toUpperCase(), 2), 900);
    if (plan.boss && !saved) this.hud.toast('The air grows heavy. A spring waits before the arena.', 'warn', 4);
    this.saveNow();
    if (this.pendingBoon) {
      this.pendingBoon = false;
      setTimeout(() => this.offerBoons('A blessing for the descent'), 700);
    }
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
    if (run.floor >= REGION_FLOORS) {
      this.showRecap(true);
      return;
    }
    p.flasks = Math.min(p.maxFlasks, p.flasks + 1);
    run.floor++;
    this.award(2);
    this.recordBest(run.floor);
    const fam = p.loadout.weapons[p.weaponIndex]?.family;
    if (fam && !this.meta.unlocked.includes(fam)) {
      this.meta.unlocked.push(fam);
      run.unlocks.push(`New starting weapon unlocked: ${fam[0].toUpperCase()}${fam.slice(1)}`);
      this.hud.toast(`Unlocked: ${fam} as a starting weapon`, 'synergy');
    }
    saveMeta(this.meta);
    this.mode = 'transition';
    this.pendingBoon = true;
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
    if (this.run) this.run.embersEarned += n;
    saveMeta(this.meta);
  }

  // ---------------------------------------------------------------------------
  // Boons, shrines and merchants

  private offerBoons(title: string) {
    if (!this.player || !this.run || this.mode !== 'playing') return;
    const run = this.run;
    const r = stream(run.seed, `boons:${run.floor}:${this.player.boons.length}:${run.kills}`);
    const boons = [makeBoon(r, run.floor, (s) => this.familiarity(s)), makeBoon(r, run.floor, (s) => this.familiarity(s)), makeBoon(r, run.floor, (s) => this.familiarity(s))];
    this.remember(boons.flatMap((b) => b.props.map(propSig)));
    this.mode = 'menu';
    this.input.releaseAll();
    this.clearOverlay();
    boonScreen(this.overlay, title, boons, this.player.boons.length >= BOON_SLOTS, (b) => {
      if (b) this.gainBoon(b);
      this.clearOverlay();
      this.mode = 'playing';
      this.readyT = 0.35;
      this.saveNow();
    });
  }

  private gainBoon(b: Boon) {
    const p = this.player!;
    if (p.boons.length >= BOON_SLOTS) p.boons.shift();
    p.boons.push(b);
    refreshBuild(p);
    this.sfx.play('legendary');
    this.hud.toast(`${b.name} — ${b.cursed ? 'the pact is sealed' : 'a boon is yours'}.`, b.cursed ? 'warn' : 'synergy', 3.5);
  }

  private onFeature(f: Feature) {
    if (f.kind === 'shrine') this.openShrine(f);
    else if (f.kind === 'merchant') this.openShop(f);
  }

  private openShrine(f: Feature) {
    const run = this.run!;
    const r = stream(run.seed, `shrine:${run.floor}:${f.id}`);
    const pacts = [makeBargain(r, run.floor, (s) => this.familiarity(s)), makeBargain(r, run.floor, (s) => this.familiarity(s))];
    this.mode = 'menu';
    this.input.releaseAll();
    this.clearOverlay();
    shrineScreen(
      this.overlay,
      pacts,
      (b) => {
        f.used = true;
        this.gainBoon(b);
        if (b.gift) this.giveGift(b.gift);
        this.world!.fx.burst('nova', f.x, f.y - 14, 0, 2, 'none');
        this.renderer.shake(4);
        this.closeMenus();
        this.saveNow();
      },
      () => this.closeMenus(),
    );
  }

  private giveGift(kind: NonNullable<Boon['gift']>) {
    const run = this.run!;
    const p = this.player!;
    const r = run.lootRng;
    let item: Item | null = null;
    if (kind === 'weapon') item = makeWeapon(r, run.floor + 1, { rarity: r.chance(0.35) ? 'mythic' : 'epic' });
    else if (kind === 'ring') item = makeRing(r, run.floor + 1, r.chance(0.35) ? 'mythic' : 'epic');
    else if (kind === 'relic') item = makeRelic(r, run.floor + 1, 'epic');
    else p.gold += 120;
    if (item) {
      this.remember(itemSig(item));
      this.world!.dropItem(item, p.x, p.y + 10);
    }
  }

  private openShop(f: Feature) {
    const run = this.run!;
    const p = this.player!;
    let shop = this.shops.get(f.id);
    const stock = (rerolls: number): ShopState => {
      const r = stream(run.seed, `shop:${run.floor}:${f.id}:${rerolls}`);
      const items = [makeWeapon(r, run.floor, { rarity: r.chance(0.3) ? 'epic' : 'rare' }), randomLoot(r, run.floor, 1), r.chance(0.5) ? makeRelic(r, run.floor) : makeRing(r, run.floor)];
      for (const it of items) it.price = itemPrice(it);
      this.remember(items.flatMap(itemSig));
      return { items, boon: makeBoon(r, run.floor, (s) => this.familiarity(s), r.chance(0.3) ? 'epic' : 'rare'), boonPrice: 60 + run.floor * 15, rerolls };
    };
    if (!shop) {
      shop = stock(0);
      this.shops.set(f.id, shop);
    }
    this.mode = 'menu';
    this.input.releaseAll();
    this.clearOverlay();
    const healPrice = 25 + run.floor * 5;
    shopScreen(this.overlay, shop, () => p.gold, {
      healPrice,
      buy: (i) => {
        const it = shop!.items[i];
        if (!it || p.gold < (it.price ?? 0)) return;
        p.gold -= it.price ?? 0;
        shop!.items[i] = null;
        const free = p.bag.indexOf(null);
        if (free >= 0) p.bag[free] = it;
        else this.world!.dropItem(it, p.x, p.y + 8);
        this.sfx.play('gold');
        this.saveNow();
      },
      buyBoon: () => {
        if (!shop!.boon || p.gold < shop!.boonPrice) return;
        p.gold -= shop!.boonPrice;
        this.gainBoon(shop!.boon);
        shop!.boon = null;
        this.saveNow();
      },
      reroll: () => {
        const cost = 20 + shop!.rerolls * 15;
        if (p.gold < cost) return;
        p.gold -= cost;
        const next = stock(shop!.rerolls + 1);
        Object.assign(shop!, next);
        this.sfx.play('chest');
      },
      heal: () => {
        if (p.gold < healPrice) return;
        p.gold -= healPrice;
        this.world!.healPlayer(Math.round(p.build.maxHp * 0.4));
        this.sfx.play('heal');
      },
      leave: () => this.closeMenus(),
    });
  }

  // ---------------------------------------------------------------------------
  // Saving

  private saveNow() {
    this.snapshotT = 0;
    const run = this.run;
    const p = this.player;
    const w = this.world;
    if (!run || !p || !w || p.state === 'dead' || this.mode === 'dead') return;
    const offered = [...run.offered];
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
        boons: p.boons,
        relicCd: p.relicCd,
        poison: p.poison,
      },
      floorState: w.saveState(),
      mods: run.mods.id,
    };
    saveRun(save);
    saveMeta(this.meta);
  }

  // ---------------------------------------------------------------------------
  // Simulation wiring

  private fx(): FxSink {
    const parts = () => this.renderer.particles;
    return {
      number: (x, y, t, k) => parts().number(x, y, t, k),
      burst: (k, x, y, a, s, el) => parts().burst(k, x, y, a, s, el),
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
      beam: (x1, y1, x2, y2, el, kind) => parts().beam(x1, y1, x2, y2, el, kind),
      death: (e) => this.renderer.deathOf(e),
      callout: (text, tier) => this.hud.callout(text, tier),
    };
  }

  private callbacks(): WorldCallbacks {
    return {
      inspect: (p) => this.openEquipment(p),
      descend: () => this.descend(),
      rollChestLoot: (c) => {
        const item = this.rollLoot(c.guarded);
        setTimeout(() => this.saveNow(), 0);
        return item;
      },
      bossDefeated: () => this.onBossDefeated(),
      playerDied: () => this.onDeath(),
      milestone: (kind, n) => {
        if (kind === 'kill') {
          this.run!.kills += n;
          if (this.run!.kills % 6 === 0) this.award(1);
        } else if (kind === 'boss') this.award(15);
        else if (kind === 'room') this.sfx.play('combo', 0.6);
      },
      feature: (f) => this.onFeature(f),
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
      run.guaranteeWeapon = true;
      if (run.firstRun) item = makeWeapon(rng, level, { family: 'hammer', variant: 0, element: 'frost', rarity: 'rare', name: 'Winterbell' });
      else {
        const fam = rng.pick(ALL_FAMILIES.filter((f) => f !== starterFam) as WeaponFamily[]);
        item = makeWeapon(rng, level, { family: fam, rarity: rng.pick(['uncommon', 'rare'] as const) });
      }
    } else if (!run.guaranteeRing) {
      run.guaranteeRing = true;
      item = rng.chance(0.5) ? makeRelic(rng, level, 'rare') : makeRing(rng, level, 'rare');
    } else item = randomLoot(rng, level, (guarded ? 1 : 0) + run.mods.lootBonus);
    this.remember(itemSig(item));
    return item;
  }

  private onBossDefeated() {
    const run = this.run!;
    const p = this.player!;
    p.hp = Math.min(p.build.maxHp, p.hp + Math.round(p.build.maxHp * 0.3));
    this.meta.wins++;
    saveMeta(this.meta);
    this.hud.setObjective('The stairs are open');
    setTimeout(() => {
      if (this.mode !== 'playing') return;
      const rng = run.lootRng;
      const items = [makeWeapon(rng, run.floor + 1, { rarity: rng.chance(0.4) ? 'mythic' : 'epic' }), makeRing(rng, run.floor + 1, 'epic'), makeRelic(rng, run.floor + 1, rng.chance(0.3) ? 'mythic' : 'epic')];
      this.remember(items.flatMap(itemSig));
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
    }, 1800);
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
    }
    this.meta.tutorialDone = true;
    saveMeta(this.meta);
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
        combo: run.bestCombo,
        boons: p.boons.map((b) => b.name),
      },
      { again: () => this.newRun(), title: () => this.showTitle() },
    );
  }

  // ---------------------------------------------------------------------------
  // Menus

  private onUiAction(a: string) {
    if (a === 'pause') {
      if (this.mode === 'playing') this.pause();
      else if ((this.mode === 'paused' || this.mode === 'menu') && !this.overlay.querySelector('.reward-row')) this.closeMenus();
    } else if (a === 'inventory') {
      if (this.mode === 'playing') this.openEquipment(null);
      else if (this.equipUI) this.closeMenus();
    } else if (a === 'map') {
      if (this.mode === 'playing') this.openMap();
      else if (this.mode === 'menu' && this.overlay.querySelector('.bigmap')) this.closeMenus();
    }
  }

  private onFocusLost() {
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
      equipment: () => this.openEquipment(null, true),
      map: () => this.openMap(true),
      settings: () => this.showSettings(() => this.pauseAgain()),
      abandon: () =>
        confirmScreen(
          this.overlay,
          'Abandon run?',
          'Your run gear will be lost. Embers already earned are kept.',
          'Abandon',
          () => {
            clearRun();
            this.showTitle();
          },
          () => this.pauseAgain(),
        ),
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

  private openEquipment(pickup: Pickup | null, fromPause = false) {
    if (!this.world || !this.player) return;
    if (this.mode !== 'playing' && !fromPause) return;
    this.clearOverlay();
    this.mode = 'menu';
    this.input.releaseAll();
    this.sfx.play('ui');
    const p = this.player;
    this.equipUI = new EquipmentUI(this.overlay, p, pickup?.item ?? null, {
      changed: (msg, kind) => {
        refreshBuild(p);
        if (msg) this.hud.toast(msg, kind ?? 'info', kind === 'synergy' ? 4.5 : 2.8);
        this.sfx.play(kind === 'synergy' ? 'heal' : 'pickup');
        this.saveNow();
      },
      takeFound: () => {
        if (pickup) this.world!.removePickup(pickup);
      },
      drop: (item) => this.world!.dropItem(item, p.x, p.y + 6, false),
      close: () => this.closeMenus(),
      sound: () => this.sfx.play('ui'),
      look: () => playerLook(this.world!),
    });
  }

  private openMap(fromPause = false) {
    if (!this.world || (this.mode !== 'playing' && !fromPause)) return;
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
  // First-run guidance

  private hint(id: string, text: string) {
    if (this.meta.seenHints.includes(id)) return;
    this.meta.seenHints.push(id);
    saveMeta(this.meta);
    this.hud.toast(text, 'hint', 7, id);
  }

  private tutorial(dt: number, moving: boolean, attacked: boolean, dodged: boolean) {
    const run = this.run;
    const w = this.world;
    if (!run || !w) return;
    const p = this.player!;
    if (p.loadout.relic) this.hint('relic', this.isTouch() ? 'Your relic has an active ability: tap its button above the flask.' : 'Your relic has an active ability: press R.');
    if (!run.firstRun) return;
    if (moving) this.hintState.moved += dt;
    if (this.hintState.moved > 1.2) this.hud.dismiss('move');
    if (!this.hintState.sawEnemy && w.enemies.find((e) => e.aggro && e.state !== 'dead')) {
      this.hintState.sawEnemy = true;
      this.hint('attack', this.isTouch() ? 'Tap ⚔ to strike. Hold it to keep attacking.' : 'Attack with J or left-click. Hold to keep attacking.');
    }
    if (attacked) this.hud.dismiss('attack');
    if (dodged) this.hud.dismiss('dodge');
    if (p.state === 'flask') this.hud.dismiss('flask');
    if (w.chests.some((c) => c.opened)) this.hud.dismiss('chest');
    if (w.nearby?.kind === 'stairs') this.hint('stairs', this.isTouch() ? 'Hold the prompt to descend. You never need to clear the whole floor.' : 'Hold E to descend. You never need to clear the whole floor.');
    if (w.nearby?.kind === 'chest') this.hint('chest', this.isTouch() ? 'Tap the prompt to open the chest.' : 'Press E to open the chest.');
    if (p.loadout.weapons[1]) this.hint('swap', this.isTouch() ? 'Tap ⇄ to swap weapons. Each keeps its own skill cooldown.' : 'Press Q to swap weapons; L or right-click uses the weapon skill.');
    if (p.state !== 'dead' && p.hp > 0 && p.hp < p.build.maxHp * 0.5 && p.flasks > 0) this.hint('flask', this.isTouch() ? 'Low health — tap the red flask to heal.' : 'Low health — press F to drink a flask.');
  }

  stairsReminder(): void {
    const w = this.world;
    if (!w) return;
    const chests = w.chests.filter((c) => !c.opened && w.explored[c.room]).length;
    const items = w.pickups.filter((p) => p.kind === 'item').length;
    const shrines = w.features.filter((f) => f.kind === 'shrine' && !f.used && w.explored[f.room]).length;
    const parts: string[] = [];
    if (chests) parts.push(`${chests} unopened chest${chests > 1 ? 's' : ''}`);
    if (items) parts.push(`${items} item${items > 1 ? 's' : ''} left behind`);
    if (shrines) parts.push('an untouched shrine');
    if (parts.length) this.hud.toast(`Before you go: ${parts.join(', ')}.`, 'info', 3);
  }
}

function nullFx(): FxSink {
  return { number() {}, burst() {}, sound() {}, shake() {}, hitstop() {}, toast() {}, beam() {}, death() {}, callout() {} };
}

function nullCallbacks(): WorldCallbacks {
  return {
    inspect() {},
    descend() {},
    rollChestLoot: () => starterWeapon(new Rng(2)),
    bossDefeated() {},
    playerDied() {},
    milestone() {},
    feature() {},
  };
}

function bagIconSvg(): string {
  return `<svg viewBox="0 0 16 16" width="70%" height="70%" shape-rendering="crispEdges"><rect x="5" y="2" width="6" height="2" fill="#a7834e"/><rect x="4" y="3" width="1" height="2" fill="#a7834e"/><rect x="11" y="3" width="1" height="2" fill="#a7834e"/><rect x="3" y="5" width="10" height="9" fill="#8a5a34"/><rect x="3" y="5" width="10" height="2" fill="#b07a48"/><rect x="6" y="8" width="4" height="3" fill="#5e3a20"/><rect x="7" y="9" width="2" height="1" fill="#e3c58c"/></svg>`;
}

