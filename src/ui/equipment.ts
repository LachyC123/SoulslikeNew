import {
  affixText,
  attackRate,
  FAMILIES,
  Item,
  itemSpeedMul,
  RARITY_GEMS,
  RARITY_LABEL,
  salvageValue,
  SLOT_LABEL,
  sustainedDps,
} from '../data/items';
import { loadoutItems, synergiesFor } from '../data/synergy';
import { iconDataUrl } from '../render/icons';
import { canvas, ctx2d } from '../render/pixel';
import { playerFrames, PlayerLook } from '../render/sprites';
import { bagFree, equipItem, Player } from '../sim/player';

export interface EquipCallbacks {
  /** Equipment changed (rebuild stats, save). */
  changed(msg?: string, kind?: 'info' | 'synergy' | 'warn'): void;
  /** Remove the found pickup from the world. */
  takeFound(): void;
  /** Drop an item on the ground at the player. */
  drop(item: Item): void;
  close(): void;
  sound(): void;
  look(): PlayerLook;
}

type Sel = { kind: 'bag'; i: number } | { kind: 'weapon'; i: 0 | 1 } | { kind: 'ring'; i: 0 | 1 } | { kind: 'chest' } | { kind: 'boots' } | null;

export class EquipmentUI {
  private root: HTMLElement;
  private sel: Sel = null;
  private replaceIdx: 0 | 1 = 0;
  private confirmSalvage = false;

  constructor(
    overlay: HTMLElement,
    private player: Player,
    private found: Item | null,
    private cb: EquipCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'scrim';
    overlay.appendChild(this.root);
    if (found) {
      if (found.slot === 'weapon') this.replaceIdx = player.loadout.weapons[player.weaponIndex] && player.loadout.weapons[1 - player.weaponIndex] ? player.weaponIndex : player.loadout.weapons[player.weaponIndex] ? ((1 - player.weaponIndex) as 0 | 1) : player.weaponIndex;
      if (found.slot === 'ring') this.replaceIdx = player.loadout.rings[0] ? (player.loadout.rings[1] ? 0 : 1) : 0;
    } else this.sel = { kind: 'weapon', i: player.weaponIndex };
    this.render();
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.cb.close();
    });
  }

  destroy(): void {
    this.root.remove();
  }

  private selectedItem(): Item | null {
    const l = this.player.loadout;
    const s = this.sel;
    if (!s) return null;
    if (s.kind === 'bag') return this.player.bag[s.i];
    if (s.kind === 'weapon') return l.weapons[s.i];
    if (s.kind === 'ring') return l.rings[s.i];
    if (s.kind === 'chest') return l.chest;
    return l.boots;
  }

  private render(): void {
    const p = this.player;
    const l = p.loadout;
    const found = this.found;
    this.root.innerHTML = '';
    const panel = el('div', 'panel');
    panel.appendChild(el('button', 'close-x', '✕')).addEventListener('click', () => this.cb.close());
    panel.appendChild(el('h2', '', '<span class="orn">◆</span>Equipment<span class="orn">◆</span>'));
    const grid = el('div', 'equip-panel');
    panel.appendChild(grid);

    // ---- Paper doll + bag
    const dollCol = el('div', 'doll-col');
    const doll = el('div', 'doll');
    const left = el('div', 'slots');
    const right = el('div', 'slots');
    left.append(
      this.slotEl(l.weapons[0], 'Wpn 1', { kind: 'weapon', i: 0 }, p.weaponIndex === 0),
      this.slotEl(l.chest, 'Chest', { kind: 'chest' }),
      this.slotEl(l.boots, 'Boots', { kind: 'boots' }),
    );
    right.append(
      this.slotEl(l.weapons[1], 'Wpn 2', { kind: 'weapon', i: 1 }, p.weaponIndex === 1),
      this.slotEl(l.rings[0], 'Ring', { kind: 'ring', i: 0 }),
      this.slotEl(l.rings[1], 'Ring', { kind: 'ring', i: 1 }),
    );
    const relic = el('div', 'slot locked', '<span class="lbl">Relic</span>');
    relic.title = 'Relics arrive in a later milestone';
    right.appendChild(relic);
    const ch = canvas(16, 18);
    ch.className = 'char';
    ctx2d(ch).drawImage(playerFrames(this.cb.look()).frames[0][0], 0, 0);
    doll.append(left, ch, right);
    dollCol.appendChild(doll);
    const bagTitle = el('div', 'bag-title', `<span>Backpack</span><span>${p.bag.filter(Boolean).length} / ${p.bag.length}</span>`);
    dollCol.appendChild(bagTitle);
    const bag = el('div', 'bag');
    p.bag.forEach((it, i) => bag.appendChild(this.slotEl(it, '', { kind: 'bag', i })));
    dollCol.appendChild(bag);
    grid.appendChild(dollCol);

    // ---- Cards
    const col = el('div', 'cards-col');
    grid.appendChild(col);
    if (found) {
      const target = this.compareTarget(found);
      const shown = target ?? this.activeFallback(found);
      const cards = el('div', 'cards');
      cards.append(shown ? this.card(shown, target ? 'Equipped' : 'Equipped · kept', null) : this.emptyCard(found), this.card(found, 'Found', shown));
      col.appendChild(cards);
      col.appendChild(this.replacePicker(found));
      col.appendChild(this.synergyBox(found, target));
      const actions = el('div', 'actions');
      const equip = button('Equip', 'btn equip', () => this.equipFound());
      const free = bagFree(p) >= 0;
      const store = button(free ? 'Store' : 'Bag full', 'btn store', () => this.storeFound());
      store.disabled = !free;
      const leave = button('Leave', 'btn leave', () => this.cb.close());
      actions.append(equip, store, leave);
      col.appendChild(actions);
      setTimeout(() => equip.focus(), 0);
    } else {
      const item = this.selectedItem();
      const s = this.sel;
      if (!item) {
        col.appendChild(el('div', 'card empty-card', 'Select an item to see its details.<br><br>Bag items can be equipped, favourited or salvaged for gold.'));
      } else if (s?.kind === 'bag') {
        const target = this.compareTarget(item);
        const shown = target ?? this.activeFallback(item);
        const cards = el('div', 'cards');
        cards.append(shown ? this.card(shown, target ? 'Equipped' : 'Equipped · kept', null) : this.emptyCard(item), this.card(item, 'In backpack', shown));
        col.appendChild(cards);
        col.appendChild(this.replacePicker(item));
        col.appendChild(this.synergyBox(item, target));
        const actions = el('div', 'actions');
        const value = salvageValue(item);
        actions.append(
          button('Equip', 'btn equip', () => this.equipFromBag(s.i)),
          button(item.favourite ? '★ Unfavourite' : '☆ Favourite', 'btn small', () => {
            item.favourite = !item.favourite;
            this.cb.sound();
            this.render();
          }),
        );
        const salv = button(this.confirmSalvage ? `Confirm +${value}g` : `Salvage +${value}g`, 'btn store small', () => this.salvage(s.i));
        if (item.favourite) {
          salv.disabled = true;
          salv.title = 'Favourited items are protected';
        }
        actions.append(salv, button('Drop', 'btn leave small', () => this.dropFromBag(s.i)));
        col.appendChild(actions);
      } else {
        const cards = el('div', 'cards single');
        cards.appendChild(this.card(item, 'Equipped', null));
        col.appendChild(cards);
        col.appendChild(this.synergyBox(item, null, true));
        const actions = el('div', 'actions');
        const canUnequip = !(item.slot === 'weapon' && l.weapons.filter(Boolean).length <= 1);
        const un = button('Unequip', 'btn store', () => this.unequip());
        un.disabled = !canUnequip || bagFree(p) < 0;
        if (!canUnequip) un.title = 'You must keep one weapon';
        actions.append(un, button('Close', 'btn leave', () => this.cb.close()));
        col.appendChild(actions);
      }
    }
    this.root.appendChild(panel);
  }

  private compareTarget(item: Item): Item | null {
    const l = this.player.loadout;
    if (item.slot === 'weapon') return l.weapons[this.replaceIdx] ?? null;
    if (item.slot === 'ring') return l.rings[this.replaceIdx] ?? null;
    if (item.slot === 'chest') return l.chest;
    return l.boots;
  }

  /** When the new item fills an empty slot, still compare it against what you use now. */
  private activeFallback(item: Item): Item | null {
    const l = this.player.loadout;
    if (item.slot === 'weapon') return l.weapons[this.player.weaponIndex] ?? l.weapons[0] ?? l.weapons[1];
    if (item.slot === 'ring') return l.rings[0] ?? l.rings[1];
    return null;
  }

  private replacePicker(item: Item): HTMLElement {
    const l = this.player.loadout;
    const wrap = el('div', 'replace-pick');
    if (item.slot !== 'weapon' && item.slot !== 'ring') return wrap;
    const slots = item.slot === 'weapon' ? l.weapons : l.rings;
    if (!slots[0] || !slots[1]) {
      if (slots[0] || slots[1]) wrap.appendChild(el('span', '', `Fills your empty ${item.slot} slot — nothing is replaced.`));
      return wrap;
    }
    wrap.appendChild(el('span', '', 'Replace:'));
    for (const i of [0, 1] as const) {
      const b = button(`${slots[i]!.name}`, `btn small ${this.replaceIdx === i ? 'on' : ''}`, () => {
        this.replaceIdx = i;
        this.cb.sound();
        this.render();
      });
      wrap.appendChild(b);
    }
    return wrap;
  }

  private slotEl(item: Item | null, label: string, sel: Exclude<Sel, null>, activeW = false): HTMLElement {
    const b = el('button', 'slot');
    if (item) {
      b.dataset.r = item.rarity;
      b.innerHTML = `<img src="${iconDataUrl(item, 2)}" alt="${item.name}">${item.favourite ? '<span class="fav">★</span>' : ''}`;
      b.title = `${item.name} (${RARITY_LABEL[item.rarity]} ${SLOT_LABEL[item.slot]})`;
    } else if (label) b.innerHTML = `<span class="lbl">${label}</span>`;
    if (activeW) b.classList.add('active-w');
    const isSel = !this.found && this.sel && JSON.stringify(this.sel) === JSON.stringify(sel);
    if (isSel) b.classList.add('sel');
    b.addEventListener('click', () => {
      if (this.found) return;
      this.sel = sel;
      this.confirmSalvage = false;
      const it = this.selectedItem();
      if (it && (it.slot === 'weapon' || it.slot === 'ring') && sel.kind === 'bag') {
        const slots = it.slot === 'weapon' ? this.player.loadout.weapons : this.player.loadout.rings;
        this.replaceIdx = it.slot === 'weapon' ? (slots[this.player.weaponIndex] ? this.player.weaponIndex : 0) : slots[0] ? (slots[1] ? 0 : 1) : 0;
        if (it.slot === 'weapon' && !slots[1 - this.player.weaponIndex]) this.replaceIdx = (1 - this.player.weaponIndex) as 0 | 1;
      }
      this.cb.sound();
      this.render();
    });
    return b;
  }

  private emptyCard(forItem: Item): HTMLElement {
    const c = el('div', 'card');
    c.appendChild(el('div', 'tag', 'EQUIPPED'));
    c.appendChild(el('div', 'empty-card', `Empty ${SLOT_LABEL[forItem.slot].toLowerCase()} slot`));
    return c;
  }

  private card(item: Item, tag: string, compareTo: Item | null): HTMLElement {
    const c = el('div', `card ${tag.startsWith('Equipped') ? '' : 'found'}`);
    c.appendChild(el('div', 'tag', tag.toUpperCase()));
    const name = el('div', 'name', item.name);
    name.style.color = `var(--r-${item.rarity})`;
    c.appendChild(name);
    const gems = '◆'.repeat(RARITY_GEMS[item.rarity]) + '◇'.repeat(4 - RARITY_GEMS[item.rarity]);
    const fam = item.family ? FAMILIES[item.family].label : SLOT_LABEL[item.slot];
    c.appendChild(el('div', 'rarity', `<span style="color:var(--r-${item.rarity})">${RARITY_LABEL[item.rarity]}</span> ${fam} <span class="gems" style="color:var(--r-${item.rarity})">${gems}</span>`));
    const art = el('div', 'art', `<img src="${iconDataUrl(item, 4)}" alt="">`);
    c.appendChild(art);
    const stats = el('div', 'stats');
    for (const row of statRows(item, compareTo)) stats.appendChild(row);
    for (const a of item.affixes) stats.appendChild(el('div', 'affix', affixText(a)));
    c.appendChild(stats);
    if (item.family) {
      const f = FAMILIES[item.family];
      c.appendChild(el('div', 'innate', `${f.innate} Skill: ${f.skill.name}.`));
    }
    if (compareTo?.family && item.family) {
      const t = tradeoff(compareTo, item);
      if (t) c.appendChild(el('div', 'innate', t));
    }
    return c;
  }

  private synergyBox(item: Item, replaced: Item | null, equippedView = false): HTMLElement {
    const others = loadoutItems(this.player.loadout).filter((i) => i !== item && i !== replaced);
    const lines = synergiesFor(item, others);
    const box = el('div', `synergy ${lines.length ? '' : 'none'}`);
    box.appendChild(el('div', 'ring-ico', lines.length ? '❄' : '·'));
    if (lines.length) box.querySelector('.ring-ico')!.textContent = item.element === 'poison' || lines.some((l) => /poison|spore/i.test(l)) ? '☘' : lines.some((l) => /frost|shatter|chill/i.test(l)) ? '❄' : '✦';
    const txt = el('div', 'lines');
    if (lines.length) for (const l of lines) txt.appendChild(el('div', '', highlight(l)));
    else txt.textContent = equippedView ? 'No active synergy with your other gear.' : 'No direct synergy with your current gear.';
    box.appendChild(txt);
    return box;
  }

  // ---- actions

  private equipFound() {
    const p = this.player;
    const item = this.found!;
    const displaced = equipItem(p, item, item.slot === 'weapon' || item.slot === 'ring' ? this.replaceIdx : undefined);
    if (item.slot === 'weapon') p.weaponIndex = this.replaceIdx;
    this.cb.takeFound();
    let msg = `Equipped ${item.name}.`;
    let kind: 'info' | 'synergy' | 'warn' = 'info';
    if (displaced) {
      const free = bagFree(p);
      if (free >= 0) {
        p.bag[free] = displaced;
        msg += ` ${displaced.name} moved to your backpack.`;
      } else {
        this.cb.drop(displaced);
        msg = `Bag full — ${displaced.name} was left on the ground.`;
        kind = 'warn';
      }
    }
    const syn = synergiesFor(item, loadoutItems(p.loadout).filter((i) => i !== item));
    if (syn.length) {
      msg = syn[0];
      kind = 'synergy';
    }
    this.cb.changed(msg, kind);
    this.cb.close();
  }

  private storeFound() {
    const p = this.player;
    const free = bagFree(p);
    if (free < 0) return;
    p.bag[free] = this.found!;
    this.cb.takeFound();
    this.cb.changed(`${this.found!.name} stored in your backpack.`);
    this.cb.close();
  }

  private equipFromBag(i: number) {
    const p = this.player;
    const item = p.bag[i]!;
    p.bag[i] = null;
    const displaced = equipItem(p, item, item.slot === 'weapon' || item.slot === 'ring' ? this.replaceIdx : undefined);
    if (item.slot === 'weapon') p.weaponIndex = this.replaceIdx;
    p.bag[i] = displaced;
    const syn = synergiesFor(item, loadoutItems(p.loadout).filter((x) => x !== item));
    this.cb.changed(syn[0] ?? `Equipped ${item.name}.`, syn.length ? 'synergy' : 'info');
    this.sel = item.slot === 'weapon' ? { kind: 'weapon', i: this.replaceIdx } : item.slot === 'ring' ? { kind: 'ring', i: this.replaceIdx } : { kind: item.slot };
    this.render();
  }

  private salvage(i: number) {
    const p = this.player;
    const item = p.bag[i];
    if (!item || item.favourite) return;
    if (!this.confirmSalvage) {
      this.confirmSalvage = true;
      this.render();
      return;
    }
    this.confirmSalvage = false;
    const v = salvageValue(item);
    p.bag[i] = null;
    p.gold += v;
    this.cb.changed(`Salvaged ${item.name} for ${v} gold.`);
    this.sel = null;
    this.render();
  }

  private dropFromBag(i: number) {
    const p = this.player;
    const item = p.bag[i];
    if (!item) return;
    p.bag[i] = null;
    this.cb.drop(item);
    this.cb.changed(`Dropped ${item.name}.`);
    this.sel = null;
    this.render();
  }

  private unequip() {
    const p = this.player;
    const s = this.sel;
    const free = bagFree(p);
    if (!s || free < 0) return;
    const l = p.loadout;
    let item: Item | null = null;
    if (s.kind === 'weapon') {
      item = l.weapons[s.i];
      l.weapons[s.i] = null;
      if (p.weaponIndex === s.i) p.weaponIndex = (1 - s.i) as 0 | 1;
    } else if (s.kind === 'ring') {
      item = l.rings[s.i];
      l.rings[s.i] = null;
    } else if (s.kind === 'chest') {
      item = l.chest;
      l.chest = null;
    } else if (s.kind === 'boots') {
      item = l.boots;
      l.boots = null;
    }
    if (!item) return;
    p.bag[free] = item;
    this.cb.changed(`${item.name} moved to your backpack.`);
    this.sel = { kind: 'bag', i: free };
    this.render();
  }
}

function statRows(item: Item, other: Item | null): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const cmp = (k: string, v: number, ov: number | null, fmt: (n: number) => string, higherIsBetter = true, cls = '') => {
    let arrow = '';
    if (ov !== null && Math.abs(v - ov) > 1e-6) {
      const better = (v > ov) === higherIsBetter;
      arrow = ` <span class="${better ? 'up' : 'down'}">${v > ov ? '▲' : '▼'} ${better ? 'better' : 'worse'}</span>`;
    }
    rows.push(el('div', 'stat', `<span class="k">${k}</span><span class="v ${cls}">${fmt(v)}${arrow}</span>`));
  };
  if (item.slot === 'weapon' && item.family) {
    const o = other?.family ? other : null;
    const fam = FAMILIES[item.family];
    cmp('Damage per hit', item.damage ?? 0, o ? (o.damage ?? 0) : null, (n) => `${Math.round(n)}`);
    const rate = attackRate(fam, itemSpeedMul(item));
    cmp('Attack speed', rate, o ? attackRate(FAMILIES[o.family!], itemSpeedMul(o)) : null, (n) => `${n.toFixed(1)} /s`);
    cmp('Sustained damage', sustainedDps(item), o ? sustainedDps(o) : null, (n) => `${Math.round(n)} /s`);
    if (item.element !== 'none') {
      const ob = o && o.element === item.element ? o.buildup : o ? 0 : null;
      cmp(`${item.element === 'poison' ? 'Poison' : 'Frost'} buildup / hit`, item.buildup, ob, (n) => `+${Math.round(n)}`, true, `el-${item.element}`);
    } else rows.push(el('div', 'stat', '<span class="k">Element</span><span class="v muted">None</span>'));
  } else if (item.slot === 'chest') {
    cmp('Defence', item.defense ?? 0, other ? (other.defense ?? 0) : null, (n) => `${n}`);
  }
  return rows;
}

/** Plain-language summary so a big number never hides lower sustained damage. */
function tradeoff(from: Item, to: Item): string {
  const d = (to.damage ?? 1) / (from.damage ?? 1);
  const r = attackRate(FAMILIES[to.family!], itemSpeedMul(to)) / attackRate(FAMILIES[from.family!], itemSpeedMul(from));
  const s = sustainedDps(to) / sustainedDps(from);
  const parts: string[] = [];
  if (d > 1.15) parts.push(`hits ${d.toFixed(1)}× harder`);
  else if (d < 0.87) parts.push(`hits ${(1 / d).toFixed(1)}× softer`);
  if (r < 0.87) parts.push(`attacks ${(1 / r).toFixed(1)}× slower`);
  else if (r > 1.15) parts.push(`attacks ${r.toFixed(1)}× faster`);
  if (!parts.length) return '';
  const sus = s > 1.05 ? `${Math.round((s - 1) * 100)}% more sustained damage` : s < 0.95 ? `${Math.round((1 - s) * 100)}% less sustained damage` : 'similar sustained damage';
  return `vs equipped: ${parts.join(', ')} — ${sus}.`;
}

function highlight(s: string): string {
  return s
    .replace(/\b(frost|freeze[sd]?|frozen|chill[s]?|shatter[s]?)\b/gi, '<span style="color:var(--frost)">$1</span>')
    .replace(/\b(poison(?:ed)?|spores?)\b/gi, '<span style="color:var(--poison)">$1</span>');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export { el, button };
