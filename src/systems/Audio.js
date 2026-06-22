// Procedural WebAudio: all SFX + an ambient music drone are synthesized, so the
// game ships with zero audio assets. Everything is guarded — if WebAudio is
// unavailable or suspended (autoplay policy), calls are no-ops until resume().
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.musicGain = null;
    this.sfx = null;
    this._musicNodes = [];
    this._musicOn = false;
    this.vol = { master: 0.5, music: 0.6, sfx: 1.0 };
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.vol.master;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.0;
        this.musicGain.connect(this.master);
        this.sfx = this.ctx.createGain();
        this.sfx.gain.value = this.vol.sfx;
        this.sfx.connect(this.master);
      }
    } catch { this.ctx = null; }
  }

  // volumes in 0..1; master is also gated by mute
  setVolumes({ master, music, sfx } = {}) {
    if (master != null) this.vol.master = master;
    if (music != null) this.vol.music = music;
    if (sfx != null) this.vol.sfx = sfx;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.vol.master;
    if (this.sfx) this.sfx.gain.value = this.vol.sfx;
    if (this.musicGain && this._musicOn) this.musicGain.gain.value = this.vol.music * 0.6;
  }

  // Call from a user gesture to satisfy autoplay policies.
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.vol.master;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  _now() { return this.ctx ? this.ctx.currentTime : 0; }

  _blip({ type = 'sine', freq = 440, dur = 0.12, gain = 0.3, sweep = 0, dest = null }) {
    if (!this.ctx || this.muted) return;
    dest = dest || this.sfx;
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
    src.connect(filt).connect(g).connect(this.sfx || this.master);
    src.start(t);
    src.stop(t + dur);
  }

  laser() { this._blip({ type: 'square', freq: 880, dur: 0.12, gain: 0.12, sweep: -720 }); }
  hit()   { this._blip({ type: 'sawtooth', freq: 220, dur: 0.18, gain: 0.18, sweep: -140 }); }
  explosion() { this._noise({ dur: 0.6, gain: 0.4, lowpass: 900 }); this._blip({ type: 'sine', freq: 120, dur: 0.5, gain: 0.25, sweep: -80 }); }
  blip()  { this._blip({ type: 'triangle', freq: 660, dur: 0.08, gain: 0.18 }); }
  warp()  { this._blip({ type: 'sine', freq: 220, dur: 0.6, gain: 0.25, sweep: 900 }); }
  // rising two-note flourish for an achievement unlock
  chime() {
    this._blip({ type: 'triangle', freq: 700, dur: 0.12, gain: 0.16 });
    setTimeout(() => this._blip({ type: 'triangle', freq: 1050, dur: 0.22, gain: 0.16, sweep: 220 }), 110);
  }

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
    this._musicOn = true;
    this.musicGain.gain.setTargetAtTime(this.vol.music * 0.6, t, 2);
  }
}
