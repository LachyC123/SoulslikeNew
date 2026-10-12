export type Element = 'none' | 'poison' | 'frost' | 'burn' | 'shock';
export type StatusEl = Exclude<Element, 'none'>;
export const STATUS_ELS: StatusEl[] = ['poison', 'frost', 'burn', 'shock'];

/** Name used in effect text ("venom nova", "storm bolts"). 'none' effects are arcane. */
export const EL_ADJ: Record<Element, string> = { none: 'arcane', poison: 'venom', frost: 'frost', burn: 'fire', shock: 'storm' };
export const EL_STATUS: Record<StatusEl, string> = { poison: 'Poison', frost: 'Frost', burn: 'Burn', shock: 'Shock' };
export const EL_GLOW: Record<Element, string> = { none: '#d8b8ff', poison: '#9cf05a', frost: '#9ae8ff', burn: '#ffae4a', shock: '#fff27a' };
export const EL_RGB: Record<Element, string> = { none: '200, 160, 255', poison: '150, 240, 90', frost: '140, 220, 255', burn: '255, 150, 60', shock: '255, 240, 120' };
export const EL_CSS: Record<Element, string> = { none: 'var(--arcane)', poison: 'var(--poison)', frost: 'var(--frost)', burn: 'var(--burn)', shock: 'var(--shock)' };
export const EL_ICON: Record<Element, string> = { none: '✦', poison: '☘', frost: '❄', burn: '🔥︎', shock: 'ϟ' };

/** Blade/metal ramps per element, dark → light. */
export const EL_RAMP: Record<Element, string[]> = {
  none: ['#4a5262', '#7d889a', '#b8c2d0', '#eef2f8'],
  poison: ['#1c4a22', '#358a34', '#6cc444', '#c4f08a'],
  frost: ['#24507e', '#418fc6', '#84d2f4', '#e2f8ff'],
  burn: ['#6a1e10', '#b8441c', '#f08a2a', '#ffe08a'],
  shock: ['#4a3a8a', '#7a6ad8', '#c0b0ff', '#fffad0'],
};
