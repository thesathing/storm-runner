// Storm Runner — audio: everything synthesised with WebAudio at runtime,
// no sound files. Engine hum follows throttle, thunder rumbles on a strike,
// a chime marks a ring, a beep warns of stall or low fuel.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 70;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function setEngine(throttle, speed, storm) {
    if (!started || !ctx) return;
    const t = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(55 + throttle * 70 + speed * 0.35, t, 0.1);
    engineGain.gain.setTargetAtTime(0.02 + throttle * 0.05 + storm * 0.012, t, 0.1);
  }

  function blip(freq, dur, gainValue, type) {
    if (!ensure()) return;
    try {
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gainValue, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch { /* audio is optional */ }
  }

  function thunder() {
    if (!ensure()) return;
    try {
      const dur = 1.6;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 160;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      src.start();
    } catch { /* audio is optional */ }
  }

  return {
    unlock: ensure,
    setEngine,
    ring: () => { blip(880, 0.25, 0.18); blip(1320, 0.35, 0.12); },
    warning: () => blip(440, 0.18, 0.15, 'square'),
    thunder,
    land: () => { blip(330, 0.3, 0.2); blip(495, 0.4, 0.15); },
  };
}
