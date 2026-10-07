/**
 * Zero-Dependency Procedural Web Audio API Sound Synthesizer
 * Built according to doc/Modernize.md section 1
 * Synthesizes pure game-show tones directly in the browser with 0ms trigger latency.
 */

let audioCtx = null;
let isMuted = false;

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function initAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

export function toggleMute() {
  isMuted = !isMuted;
  return isMuted;
}

export function setMuted(val) {
  isMuted = Boolean(val);
  return isMuted;
}

export function getMuteStatus() {
  return isMuted;
}

/**
 * 3-2-1 Countdown Beeps
 * 440Hz sine wave for 3, 2; 880Hz high beep on GO
 */
export function playCountdownBeep(count) {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const isGo = count === 0 || count === 'GO';
  osc.type = 'sine';
  osc.frequency.setValueAtTime(isGo ? 880 : 440, now);

  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.45 : 0.25));

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + (isGo ? 0.5 : 0.3));
}

/**
 * Buzzer Strike Event
 * Sharp, high-impact TV buzzer ding when a team buzzes in
 */
export function playBuzzerStrike() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Punchy dual tone (sine + square for presence)
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(587.33, now); // D5
  osc1.frequency.exponentialRampToValueAtTime(880, now + 0.1);

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(293.66, now); // D4

  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.38);
  osc2.stop(now + 0.38);
}

/**
 * Correct Answer Fanfare
 * Major triad chord arpeggio (C5 -> E5 -> G5 -> C6)
 */
export function playCorrect() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const noteStart = now + idx * 0.08;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, noteStart);

    gain.gain.setValueAtTime(0, noteStart);
    gain.gain.linearRampToValueAtTime(0.3, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(noteStart);
    osc.stop(noteStart + 0.45);
  });
}

/**
 * Wrong Answer Buzzer
 * Dissonant low frequency saw-tooth buzzer (160Hz -> 100Hz)
 */
export function playWrong() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(140, now);
  osc1.frequency.linearRampToValueAtTime(90, now + 0.4);

  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(148, now); // Dissonant beating
  osc2.frequency.linearRampToValueAtTime(95, now + 0.4);

  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.52);
  osc2.stop(now + 0.52);
}

/**
 * Rapid Fire Metronome Clock Tick
 */
export function playTick() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);

  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.06);
}

/**
 * Times Up Alarm / Gong
 */
export function playTimesUp() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Deep resonant gong
  [180, 240, 320].forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 1.3);
  });
}

/**
 * Final Winner Victory Fanfare
 */
export function playFanfare() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // Heroic brass arpeggio
  const melody = [
    { freq: 523.25, time: 0.0, dur: 0.2 }, // C5
    { freq: 659.25, time: 0.2, dur: 0.2 }, // E5
    { freq: 783.99, time: 0.4, dur: 0.25 }, // G5
    { freq: 1046.5, time: 0.65, dur: 0.6 }, // C6
    { freq: 880.0, time: 1.3, dur: 0.2 }, // A5
    { freq: 1046.5, time: 1.5, dur: 1.0 } // C6 held
  ];

  melody.forEach((note) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + note.time;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note.freq, start);

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.35, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + note.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + note.dur + 0.05);
  });
}

export default {
  initAudio,
  toggleMute,
  getMuteStatus,
  playCountdownBeep,
  playBuzzerStrike,
  playCorrect,
  playWrong,
  playTick,
  playTimesUp,
  playFanfare
};
