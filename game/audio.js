// All sound is synthesised. Everything routes through one master gain so the volume setting applies everywhere.
let ac = null, master = null, volume = 0.8;
const layers = {};   // long-running beds: name -> {gain, stop()}

export function init() {
  if (ac) return;
  ac = new AudioContext();
  master = ac.createGain(); master.gain.value = volume; master.connect(ac.destination);
}
export function setVolume(v) { volume = v; if (master) master.gain.setTargetAtTime(v, ac.currentTime, .05); }
export const ready = () => !!ac;

function noiseBuffer(seconds, brown = true) {
  const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = brown ? (last = (last + .02 * w) / 1.02) * 3 : w;
  }
  return buf;
}
function bed(name, build, fadeIn = 2) {
  if (!ac || layers[name]) return;
  const gain = ac.createGain(); gain.gain.value = 0; gain.connect(master);
  const nodes = build(gain);
  gain.gain.setTargetAtTime(1, ac.currentTime, fadeIn / 3);
  layers[name] = { gain, stop: () => nodes.forEach(n => { try { n.stop(); } catch (e) {} }) };
}
export function fadeOut(name, seconds = 2) {
  const l = layers[name]; if (!l) return;
  delete layers[name];
  l.gain.gain.setTargetAtTime(0, ac.currentTime, seconds / 3);
  setTimeout(l.stop, seconds * 1000 + 200);
  if (l.timer) clearInterval(l.timer);
}

// Low machine hum of the cryo bay.
export function startBay() {
  bed('bay', out => {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; lp.connect(out);
    const nodes = [46, 46.7, 92.3].map(f => {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = ac.createGain(); g.gain.value = .035; o.connect(g); g.connect(lp); o.start(); return o;
    });
    const n = ac.createBufferSource(); n.buffer = noiseBuffer(2); n.loop = true;
    const nl = ac.createBiquadFilter(); nl.type = 'lowpass'; nl.frequency.value = 500;
    const ng = ac.createGain(); ng.gain.value = .25; n.connect(nl); nl.connect(ng); ng.connect(out); n.start();
    return [...nodes, n];
  }, 3);
}

// Title theme: a slow minor pad under sparse bell notes in a long echo.
export function startTitle() {
  bed('title', out => {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = .7; lp.connect(out);
    const lfo = ac.createOscillator(), lfoG = ac.createGain();
    lfo.frequency.value = .05; lfoG.gain.value = 380; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    const pad = [55, 110, 164.81, 220.4, 246.94, 329.63].map((f, i) => {
      const o = ac.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 2.5) * 4;
      const g = ac.createGain(); g.gain.value = i === 0 ? .06 : .028; o.connect(g); g.connect(lp); o.start(); return o;
    });
    return [lfo, ...pad];
  }, 6);
  const notes = [440, 523.25, 587.33, 659.25, 783.99, 880];
  const delay = ac.createDelay(2), fb = ac.createGain(), wet = ac.createGain();
  delay.delayTime.value = .62; fb.gain.value = .55; wet.gain.value = .5;
  delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(layers.title.gain);
  const ping = () => {
    if (!layers.title) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = notes[Math.floor(Math.random() * notes.length)];
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 3.5);
    o.connect(g); g.connect(layers.title.gain); g.connect(delay); o.start(t); o.stop(t + 3.6);
  };
  setTimeout(ping, 2500);
  layers.title.timer = setInterval(() => { if (Math.random() < .6) ping(); }, 3800);
}

// Deep swell for the opening exterior shots.
export function startVoid() {
  bed('void', out => {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.connect(out);
    const os = [36.7, 55, 73.4].map((f, i) => {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = i * 6;
      const g = ac.createGain(); g.gain.value = .045; o.connect(g); g.connect(lp); o.start(); return o;
    });
    const n = ac.createBufferSource(); n.buffer = noiseBuffer(3); n.loop = true;
    const ng = ac.createGain(); ng.gain.value = .12; n.connect(ng); ng.connect(lp); n.start();
    return [...os, n];
  }, 5);
}

// Heartbeat: two muffled thumps per beat, slowing down over time.
export function startHeart(bpm = 52) {
  bed('heart', out => {
    let next = ac.currentTime + .2, rate = bpm;
    const thump = (t, amp) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(38, t + .14);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + .22);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + .25);
    };
    const sched = setInterval(() => {
      while (next < ac.currentTime + .3) { thump(next, .5); thump(next + .26, .32); next += 60 / rate; rate = Math.max(44, rate - .4); }
    }, 100);
    return [{ stop: () => clearInterval(sched) }];
  }, .5);
}

// Soft two-tone alert, as heard from inside a sealed pod.
export function startAlarm() {
  bed('alarm', out => {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(out);
    let i = 0;
    const beep = () => {
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square'; o.frequency.value = i++ % 2 ? 660 : 880;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.04, t + .01); g.gain.setValueAtTime(.04, t + .22); g.gain.linearRampToValueAtTime(0, t + .26);
      o.connect(g); g.connect(lp); o.start(t); o.stop(t + .3);
    };
    beep(); const iv = setInterval(beep, 520);
    return [{ stop: () => clearInterval(iv) }];
  }, .2);
}

export function blip(ch, freq = 540) {
  if (!ac || ch === ' ') return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = 'sine'; o.frequency.value = freq * (1 + (ch.charCodeAt(0) % 7) * .025);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.045, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + .06);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + .07);
}
export function clunk() {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = 'triangle'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + .5);
  g.gain.setValueAtTime(.25, t); g.gain.exponentialRampToValueAtTime(.001, t + .7);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + .8);
}
// Pressure release as a pod seal breaks.
export function hiss(seconds = 1.8) {
  if (!ac) return;
  const t = ac.currentTime, n = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noiseBuffer(seconds + .2, false);
  hp.type = 'highpass'; hp.frequency.setValueAtTime(3000, t); hp.frequency.exponentialRampToValueAtTime(900, t + seconds);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .04); g.gain.exponentialRampToValueAtTime(.001, t + seconds);
  n.connect(hp); hp.connect(g); g.connect(master); n.start(t); n.stop(t + seconds + .2);
  clunk();
}
// Menu hover/select tick.
export function tick(high = false) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = 'sine'; o.frequency.value = high ? 1320 : 990;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.03, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .08);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + .1);
}
