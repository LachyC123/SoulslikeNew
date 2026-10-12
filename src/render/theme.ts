/** Region art direction expressed as palettes. Only Verdant Ruins is in the first slice. */
export interface RegionTheme {
  id: string;
  name: string;
  stone: string[];
  mortar: string;
  moss: string[];
  mossAmount: number;
  water: string[];
  waterHi: string;
  face: string[];
  ledge: string;
  topStone: string[];
  foliage: string[];
  foliageHi: string;
  void: string[];
  coping: string;
  inlay: string;
  flowers: string[];
  banner: string[];
  beams: boolean;
  /** Ambient light tint multiplied over the scene (rgba). */
  ambient: string;
  beamColor: string;
  torchColor: string;
}

export const VERDANT: RegionTheme = {
  id: 'verdant',
  name: 'Verdant Ruins',
  stone: ['#615c4b', '#7e7864', '#9b957c', '#b4ae93', '#cac4a8'],
  mortar: '#4c4839',
  moss: ['#3a6224', '#527f2e', '#6c9d38', '#8dba4a'],
  mossAmount: 0.74,
  water: ['#0f4e5a', '#146470', '#1b7f88', '#24a0a2', '#3cc2b8', '#6fdcce'],
  waterHi: '#a8f2e4',
  face: ['#55503f', '#6e6955', '#8a846c', '#a39d84', '#bbb59b'],
  ledge: '#c9c3a6',
  topStone: ['#2f2c25', '#3d3a31', '#4c483d', '#5c574a'],
  foliage: ['#1b3218', '#24421d', '#2f5623', '#3d6c2b', '#4f8434', '#66a03e'],
  foliageHi: '#a6d860',
  void: ['#070b08', '#0b120c', '#101a11', '#152416', '#1b2e1b'],
  coping: '#bdb79b',
  inlay: '#6d9a86',
  flowers: ['#f8ece0', '#ffd6c4', '#fff2a6', '#e8d2ff'],
  banner: ['#1f6d66', '#2a7d74', '#1d5a62'],
  beams: true,
  ambient: 'rgba(255, 236, 200, 0.0)',
  beamColor: '255, 240, 190',
  torchColor: '255, 190, 100',
};
