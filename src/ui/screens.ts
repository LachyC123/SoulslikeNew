import { FAMILIES, Item, RARITY_GEMS, RARITY_LABEL, SLOT_LABEL, affixText, WeaponFamily } from '../data/items';
import { iconDataUrl } from '../render/icons';
import { exportBackup, importBackup, Meta, Settings } from '../save/save';
import { button, el } from './equipment';

export const UPGRADES = {
  vigor: { name: 'Heartwood Vigor', desc: '+10 maximum health per rank', max: 3, cost: [8, 16, 28] },
  flask: { name: 'Deeper Flask', desc: '+1 flask charge per rank', max: 2, cost: [14, 30] },
} as const;

export const STARTER_UNLOCK: Record<WeaponFamily, string> = {
  sword: 'Always available',
  daggers: 'Unlocked by reaching floor 2',
  hammer: 'Unlocked by defeating the Thorn Warden',
};

function scrim(overlay: HTMLElement, onBackdrop?: () => void): HTMLElement {
  const s = el('div', 'scrim');
  overlay.appendChild(s);
  if (onBackdrop)
    s.addEventListener('pointerdown', (e) => {
      if (e.target === s) onBackdrop();
    });
  return s;
}

export function titleScreen(
  overlay: HTMLElement,
  meta: Meta,
  hasRun: boolean,
  touch: boolean,
  cb: { cont: () => void; newRun: () => void; upgrades: () => void; settings: () => void; help: () => void },
): void {
  const s = el('div', 'title-screen');
  const wrap = el('div', 'title-wrap');
  wrap.appendChild(el('div', 'logo', 'PIXEL DUNGEON<small>DESCENT THROUGH THE VERDANT RUINS</small>'));
  const menu = el('div', 'menu');
  if (hasRun) menu.appendChild(button('Continue', 'btn equip', cb.cont));
  menu.appendChild(button('New Run', hasRun ? 'btn' : 'btn equip', cb.newRun));
  menu.appendChild(button('Upgrades', 'btn', cb.upgrades));
  menu.appendChild(button('Settings', 'btn', cb.settings));
  menu.appendChild(button('How to play', 'btn', cb.help));
  wrap.appendChild(menu);
  const m = el('div', 'title-meta');
  m.innerHTML = `<span>Embers <b>${meta.embers}</b></span><span>Best floor <b>${meta.bestFloor || '—'}</b></span><span>Runs <b>${meta.runs}</b></span><span>Clears <b>${meta.wins}</b></span>`;
  wrap.appendChild(m);
  if (!touch) wrap.appendChild(el('div', 'kbd-help', controlsHelp(false)));
  s.appendChild(wrap);
  overlay.appendChild(s);
  setTimeout(() => (menu.querySelector('button') as HTMLButtonElement)?.focus(), 0);
}

export function controlsHelp(touch: boolean): string {
  if (touch)
    return 'Drag on the left half to move. <b>⚔</b> tap to strike, hold to repeat, drag to aim. <b>➶</b> dodge. Skill: drag to aim, release to cast (drop on ✕ to cancel). <b>⇄</b> swap weapons. Tap prompts near your hero to interact.';
  return '<kbd>WASD</kbd> move · <kbd>J</kbd>/<kbd>Click</kbd> attack (hold to repeat) · <kbd>Space</kbd> dodge · <kbd>L</kbd>/<kbd>Right-click</kbd> weapon skill · <kbd>Q</kbd> swap · <kbd>F</kbd> flask · <kbd>E</kbd> interact (hold on stairs) · <kbd>I</kbd> equipment · <kbd>M</kbd> map · <kbd>Esc</kbd> pause';
}

export function helpScreen(overlay: HTMLElement, touch: boolean, back: () => void): void {
  const s = scrim(overlay, back);
  const p = el('div', 'panel recap');
  p.appendChild(el('h2', '', 'How to play'));
  p.appendChild(
    el(
      'div',
      'kbd-help',
      `${controlsHelp(touch)}<br><br>
      Find the <b style="color:var(--gold)">stairs</b> on each floor — you never need to clear everything.
      <b style="color:#ffb340">Amber markings</b> warn of enemy attacks: dodge through them.
      Equipment defines your build: <span style="color:var(--frost)">frost</span> freezes foes and hammers <span style="color:var(--frost)">shatter</span> them;
      <span style="color:var(--poison)">poison</span> builds up and ticks. Rings connect it all.<br><br>
      Death loses your run gear, but <b style="color:var(--gold)">Embers</b> earned along the way buy permanent upgrades.
      Floor 3 holds the Thorn Warden.`,
    ),
  );
  p.appendChild(button('Back', 'btn', back));
  s.appendChild(p);
}

export function pauseMenu(
  overlay: HTMLElement,
  cb: { resume: () => void; equipment: () => void; map: () => void; settings: () => void; abandon: () => void; quit: () => void },
): void {
  const s = scrim(overlay, cb.resume);
  const p = el('div', 'panel');
  p.appendChild(el('h2', '', '<span class="orn">◆</span>Paused<span class="orn">◆</span>'));
  const menu = el('div', 'menu');
  menu.append(
    button('Resume', 'btn equip', cb.resume),
    button('Equipment', 'btn', cb.equipment),
    button('Map', 'btn', cb.map),
    button('Settings', 'btn', cb.settings),
    button('Save & quit to title', 'btn', cb.quit),
    button('Abandon run', 'btn danger', cb.abandon),
  );
  p.appendChild(menu);
  s.appendChild(p);
  setTimeout(() => (menu.querySelector('button') as HTMLButtonElement)?.focus(), 0);
}

export function confirmScreen(overlay: HTMLElement, title: string, body: string, yes: string, onYes: () => void, onNo: () => void): void {
  const s = scrim(overlay, onNo);
  const p = el('div', 'panel recap');
  p.appendChild(el('h2', '', title));
  p.appendChild(el('p', 'big', body));
  const a = el('div', 'actions');
  a.append(button(yes, 'btn danger', onYes), button('Cancel', 'btn', onNo));
  p.appendChild(a);
  s.appendChild(p);
}

export function settingsScreen(overlay: HTMLElement, st: Settings, onChange: (s: Settings) => void, back: () => void): void {
  const s = scrim(overlay, back);
  const p = el('div', 'panel');
  p.appendChild(el('h2', '', 'Settings'));
  const list = el('div', 'settings-list');
  const toggle = (label: string, key: 'reducedShake' | 'reducedFlashes' | 'lowEffects' | 'leftHanded') => {
    const row = el('div', 'setting', `<span>${label}</span>`);
    const b = button(st[key] ? 'On' : 'Off', `btn small ${st[key] ? 'equip' : ''}`, () => {
      st[key] = !st[key];
      b.textContent = st[key] ? 'On' : 'Off';
      b.className = `btn small ${st[key] ? 'equip' : ''}`;
      onChange(st);
    });
    row.appendChild(b);
    list.appendChild(row);
  };
  toggle('Reduced screen shake', 'reducedShake');
  toggle('Reduced flashes', 'reducedFlashes');
  toggle('Lower effects', 'lowEffects');
  toggle('Left-handed controls', 'leftHanded');
  const touchRow = el('div', 'setting', '<span>Touch controls</span>');
  const tb = button(st.showTouch, 'btn small', () => {
    st.showTouch = st.showTouch === 'auto' ? 'on' : st.showTouch === 'on' ? 'off' : 'auto';
    tb.textContent = st.showTouch;
    onChange(st);
  });
  touchRow.appendChild(tb);
  list.appendChild(touchRow);
  const vol = el('div', 'setting', '<span>Volume</span>');
  const range = el('input') as HTMLInputElement;
  range.type = 'range';
  range.min = '0';
  range.max = '1';
  range.step = '0.05';
  range.value = `${st.volume}`;
  range.addEventListener('input', () => {
    st.volume = parseFloat(range.value);
    onChange(st);
  });
  vol.appendChild(range);
  list.appendChild(vol);

  const backup = el('div', 'setting', '<span>Save backup</span>');
  const bwrap = el('div', 'actions');
  const area = el('textarea', 'code') as HTMLTextAreaElement;
  area.placeholder = 'Paste a backup code here to import';
  bwrap.append(
    button('Export', 'btn small', () => {
      area.value = exportBackup();
      area.select();
    }),
    button('Import', 'btn small', () => {
      if (area.value.trim() && importBackup(area.value)) {
        area.value = 'Imported. Reloading…';
        setTimeout(() => location.reload(), 600);
      } else area.value = 'That code could not be read.';
    }),
  );
  backup.appendChild(bwrap);
  list.appendChild(backup);
  list.appendChild(area);
  list.appendChild(el('div', 'muted', 'Saves live in this browser. Clearing site data removes them — export a backup to keep it safe.'));
  p.appendChild(list);
  p.appendChild(el('div', '', '<br>'));
  p.appendChild(button('Back', 'btn', back));
  s.appendChild(p);
}

export function upgradesScreen(overlay: HTMLElement, meta: Meta, onChange: () => void, back: () => void): void {
  const s = scrim(overlay, back);
  const p = el('div', 'panel recap');
  const render = () => {
    p.innerHTML = '';
    p.appendChild(el('h2', '', 'Upgrade Altar'));
    p.appendChild(el('div', 'big', `Embers: <b style="color:var(--gold)">${meta.embers}</b>`));
    const list = el('div', 'settings-list');
    for (const key of ['vigor', 'flask'] as const) {
      const u = UPGRADES[key];
      const rank = meta.upgrades[key];
      const row = el('div', 'upgrade');
      row.appendChild(el('div', '', `${u.name} <span class="pips">${'◆'.repeat(rank)}${'◇'.repeat(u.max - rank)}</span><div class="desc">${u.desc}</div>`));
      const cost = rank < u.max ? u.cost[rank] : 0;
      const b = button(rank >= u.max ? 'Max' : `${cost} embers`, 'btn small equip', () => {
        if (rank >= u.max || meta.embers < cost) return;
        meta.embers -= cost;
        meta.upgrades[key]++;
        onChange();
        render();
      });
      b.disabled = rank >= u.max || meta.embers < cost;
      row.appendChild(b);
      list.appendChild(row);
    }
    // Free respec of upgrade allocation.
    const spent = (['vigor', 'flask'] as const).reduce((sum, k) => sum + UPGRADES[k].cost.slice(0, meta.upgrades[k]).reduce((a, b) => a + b, 0), 0);
    if (spent > 0)
      list.appendChild(
        button(`Refund all (+${spent})`, 'btn small', () => {
          meta.embers += spent;
          meta.upgrades = { vigor: 0, flask: 0 };
          onChange();
          render();
        }),
      );
    list.appendChild(el('div', 'muted', 'Starting weapon (one basic weapon — not a full build):'));
    const starters = el('div', 'actions');
    for (const f of ['sword', 'daggers', 'hammer'] as WeaponFamily[]) {
      const unlocked = meta.unlocked.includes(f);
      const b = button(FAMILIES[f].label, `btn small ${meta.starter === f ? 'equip' : ''}`, () => {
        if (!unlocked) return;
        meta.starter = f;
        onChange();
        render();
      });
      b.disabled = !unlocked;
      b.title = STARTER_UNLOCK[f];
      starters.appendChild(b);
    }
    list.appendChild(starters);
    if (meta.unlocked.length < 3) list.appendChild(el('div', 'muted', meta.unlocked.includes('daggers') ? STARTER_UNLOCK.hammer : `${STARTER_UNLOCK.daggers}; ${STARTER_UNLOCK.hammer.toLowerCase()}.`));
    p.appendChild(list);
    p.appendChild(el('div', '', '<br>'));
    p.appendChild(button('Back', 'btn', back));
  };
  render();
  s.appendChild(p);
}

export interface RecapData {
  victory: boolean;
  floor: number;
  cause: string;
  kills: number;
  gold: number;
  embers: number;
  items: Item[];
  unlocks: string[];
  time: number;
}

export function recapScreen(overlay: HTMLElement, d: RecapData, cb: { again: () => void; title: () => void }): void {
  const s = scrim(overlay);
  const p = el('div', 'panel recap');
  p.appendChild(el('h2', '', d.victory ? 'Region cleared' : 'You have fallen'));
  p.appendChild(
    el(
      'div',
      'big',
      d.victory
        ? 'The Thorn Warden falls. The Verdant Ruins are yours — deeper regions are still being built.'
        : `Floor ${d.floor} · Verdant Ruins<br><span class="muted">Felled by ${d.cause || 'misfortune'}</span>`,
    ),
  );
  const build = el('div', 'build');
  for (const it of d.items) {
    const img = el('img') as HTMLImageElement;
    img.src = iconDataUrl(it, 2);
    img.title = it.name;
    build.appendChild(img);
  }
  p.appendChild(build);
  const mins = Math.floor(d.time / 60);
  const secs = Math.floor(d.time % 60);
  p.appendChild(
    el(
      'div',
      'rows',
      `<span>Floor reached</span><span>${d.floor}</span><span>Foes defeated</span><span>${d.kills}</span><span>Gold collected</span><span>${d.gold}</span><span>Time</span><span>${mins}:${String(secs).padStart(2, '0')}</span><span>Embers earned</span><span style="color:var(--gold)">+${d.embers} (kept)</span>`,
    ),
  );
  for (const u of d.unlocks) p.appendChild(el('div', 'unlock', `✦ ${u}`));
  const a = el('div', 'actions');
  const again = button(d.victory ? 'New run' : 'Try again', 'btn equip', cb.again);
  a.append(again, button('Title', 'btn', cb.title));
  p.appendChild(a);
  s.appendChild(p);
  setTimeout(() => again.focus(), 0);
}

export function rewardScreen(overlay: HTMLElement, items: Item[], synergy: (i: Item) => string[], pick: (i: Item) => void): void {
  const s = scrim(overlay);
  const p = el('div', 'panel');
  p.appendChild(el('h2', '', '<span class="orn">◆</span>Choose a reward<span class="orn">◆</span>'));
  const row = el('div', 'reward-row');
  for (const it of items) {
    const c = el('div', 'card found');
    c.appendChild(el('div', 'tag', `${RARITY_LABEL[it.rarity].toUpperCase()} ${(it.family ? FAMILIES[it.family].label : SLOT_LABEL[it.slot]).toUpperCase()}`));
    const n = el('div', 'name', it.name);
    n.style.color = `var(--r-${it.rarity})`;
    c.appendChild(n);
    c.appendChild(el('div', 'rarity', `<span class="gems" style="color:var(--r-${it.rarity})">${'◆'.repeat(RARITY_GEMS[it.rarity])}</span>`));
    c.appendChild(el('div', 'art', `<img src="${iconDataUrl(it, 4)}" alt="">`));
    const st = el('div', 'stats');
    if (it.damage) st.appendChild(el('div', 'stat', `<span class="k">Damage per hit</span><span class="v">${it.damage}</span>`));
    if (it.element !== 'none') st.appendChild(el('div', 'stat', `<span class="k">${it.element} buildup / hit</span><span class="v el-${it.element}">+${it.buildup}</span>`));
    if (it.defense) st.appendChild(el('div', 'stat', `<span class="k">Defence</span><span class="v">${it.defense}</span>`));
    for (const a of it.affixes) st.appendChild(el('div', 'affix', affixText(a)));
    c.appendChild(st);
    const syn = synergy(it);
    c.appendChild(el('div', 'innate', syn[0] ?? 'No direct synergy with your gear.'));
    c.addEventListener('click', () => pick(it));
    row.appendChild(c);
  }
  p.appendChild(row);
  p.appendChild(el('div', 'innate', 'You also recover some health. The chosen item goes to your backpack (or the ground if full).'));
  s.appendChild(p);
}

export function mapScreen(overlay: HTMLElement, draw: (cv: HTMLCanvasElement) => void, back: () => void): void {
  const s = scrim(overlay, back);
  const p = el('div', 'panel bigmap');
  p.appendChild(el('h2', '', 'Map'));
  const cv = el('canvas') as HTMLCanvasElement;
  draw(cv);
  p.appendChild(cv);
  p.appendChild(
    el(
      'div',
      'legend',
      '<span style="color:#7affb0">■ You</span><span style="color:#ffd36a">■ Stairs</span><span style="color:#e0b04a">■ Chest</span><span style="color:#5ae0d0">■ Spring</span><span>■ Item left behind</span>',
    ),
  );
  p.appendChild(el('div', '', '<br>'));
  p.appendChild(button('Close', 'btn', back));
  s.appendChild(p);
}
