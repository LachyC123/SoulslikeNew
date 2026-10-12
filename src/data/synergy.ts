import { EL_STATUS, StatusEl, STATUS_ELS } from './elements';
import { FAMILIES, Item } from './items';

export interface Loadout {
  weapons: [Item | null, Item | null];
  chest: Item | null;
  boots: Item | null;
  rings: [Item | null, Item | null];
  relic: Item | null;
}

export function loadoutItems(l: Loadout): Item[] {
  return [...l.weapons, l.chest, l.boots, ...l.rings, l.relic].filter((i): i is Item => !!i);
}

type Need = StatusEl | 'shatter' | 'crit' | 'skill' | 'dodge' | 'kill';

function provides(i: Item): Set<Need> {
  const s = new Set<Need>();
  if (i.element !== 'none' && i.slot === 'weapon') s.add(i.element as StatusEl);
  if (i.element2 && i.element2 !== 'none') s.add(i.element2 as StatusEl);
  if (i.relic && i.relic.el !== 'none') s.add(i.relic.el as StatusEl);
  if (i.family && (FAMILIES[i.family].heavy || i.family === 'axe' || i.family === 'scythe')) s.add('shatter');
  for (const p of i.props) {
    if (p.k === 'proc' && p.el !== 'none' && p.effect !== 'echo') s.add(p.el as StatusEl);
    if (p.k === 'stat' && (p.stat === 'crit' || p.stat === 'critDmg')) s.add('crit');
    if (p.k === 'stat' && (p.stat === 'skillCd' || p.stat === 'skillDmg')) s.add('skill');
    if (p.k === 'stat' && p.stat === 'dodgeCd') s.add('dodge');
  }
  return s;
}

function needs(i: Item): Map<Need, string> {
  const m = new Map<Need, string>();
  for (const p of i.props) {
    if (p.k === 'cond') {
      const map: Partial<Record<string, [StatusEl, string]>> = {
        vsPoison: ['poison', 'its bonus against poisoned foes'],
        vsFrozen: ['frost', 'its bonus against frozen foes'],
        vsBurning: ['burn', 'its bonus against burning foes'],
        vsShocked: ['shock', 'its bonus against shocked foes'],
      };
      const hit = map[p.cond];
      if (hit) m.set(hit[0], hit[1]);
    }
    if (p.k === 'proc') {
      if (p.trig === 'status' && p.statusEl) m.set(p.statusEl, `its "${EL_STATUS[p.statusEl]}" effect`);
      if (p.trig === 'shatter') {
        m.set('shatter', 'its shatter effect');
        m.set('frost', 'its shatter effect');
      }
      if (p.trig === 'crit') m.set('crit', 'its critical-hit effect');
      if (p.trig === 'skill') m.set('skill', 'its skill effect');
      if (p.trig === 'dodge') m.set('dodge', 'its dodge effect');
    }
  }
  return m;
}

const LABEL: Record<Need, string> = { poison: 'poison', frost: 'frost', burn: 'burn', shock: 'shock', shatter: 'shatters', crit: 'critical hits', skill: 'skill use', dodge: 'dodging', kill: 'kills' };

/**
 * Plain-language explanations of how a candidate item connects to the rest of the build.
 * `others` are the items that would remain equipped alongside the candidate.
 */
export function synergiesFor(item: Item, others: Item[]): string[] {
  const out: string[] = [];
  const myP = provides(item);
  const myN = needs(item);
  for (const o of others) {
    const oP = provides(o);
    const oN = needs(o);
    for (const [need, what] of oN) if (myP.has(need)) out.push(`This brings ${LABEL[need]}, which powers ${o.name} (${what}).`);
    for (const [need, what] of myN) if (oP.has(need)) out.push(`${o.name} brings ${LABEL[need]}, which powers ${what}.`);
    // Freeze-and-shatter pairing.
    if (myP.has('frost') && oP.has('shatter') && o !== item) out.push(`Freeze foes with this, then shatter them with ${o.name}.`);
    if (myP.has('shatter') && oP.has('frost')) out.push(`${o.name} freezes foes; this shatters them.`);
  }
  if (myP.has('frost') && myP.has('shatter')) out.push('This weapon both freezes and shatters on its own.');
  // Shared element focus.
  if (!out.length) {
    for (const el of STATUS_ELS) {
      if (!myP.has(el)) continue;
      const mate = others.find((o) => provides(o).has(el));
      if (mate) {
        out.push(`Stacks ${EL_STATUS[el].toLowerCase()} with ${mate.name}.`);
        break;
      }
    }
  }
  return [...new Set(out)].slice(0, 2);
}
