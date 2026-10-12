import type { SoundId } from '../sim/world';

/** Procedural WebAudio sound effects: no external assets required. */
export class Sfx {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SoundId, number>();
  private active = 0;
  private ambience: { stop: () => void } | null = null;
  volume = 0.7;

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock(): void {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ac.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ac.destination);
      const len = this.ac.sampleRate;
      this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ac = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  suspend(): void {
    if (this.ac && this.ac.state === 'running') void this.ac.suspend();
  }

  resume(): void {
    if (this.ac && this.ac.state === 'suspended') void this.ac.resume();
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const ac = this.ac!;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const gn = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn);
    gn.connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
    this.track(dur);
  }

  private hiss(filter: BiquadFilterType, freq: number, q: number, dur: number, vol: number, sweepTo?: number, delay = 0) {
    const ac = this.ac!;
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    const f = ac.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(gn);
    gn.connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    this.track(dur);
  }

  private track(dur: number) {
    this.active++;
    setTimeout(() => this.active--, dur * 1000 + 30);
  }

  play(id: SoundId, vol = 1): void {
    if (!this.ac || !this.master || this.ac.state !== 'running') return;
    // Limit concurrent and repeated sounds.
    const now = performance.now();
    const minGap = id === 'gold' ? 40 : id === 'hit' ? 30 : 15;
    if ((this.last.get(id) ?? 0) + minGap > now || this.active > 24) return;
    this.last.set(id, now);
    const v = vol;
    switch (id) {
      case 'swing':
        this.hiss('bandpass', 1800, 1.2, 0.12, 0.25 * v, 4000);
        break;
      case 'swingHeavy':
        this.hiss('bandpass', 500, 1, 0.25, 0.35 * v, 1400);
        break;
      case 'hit':
        this.tone('square', 220, 90, 0.08, 0.18 * v);
        this.hiss('lowpass', 2500, 0.7, 0.06, 0.25 * v);
        break;
      case 'crit':
        this.tone('square', 440, 140, 0.1, 0.18 * v);
        this.tone('triangle', 1320, 880, 0.12, 0.12 * v);
        this.hiss('highpass', 3000, 0.7, 0.07, 0.2 * v);
        break;
      case 'heavyHit':
        this.tone('sine', 140, 40, 0.3, 0.6 * v);
        this.hiss('lowpass', 900, 0.8, 0.22, 0.45 * v, 200);
        break;
      case 'shatter':
        this.hiss('highpass', 4000, 0.8, 0.35, 0.4 * v, 1500);
        for (let i = 0; i < 4; i++) this.tone('triangle', 1800 + i * 600, 1200 + i * 300, 0.12, 0.08 * v, i * 0.03);
        this.tone('sine', 120, 50, 0.25, 0.4 * v);
        break;
      case 'freeze':
        this.tone('triangle', 1400, 2600, 0.18, 0.1 * v);
        this.hiss('highpass', 5000, 1, 0.2, 0.15 * v);
        break;
      case 'poison':
        for (let i = 0; i < 3; i++) this.tone('sine', 300 + i * 90, 600 + i * 120, 0.08, 0.08 * v, i * 0.05);
        break;
      case 'dodge':
        this.hiss('bandpass', 700, 0.9, 0.18, 0.2 * v, 2400);
        break;
      case 'hurt':
        this.tone('sawtooth', 260, 70, 0.2, 0.22 * v);
        this.hiss('lowpass', 1200, 1, 0.15, 0.3 * v);
        break;
      case 'enemyWarn':
        this.tone('triangle', 520, 780, 0.1, 0.07 * v);
        break;
      case 'shoot':
        this.tone('sine', 900, 300, 0.15, 0.1 * v);
        break;
      case 'death':
        this.tone('triangle', 300, 60, 0.3, 0.15 * v);
        this.hiss('lowpass', 1500, 1, 0.25, 0.15 * v, 300);
        break;
      case 'pickup':
        [660, 880, 1320].forEach((f, i) => this.tone('square', f, f, 0.07, 0.06 * v, i * 0.05));
        break;
      case 'gold':
        this.tone('square', 1760, 1760, 0.04, 0.04 * v);
        this.tone('square', 2640, 2640, 0.06, 0.04 * v, 0.04);
        break;
      case 'chest':
        this.tone('triangle', 200, 120, 0.15, 0.2 * v);
        [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.08 * v, 0.1 + i * 0.06));
        break;
      case 'heal':
        [392, 523, 659, 784].forEach((f, i) => this.tone('sine', f, f * 1.01, 0.22, 0.08 * v, i * 0.06));
        break;
      case 'skill':
        this.tone('triangle', 300, 900, 0.15, 0.1 * v);
        break;
      case 'swap':
        this.tone('square', 600, 900, 0.05, 0.05 * v);
        this.hiss('highpass', 3000, 1, 0.05, 0.08 * v);
        break;
      case 'stairs':
        [784, 659, 523, 392].forEach((f, i) => this.tone('triangle', f, f, 0.2, 0.08 * v, i * 0.08));
        break;
      case 'bossRoar':
        this.tone('sawtooth', 90, 45, 0.9, 0.35 * v);
        this.hiss('lowpass', 600, 1.5, 0.9, 0.35 * v, 150);
        break;
      case 'erupt':
        this.tone('sine', 110, 50, 0.25, 0.35 * v);
        this.hiss('bandpass', 800, 1, 0.2, 0.25 * v);
        break;
      case 'gate':
        this.tone('square', 80, 60, 0.4, 0.25 * v);
        this.hiss('lowpass', 400, 1, 0.4, 0.3 * v);
        break;
      case 'ui':
        this.tone('square', 880, 880, 0.03, 0.04 * v);
        break;
    }
  }

  /** Gentle generative garden ambience: soft pad + occasional bird chirps and water. */
  startAmbience(): void {
    if (!this.ac || !this.master || this.ambience) return;
    const ac = this.ac;
    const out = ac.createGain();
    out.gain.value = 0.0001;
    out.gain.exponentialRampToValueAtTime(0.5, ac.currentTime + 3);
    out.connect(this.master);
    const oscs: OscillatorNode[] = [];
    [130.81, 196, 261.63, 329.63].forEach((f, i) => {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.03;
      const lg = ac.createGain();
      lg.gain.value = 0.012;
      const gn = ac.createGain();
      gn.gain.value = 0.018;
      lfo.connect(lg);
      lg.connect(gn.gain);
      o.connect(gn);
      gn.connect(out);
      o.start();
      lfo.start();
      oscs.push(o, lfo);
    });
    // Running water bed.
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1200;
    f.Q.value = 0.4;
    const wg = ac.createGain();
    wg.gain.value = 0.02;
    src.connect(f);
    f.connect(wg);
    wg.connect(out);
    src.start();
    const birds = setInterval(() => {
      if (!this.ac || this.ac.state !== 'running' || Math.random() < 0.5) return;
      const base = 2200 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.tone('sine', base, base * (1.2 + Math.random() * 0.3), 0.06, 0.012, i * 0.09);
    }, 2300);
    this.ambience = {
      stop: () => {
        clearInterval(birds);
        out.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.5);
        setTimeout(() => {
          oscs.forEach((o) => o.stop());
          src.stop();
          out.disconnect();
        }, 600);
      },
    };
  }

  stopAmbience(): void {
    this.ambience?.stop();
    this.ambience = null;
  }
}
