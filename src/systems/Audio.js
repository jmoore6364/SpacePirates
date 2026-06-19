// Procedural WebAudio: all SFX + an ambient music drone are synthesized, so the
// game ships with zero audio assets. Everything is guarded — if WebAudio is
// unavailable or suspended (autoplay policy), calls are no-ops until resume().
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.musicGain = null;
    this._musicNodes = [];
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.0;
        this.musicGain.connect(this.master);
      }
    } catch { this.ctx = null; }
  }

  // Call from a user gesture to satisfy autoplay policies.
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  _now() { return this.ctx ? this.ctx.currentTime : 0; }

  _blip({ type = 'sine', freq = 440, dur = 0.12, gain = 0.3, sweep = 0, dest = null }) {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise({ dur = 0.4, gain = 0.5, lowpass = 1200 }) {
    if (!this.ctx || this.muted) return;
    const t = this._now();
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  laser() { this._blip({ type: 'square', freq: 880, dur: 0.12, gain: 0.12, sweep: -720 }); }
  hit()   { this._blip({ type: 'sawtooth', freq: 220, dur: 0.18, gain: 0.18, sweep: -140 }); }
  explosion() { this._noise({ dur: 0.6, gain: 0.4, lowpass: 900 }); this._blip({ type: 'sine', freq: 120, dur: 0.5, gain: 0.25, sweep: -80 }); }
  blip()  { this._blip({ type: 'triangle', freq: 660, dur: 0.08, gain: 0.18 }); }
  warp()  { this._blip({ type: 'sine', freq: 220, dur: 0.6, gain: 0.25, sweep: 900 }); }

  startMusic() {
    if (!this.ctx || this._musicNodes.length) return;
    // slow detuned drone pad
    const base = [55, 82.5, 110]; // A1 / E2 / A2
    const t = this._now();
    for (const f of base) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = 0.08;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 400;
      // slow LFO on the filter for movement
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.05;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain).connect(filt.frequency);
      osc.connect(filt).connect(g).connect(this.musicGain);
      osc.start(t); lfo.start(t);
      this._musicNodes.push(osc, lfo);
    }
    this.musicGain.gain.setTargetAtTime(0.6, t, 2);
  }
}
