/**
 * Web Audio API Dub Techno Synthesizer, Multi-Mode Drum & Bass Engines,
 * Dedicated Ping-Pong Tape Delay + Dark Warehouse Reverb, 9-Channel Dub Mixer,
 * Lookahead Scheduler, and Offline Stem/Sum Renderer.
 */

import { midiToFreq, voiceChord } from './theory.js';
import { getStepStartInSixteenths } from './sequencer.js';
import { getBassMidiNote } from './bass.js';

export const SOURCE_CHANNEL_IDS = ['chords', 'bass', 'kick', 'rim', 'ch', 'oh'];

/**
 * Map normalized UI fader position (0..1) through an audio-taper curve so perceived
 * loudness changes evenly across the full throw instead of dropping off at the bottom.
 */
export function faderToGain(norm) {
  const clamped = Math.max(0, Math.min(1, Number(norm) || 0));
  if (clamped <= 0.001) return 0;
  return Math.pow(clamped, 2.2);
}

// 8 Chord Synth Sound Presets (separated from Delay & Reverb)
export const SOUND_PRESETS = {
  'basic-channel': {
    id: 'basic-channel',
    name: 'Basic Channel',
    cutoff: 240,
    envAmount: 1950,
    resonance: 4.2,
    envDecay: 0.34,
    ampAttack: 0.008,
    detune: 9,
    subLevel: 0.28,
    drive: 0.25
  },
  'robert-hood': {
    id: 'robert-hood',
    name: 'Robert Hood',
    cutoff: 320,
    envAmount: 2400,
    resonance: 3.4,
    envDecay: 0.16,
    ampAttack: 0.003,
    detune: 5,
    subLevel: 0.22,
    drive: 0.35
  },
  shed: {
    id: 'shed',
    name: 'Shed / Wax',
    cutoff: 290,
    envAmount: 2250,
    resonance: 5.8,
    envDecay: 0.24,
    ampAttack: 0.005,
    detune: 12,
    subLevel: 0.3,
    drive: 0.52
  },
  deepchord: {
    id: 'deepchord',
    name: 'Deepchord',
    cutoff: 190,
    envAmount: 1550,
    resonance: 4.8,
    envDecay: 0.52,
    ampAttack: 0.022,
    detune: 14,
    subLevel: 0.36,
    drive: 0.2
  },
  maurizio: {
    id: 'maurizio',
    name: 'Maurizio',
    cutoff: 265,
    envAmount: 2100,
    resonance: 4.6,
    envDecay: 0.29,
    ampAttack: 0.006,
    detune: 8,
    subLevel: 0.32,
    drive: 0.3
  },
  'rhythm-sound': {
    id: 'rhythm-sound',
    name: 'Rhythm & Sound',
    cutoff: 175,
    envAmount: 1450,
    resonance: 3.9,
    envDecay: 0.44,
    ampAttack: 0.012,
    detune: 11,
    subLevel: 0.42,
    drive: 0.18
  },
  monolake: {
    id: 'monolake',
    name: 'Monolake',
    cutoff: 340,
    envAmount: 2550,
    resonance: 5.2,
    envDecay: 0.18,
    ampAttack: 0.002,
    detune: 4,
    subLevel: 0.2,
    drive: 0.15
  },
  pole: {
    id: 'pole',
    name: 'Pole',
    cutoff: 210,
    envAmount: 1780,
    resonance: 6.4,
    envDecay: 0.31,
    ampAttack: 0.007,
    detune: 10,
    subLevel: 0.3,
    drive: 0.44
  }
};

export const DELAY_MS_MIN = 20;
export const DELAY_MS_MAX = 1500;

export const DELAY_SUBDIVS = [
  { id: '1/8', label: '1/8', sixteenths: 2 },
  { id: '3/16', label: '1/8d (3/16)', sixteenths: 3 },
  { id: '1/4', label: '1/4', sixteenths: 4 },
  { id: '3/8', label: '1/4d (3/8)', sixteenths: 6 }
];

export function delaySubdivToMs(subdivId, bpm = 126) {
  const subdiv = DELAY_SUBDIVS.find((d) => d.id === subdivId) || DELAY_SUBDIVS[1];
  const sixteenthMs = (60 / Math.max(40, bpm) / 4) * 1000;
  return Math.round(Math.max(DELAY_MS_MIN, Math.min(DELAY_MS_MAX, subdiv.sixteenths * sixteenthMs)));
}

// 8 Dedicated Dub FX Presets (Tape Delay + Dark Warehouse Reverb)
export const FX_PRESETS = {
  'basic-channel': {
    id: 'basic-channel',
    name: 'Basic Channel',
    delayMs: 357,
    delayFeedback: 0.62,
    tapeTone: 1850,
    tapeFlutter: 0.35,
    delayToReverb: 0.42,
    reverbDecay: 3.4,
    reverbTone: 3200
  },
  'robert-hood': {
    id: 'robert-hood',
    name: 'Robert Hood',
    delayMs: 238,
    delayFeedback: 0.34,
    tapeTone: 3100,
    tapeFlutter: 0.12,
    delayToReverb: 0.2,
    reverbDecay: 1.6,
    reverbTone: 4600
  },
  shed: {
    id: 'shed',
    name: 'Shed / Wax',
    delayMs: 345,
    delayFeedback: 0.52,
    tapeTone: 2250,
    tapeFlutter: 0.45,
    delayToReverb: 0.36,
    reverbDecay: 2.5,
    reverbTone: 3600
  },
  deepchord: {
    id: 'deepchord',
    name: 'Deepchord',
    delayMs: 714,
    delayFeedback: 0.74,
    tapeTone: 1450,
    tapeFlutter: 0.55,
    delayToReverb: 0.6,
    reverbDecay: 4.8,
    reverbTone: 2400
  },
  maurizio: {
    id: 'maurizio',
    name: 'Maurizio',
    delayMs: 360,
    delayFeedback: 0.58,
    tapeTone: 2050,
    tapeFlutter: 0.28,
    delayToReverb: 0.38,
    reverbDecay: 2.9,
    reverbTone: 3300
  },
  'rhythm-sound': {
    id: 'rhythm-sound',
    name: 'Rhythm & Sound',
    delayMs: 375,
    delayFeedback: 0.76,
    tapeTone: 1380,
    tapeFlutter: 0.48,
    delayToReverb: 0.55,
    reverbDecay: 4.2,
    reverbTone: 2200
  },
  monolake: {
    id: 'monolake',
    name: 'Monolake',
    delayMs: 476,
    delayFeedback: 0.48,
    tapeTone: 3600,
    tapeFlutter: 0.08,
    delayToReverb: 0.3,
    reverbDecay: 2.4,
    reverbTone: 4800
  },
  pole: {
    id: 'pole',
    name: 'Pole',
    delayMs: 680,
    delayFeedback: 0.68,
    tapeTone: 1620,
    tapeFlutter: 0.65,
    delayToReverb: 0.48,
    reverbDecay: 3.8,
    reverbTone: 2700
  }
};

/**
 * Pure Solo / Mute / Stem-isolation resolver for all mixer channels.
 */
export function computeChannelAudibility(mixer = {}, stemMode = 'sum') {
  const mutes = mixer.mutes || {};
  const solos = mixer.solos || {};

  if (stemMode && stemMode !== 'sum') {
    const out = { master: true, delay: false, reverb: false };
    for (const id of SOURCE_CHANNEL_IDS) {
      out[id] = {
        dry: stemMode === id,
        send: (stemMode === 'delay' || stemMode === 'reverb') && !mutes[id]
      };
    }
    if (stemMode === 'delay') out.delay = true;
    if (stemMode === 'reverb') out.reverb = true;
    return out;
  }

  const anyInstrSolo = SOURCE_CHANNEL_IDS.some((id) => Boolean(solos[id]));
  const anyFxSolo = Boolean(solos.delay || solos.reverb);
  const anySolo = anyInstrSolo || anyFxSolo;

  const out = {
    master: !mutes.master,
    delay: anyFxSolo ? Boolean(solos.delay && !mutes.delay) : !mutes.delay,
    reverb: anyFxSolo ? Boolean(solos.reverb && !mutes.reverb) : !mutes.reverb
  };

  for (const id of SOURCE_CHANNEL_IDS) {
    const instrAudible = (!anySolo || Boolean(solos[id])) && !mutes[id];
    out[id] = {
      dry: instrAudible,
      // When an FX return is soloed without any instrument solo, keep sends feeding FX so tails stay alive
      send: (anyFxSolo && !anyInstrSolo ? !mutes[id] : instrAudible)
    };
  }
  return out;
}

/**
 * Shared Web Audio synthesis & mixer graph usable on both AudioContext and OfflineAudioContext.
 */
export class DubSynthGraph {
  constructor(ctx, { createAnalyser = true } = {}) {
    this.ctx = ctx;
    this._shaperCache = {};
    this._lastReverbDecay = null;

    // Master bus + gentle compressor + optional analyser
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.85;

    const masterComp = ctx.createDynamicsCompressor();
    masterComp.threshold.value = -6;
    masterComp.knee.value = 12;
    masterComp.ratio.value = 3.5;
    masterComp.attack.value = 0.005;
    masterComp.release.value = 0.14;

    masterComp.connect(this.masterGain);
    this.channelAnalysers = {};
    this._meterScratch = createAnalyser ? new Uint8Array(128) : null;

    if (createAnalyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.45;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      this.channelAnalysers.master = this.analyser;
    } else {
      this.analyser = null;
      this.masterGain.connect(ctx.destination);
    }

    // FX Send collector buses
    this.delayInputBus = ctx.createGain();
    this.reverbInputBus = ctx.createGain();

    // --- 6 Instrument Channel Strips ---
    this.channels = {};
    for (const id of SOURCE_CHANNEL_IDS) {
      const input = ctx.createGain();
      const panner = ctx.createStereoPanner();
      const fader = ctx.createGain();
      const dryMute = ctx.createGain();
      const sendMute = ctx.createGain();
      const delaySend = ctx.createGain();
      const reverbSend = ctx.createGain();

      input.connect(panner);
      panner.connect(fader);
      fader.connect(dryMute);
      dryMute.connect(masterComp);

      if (createAnalyser) {
        const chAnalyser = ctx.createAnalyser();
        chAnalyser.fftSize = 128;
        chAnalyser.smoothingTimeConstant = 0.45;
        dryMute.connect(chAnalyser);
        this.channelAnalysers[id] = chAnalyser;
      }

      // Post-fader sends
      fader.connect(sendMute);
      sendMute.connect(delaySend);
      sendMute.connect(reverbSend);
      delaySend.connect(this.delayInputBus);
      reverbSend.connect(this.reverbInputBus);

      this.channels[id] = { input, panner, fader, dryMute, sendMute, delaySend, reverbSend };
    }

    // Chord Bus -> Tape Drive -> Warmth Filter -> Pre-Fader Trim -> channels.chords.input
    this.chordBus = ctx.createGain();
    this.chordBus.gain.value = 1.0;
    this.chordDrive = ctx.createWaveShaper();
    this.chordDrive.oversample = '2x';
    this._updateShaperCurve(this.chordDrive, 0.25, 'chordDrive');

    const chordWarmth = ctx.createBiquadFilter();
    chordWarmth.type = 'lowpass';
    chordWarmth.frequency.value = 9200;
    chordWarmth.Q.value = 0.5;

    const chordOutTrim = ctx.createGain();
    chordOutTrim.gain.value = 0.52;

    this.chordBus.connect(this.chordDrive);
    this.chordDrive.connect(chordWarmth);
    chordWarmth.connect(chordOutTrim);
    chordOutTrim.connect(this.channels.chords.input);

    // Bass Bus -> Warm Saturation -> Pre-Fader Trim -> channels.bass.input
    this.bassBus = ctx.createGain();
    this.bassBus.gain.value = 1.15;
    this.bassDrive = ctx.createWaveShaper();
    this.bassDrive.oversample = '2x';
    this._updateShaperCurve(this.bassDrive, 0.24, 'bassDrive');

    const bassOutTrim = ctx.createGain();
    bassOutTrim.gain.value = 0.56;

    this.bassBus.connect(this.bassDrive);
    this.bassDrive.connect(bassOutTrim);
    bassOutTrim.connect(this.channels.bass.input);

    // Calibrated drum pre-fader trims so Kick, Rim/Clap, Hats, Chords & Bass match gain
    this.drumChannelScale = {
      kick: 0.78,
      rim: 1.75,
      ch: 1.38,
      oh: 1.28
    };

    // --- Ping-Pong Tape Delay Unit ---
    this.delayL = ctx.createDelay(2.5);
    this.delayR = ctx.createDelay(2.5);
    this.fbGainL = ctx.createGain();
    this.fbGainR = ctx.createGain();

    this.delayLpL = ctx.createBiquadFilter();
    this.delayLpL.type = 'lowpass';
    this.delayLpR = ctx.createBiquadFilter();
    this.delayLpR.type = 'lowpass';

    this.delayHpL = ctx.createBiquadFilter();
    this.delayHpL.type = 'highpass';
    this.delayHpL.frequency.value = 175;
    this.delayHpR = ctx.createBiquadFilter();
    this.delayHpR.type = 'highpass';
    this.delayHpR.frequency.value = 195;

    const panL = ctx.createStereoPanner();
    panL.pan.value = -0.7;
    const panR = ctx.createStereoPanner();
    panR.pan.value = 0.7;

    const preSpreadR = ctx.createGain();
    preSpreadR.gain.value = 0.24;
    this.delayInputBus.connect(this.delayL);
    this.delayInputBus.connect(preSpreadR);
    preSpreadR.connect(this.delayR);

    this.delayReturnBus = ctx.createGain();
    this.delayReturnPanner = ctx.createStereoPanner();
    this.delayReturnFader = ctx.createGain();
    this.delayToReverb = ctx.createGain();

    this.delayL.connect(this.delayHpL);
    this.delayHpL.connect(this.delayLpL);
    this.delayLpL.connect(panL);
    panL.connect(this.delayReturnBus);
    this.delayLpL.connect(this.fbGainL);
    this.fbGainL.connect(this.delayR);

    this.delayR.connect(this.delayHpR);
    this.delayHpR.connect(this.delayLpR);
    this.delayLpR.connect(panR);
    panR.connect(this.delayReturnBus);
    this.delayLpR.connect(this.fbGainR);
    this.fbGainR.connect(this.delayL);

    this.delayReturnBus.connect(this.delayReturnPanner);
    this.delayReturnPanner.connect(this.delayReturnFader);
    this.delayReturnFader.connect(masterComp);
    this.delayReturnFader.connect(this.delayToReverb);
    this.delayToReverb.connect(this.reverbInputBus);

    if (createAnalyser) {
      const delayAnalyser = ctx.createAnalyser();
      delayAnalyser.fftSize = 128;
      delayAnalyser.smoothingTimeConstant = 0.45;
      this.delayReturnFader.connect(delayAnalyser);
      this.channelAnalysers.delay = delayAnalyser;
    }

    // Tape wow/flutter LFO
    this.tapeLfo = ctx.createOscillator();
    this.tapeLfo.type = 'sine';
    this.tapeLfo.frequency.value = 0.37;
    this.tapeLfoGain = ctx.createGain();
    this.tapeLfoGain.gain.value = 0.0014;
    this.tapeLfo.connect(this.tapeLfoGain);
    this.tapeLfoGain.connect(this.delayL.delayTime);
    this.tapeLfoGain.connect(this.delayR.delayTime);
    this.tapeLfo.start(0);

    // --- Dark Warehouse Convolution Reverb ---
    this.convolver = ctx.createConvolver();
    this._rebuildReverbIR(3.4);

    this.reverbToneFilter = ctx.createBiquadFilter();
    this.reverbToneFilter.type = 'lowpass';
    this.reverbToneFilter.frequency.value = 3200;

    this.reverbReturnPanner = ctx.createStereoPanner();
    this.reverbReturnFader = ctx.createGain();

    this.reverbInputBus.connect(this.convolver);
    this.convolver.connect(this.reverbToneFilter);
    this.reverbToneFilter.connect(this.reverbReturnPanner);
    this.reverbReturnPanner.connect(this.reverbReturnFader);
    this.reverbReturnFader.connect(masterComp);

    if (createAnalyser) {
      const reverbAnalyser = ctx.createAnalyser();
      reverbAnalyser.fftSize = 128;
      reverbAnalyser.smoothingTimeConstant = 0.45;
      this.reverbReturnFader.connect(reverbAnalyser);
      this.channelAnalysers.reverb = reverbAnalyser;
    }

    // Pre-generated noise & metallic textures
    this.noiseBuffer = this._createNoiseBuffer(0.75);
    this.vinylNoiseBuffer = this._createVinylNoiseBuffer(0.75);
    this.metallicBuffer = this._createMetallicCymbalBuffer(0.75);
  }

  _updateShaperCurve(node, amount, key) {
    if (!node || this._shaperCache[key] === amount) return;
    this._shaperCache[key] = amount;
    const k = 1 + amount * 14;
    const samples = 1024;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    node.curve = curve;
  }

  _createNoiseBuffer(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  _createVinylNoiseBuffer(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.18) * 1.6));
    }
    return buf;
  }

  _createMetallicCymbalBuffer(seconds) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(1, length, rate);
    const data = buf.getChannelData(0);
    const ratios = [205.3, 304.8, 369.6, 522.7, 540.4, 801.2];
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      let sum = 0;
      const mod = Math.sin(2 * Math.PI * 147.3 * t) * 2.4;
      for (let r = 0; r < ratios.length; r++) {
        const phase = 2 * Math.PI * ratios[r] * t + mod * (r % 2 === 0 ? 1 : -0.7);
        sum += Math.tanh(Math.sin(phase) * 2.2);
      }
      const grain = (Math.random() * 2 - 1) * 0.45;
      data[i] = Math.max(-1, Math.min(1, sum * 0.22 + grain));
    }
    return buf;
  }

  _rebuildReverbIR(durationSec) {
    const safeDur = Math.max(0.8, Math.min(6.0, durationSec));
    if (this._lastReverbDecay !== null && Math.abs(this._lastReverbDecay - safeDur) < 0.08) {
      return;
    }
    this._lastReverbDecay = safeDur;
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * safeDur);
    const ir = this.ctx.createBuffer(2, length, rate);
    const decayPower = 2.6;
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decayPower);
        const white = (Math.random() * 2 - 1) * env;
        const damp = 0.38 - t * 0.22;
        prev = prev + damp * (white - prev);
        data[i] = prev * 0.9;
      }
    }
    this.convolver.buffer = ir;
  }

  applyChordParams(chordSound) {
    this._updateShaperCurve(this.chordDrive, chordSound.drive ?? 0.25, 'chordDrive');
  }

  applyFxParams(fxParams, bpm = 126, atTime = null) {
    const now = atTime ?? this.ctx.currentTime;
    const rawMs =
      typeof fxParams.delayMs === 'number'
        ? fxParams.delayMs
        : delaySubdivToMs(fxParams.delaySubdiv, bpm);
    const delayMs = Math.max(DELAY_MS_MIN, Math.min(DELAY_MS_MAX, rawMs));
    const delayTimeL = Math.min(2.0, delayMs / 1000);
    const delayTimeR = Math.min(2.0, delayTimeL * 1.03);

    this.delayL.delayTime.setTargetAtTime(delayTimeL, now, 0.03);
    this.delayR.delayTime.setTargetAtTime(delayTimeR, now, 0.03);

    const fb = Math.min(0.84, fxParams.delayFeedback ?? 0.62);
    this.fbGainL.gain.setTargetAtTime(fb, now, 0.03);
    this.fbGainR.gain.setTargetAtTime(fb, now, 0.03);

    const tone = fxParams.tapeTone ?? 1850;
    this.delayLpL.frequency.setTargetAtTime(tone, now, 0.04);
    this.delayLpR.frequency.setTargetAtTime(tone * 0.92, now, 0.04);

    this.tapeLfoGain.gain.setTargetAtTime((fxParams.tapeFlutter ?? 0.35) * 0.004, now, 0.04);
    this.delayToReverb.gain.setTargetAtTime(fxParams.delayToReverb ?? 0.42, now, 0.03);
    this.reverbToneFilter.frequency.setTargetAtTime(fxParams.reverbTone ?? 3200, now, 0.04);
    this._rebuildReverbIR(fxParams.reverbDecay ?? 3.4);
  }

  applyMixer(mixer, { bassDrive = 0.24, stemMode = 'sum', atTime = null } = {}) {
    const now = atTime ?? this.ctx.currentTime;
    const faders = mixer.faders || {};
    const pans = mixer.pans || {};
    const delaySends = mixer.delaySends || {};
    const reverbSends = mixer.reverbSends || {};
    const audibility = computeChannelAudibility(mixer, stemMode);

    this._updateShaperCurve(this.bassDrive, bassDrive, 'bassDrive');
    this.masterGain.gain.setTargetAtTime(
      audibility.master ? faderToGain(faders.master ?? 0.85) : 0,
      now,
      0.015
    );

    for (const id of SOURCE_CHANNEL_IDS) {
      const ch = this.channels[id];
      const scale = this.drumChannelScale[id] ?? 1.0;
      const panVal = Math.max(-1, Math.min(1, pans[id] ?? 0));
      const faderVal = faderToGain(faders[id] ?? 0.8) * scale;
      const aud = audibility[id];

      ch.panner.pan.setTargetAtTime(panVal, now, 0.015);
      ch.fader.gain.setTargetAtTime(faderVal, now, 0.015);
      ch.dryMute.gain.setTargetAtTime(aud.dry ? 1 : 0, now, 0.012);
      ch.sendMute.gain.setTargetAtTime(aud.send ? 1 : 0, now, 0.012);
      ch.delaySend.gain.setTargetAtTime(delaySends[id] ?? 0, now, 0.015);
      ch.reverbSend.gain.setTargetAtTime(reverbSends[id] ?? 0, now, 0.015);
    }

    this.delayReturnPanner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pans.delay ?? 0)), now, 0.015);
    this.delayReturnFader.gain.setTargetAtTime(
      audibility.delay ? faderToGain(faders.delay ?? 0.75) * 1.15 : 0,
      now,
      0.015
    );

    this.reverbReturnPanner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pans.reverb ?? 0)), now, 0.015);
    this.reverbReturnFader.gain.setTargetAtTime(
      audibility.reverb ? faderToGain(faders.reverb ?? 0.7) * 1.1 : 0,
      now,
      0.015
    );
  }

  triggerChord(midiNotes, { time = null, velocity = 100, gateSec = 0.22, chordSound } = {}) {
    if (!midiNotes || midiNotes.length === 0) return;
    const t = time ?? this.ctx.currentTime;
    const velNorm = Math.max(0.08, Math.min(1, velocity / 127));
    const p = chordSound;

    const voiceGain = this.ctx.createGain();
    const lpf1 = this.ctx.createBiquadFilter();
    const lpf2 = this.ctx.createBiquadFilter();
    lpf1.type = 'lowpass';
    lpf2.type = 'lowpass';
    lpf1.Q.value = p.resonance;
    lpf2.Q.value = Math.max(0.7, p.resonance * 0.55);

    const drift = Math.sin(t * 0.45) * 0.14 + Math.cos(t * 0.19) * 0.08;
    const baseCut = Math.max(80, p.cutoff * (1 + drift * 0.25));
    const peakCut = Math.min(12500, baseCut + p.envAmount * (0.45 + velNorm * 0.72));

    lpf1.frequency.setValueAtTime(baseCut, t);
    lpf1.frequency.linearRampToValueAtTime(peakCut, t + p.ampAttack);
    lpf1.frequency.exponentialRampToValueAtTime(Math.max(70, baseCut), t + p.ampAttack + p.envDecay);

    lpf2.frequency.setValueAtTime(baseCut * 1.15, t);
    lpf2.frequency.linearRampToValueAtTime(Math.min(13000, peakCut * 1.1), t + p.ampAttack);
    lpf2.frequency.exponentialRampToValueAtTime(Math.max(80, baseCut * 1.1), t + p.ampAttack + p.envDecay);

    const gainScale = (0.34 / Math.sqrt(Math.max(1, midiNotes.length))) * velNorm;
    const holdEnd = t + Math.max(0.025, gateSec);
    const release = Math.max(0.08, Math.min(0.45, p.envDecay * 0.65));
    const stopTime = holdEnd + release + 0.03;

    voiceGain.gain.setValueAtTime(0.0001, t);
    voiceGain.gain.linearRampToValueAtTime(gainScale, t + p.ampAttack);
    voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.0008, gainScale * 0.22), holdEnd);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    lpf1.connect(lpf2);
    lpf2.connect(voiceGain);
    voiceGain.connect(this.chordBus);

    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const noiseBp = this.ctx.createBiquadFilter();
      noiseBp.type = 'bandpass';
      noiseBp.frequency.value = 1600;
      noiseBp.Q.value = 1.4;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.028 * velNorm, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
      noise.connect(noiseBp);
      noiseBp.connect(noiseGain);
      noiseGain.connect(lpf1);
      noise.start(t);
      noise.stop(t + 0.025);
    }

    const sortedNotes = [...midiNotes].sort((a, b) => a - b);
    sortedNotes.forEach((midi, idx) => {
      const freq = midiToFreq(midi);

      const oscA = this.ctx.createOscillator();
      oscA.type = 'sawtooth';
      oscA.frequency.setValueAtTime(freq, t);
      oscA.detune.setValueAtTime(-p.detune, t);

      const oscB = this.ctx.createOscillator();
      oscB.type = idx === 0 ? 'triangle' : 'sawtooth';
      oscB.frequency.setValueAtTime(freq, t);
      oscB.detune.setValueAtTime(p.detune, t);

      oscA.connect(lpf1);
      oscB.connect(lpf1);
      oscA.start(t);
      oscB.start(t);
      oscA.stop(stopTime);
      oscB.stop(stopTime);

      if (idx === 0 && p.subLevel > 0.02) {
        const subOsc = this.ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(freq * 0.5, t);
        const subGain = this.ctx.createGain();
        subGain.gain.value = p.subLevel;
        subOsc.connect(subGain);
        subGain.connect(lpf1);
        subOsc.start(t);
        subOsc.stop(stopTime);
      }
    });
  }

  triggerBass(midiNote, { time = null, accent = false, gateSec = 0.16, sound = {} } = {}) {
    const t = time ?? this.ctx.currentTime;
    const freq = midiToFreq(midiNote);
    const cutoff = sound.cutoff ?? 200;
    const res = sound.resonance ?? 3.2;
    const envAmount = sound.envAmount ?? 550;
    const decay = sound.decay ?? 0.24;
    const release = Math.max(0.015, sound.release ?? 0.14);
    const shape = sound.shape ?? 0.3;
    const fmAmount = sound.fmAmount ?? 0.15;
    const subPunch = sound.subPunch ?? 0.35;
    const ampScale = accent ? 0.88 : 0.62;

    const lpf1 = this.ctx.createBiquadFilter();
    const lpf2 = this.ctx.createBiquadFilter();
    lpf1.type = 'lowpass';
    lpf2.type = 'lowpass';
    lpf1.Q.value = Math.min(12, res * (accent ? 1.25 : 1.0));
    lpf2.Q.value = Math.max(0.7, res * 0.45);

    const peakCut = Math.min(6200, cutoff + envAmount * (accent ? 1.35 : 0.9));
    lpf1.frequency.setValueAtTime(Math.max(45, cutoff * 0.7), t);
    lpf1.frequency.linearRampToValueAtTime(peakCut, t + 0.005);
    lpf1.frequency.exponentialRampToValueAtTime(Math.max(45, cutoff * 0.65), t + decay);

    lpf2.frequency.setValueAtTime(Math.max(55, cutoff * 0.85), t);
    lpf2.frequency.linearRampToValueAtTime(Math.min(7000, peakCut * 1.15), t + 0.005);
    lpf2.frequency.exponentialRampToValueAtTime(Math.max(55, cutoff * 0.75), t + decay);

    const env = this.ctx.createGain();
    const holdEnd = t + Math.max(0.03, gateSec);
    const releaseEnd = holdEnd + release;
    const stopTime = releaseEnd + 0.02;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(ampScale, t + 0.004);
    env.gain.exponentialRampToValueAtTime(Math.max(0.001, ampScale * 0.42), holdEnd);
    env.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    if (subPunch > 0.02) {
      subOsc.frequency.setValueAtTime(freq * (1 + subPunch * 0.85), t);
      subOsc.frequency.exponentialRampToValueAtTime(freq, t + 0.028);
    } else {
      subOsc.frequency.setValueAtTime(freq, t);
    }

    if (fmAmount > 0.02) {
      const fmOsc = this.ctx.createOscillator();
      fmOsc.type = 'sine';
      fmOsc.frequency.setValueAtTime(freq * 2.0, t);
      const fmGain = this.ctx.createGain();
      fmGain.gain.setValueAtTime(freq * fmAmount * (accent ? 2.4 : 1.5), t);
      fmGain.gain.exponentialRampToValueAtTime(0.01, t + Math.min(0.14, decay * 0.6));
      fmOsc.connect(fmGain);
      fmGain.connect(subOsc.frequency);
      fmOsc.start(t);
      fmOsc.stop(stopTime);
    }

    const subGain = this.ctx.createGain();
    subGain.gain.value = 1 - shape * 0.3;
    subOsc.connect(subGain);
    subGain.connect(lpf1);

    const harmOsc = this.ctx.createOscillator();
    harmOsc.type = shape > 0.62 ? 'sawtooth' : shape > 0.3 ? 'square' : 'triangle';
    harmOsc.frequency.setValueAtTime(freq, t);
    harmOsc.detune.setValueAtTime(shape * 8, t);
    const harmGain = this.ctx.createGain();
    harmGain.gain.value = shape * 0.72;
    harmOsc.connect(harmGain);
    harmGain.connect(lpf1);

    lpf1.connect(lpf2);
    lpf2.connect(env);
    env.connect(this.bassBus);

    subOsc.start(t);
    harmOsc.start(t);
    subOsc.stop(stopTime);
    harmOsc.stop(stopTime);
  }

  triggerDrum(trackId, { time = null, level = 1, tone = {} } = {}) {
    const t = time ?? this.ctx.currentTime;
    const microPitch = 1 + (Math.random() * 2 - 1) * 0.014;
    const microAmp = 1 + (Math.random() * 2 - 1) * 0.04;
    const velGain = (level === 2 ? 1.12 : 0.72) * microAmp;
    const channelInput = this.channels[trackId]?.input;
    if (!channelInput) return;

    if (trackId === 'kick') {
      const pitch = (tone.kickPitch ?? 46) * microPitch;
      const punch = tone.kickPunch ?? 2.8;
      const decay = tone.kickDecay ?? 0.28;
      const drive = tone.kickDrive ?? 0.25;

      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(pitch * punch, t);
      subOsc.frequency.exponentialRampToValueAtTime(pitch, t + 0.038);
      subOsc.frequency.exponentialRampToValueAtTime(Math.max(25, pitch * 0.74), t + decay);

      const punchOsc = this.ctx.createOscillator();
      punchOsc.type = 'triangle';
      punchOsc.frequency.setValueAtTime(pitch * 3.6, t);
      punchOsc.frequency.exponentialRampToValueAtTime(pitch * 1.4, t + 0.045);
      const punchGain = this.ctx.createGain();
      punchGain.gain.setValueAtTime((0.36 + drive * 0.28) * velGain, t);
      punchGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.065);

      const clickBuf = this.ctx.createBufferSource();
      clickBuf.buffer = this.vinylNoiseBuffer;
      const clickBp = this.ctx.createBiquadFilter();
      clickBp.type = 'bandpass';
      clickBp.frequency.value = 1400 + drive * 1200;
      clickBp.Q.value = 1.2;
      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime((0.28 + drive * 0.22) * velGain, t);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.95 * velGain, t + 0.0025);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);

      const lpf = this.ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 280 + drive * 340;

      subOsc.connect(lpf);
      punchOsc.connect(punchGain);
      punchGain.connect(lpf);
      clickBuf.connect(clickBp);
      clickBp.connect(clickGain);
      clickGain.connect(gain);

      lpf.connect(gain);
      gain.connect(channelInput);

      subOsc.start(t);
      punchOsc.start(t);
      clickBuf.start(t);
      subOsc.stop(t + decay + 0.03);
      punchOsc.stop(t + 0.075);
      clickBuf.stop(t + 0.02);
      return;
    }

    if (trackId === 'rim') {
      const rimFreq = (tone.rimTone ?? 1020) * microPitch;
      const snap = tone.rimSnap ?? 0.6;
      const rimDecay = tone.rimDecay ?? 0.068;
      const rimMode = tone.rimMode ?? 'rim';

      if (rimMode === 'clap') {
        const taps = [0, 0.011, 0.022, 0.033];
        taps.forEach((offset, idx) => {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const bp = this.ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = rimFreq * (idx === 3 ? 0.92 : 1.08);
          bp.Q.value = idx === 3 ? 1.35 : 2.1;

          const g = this.ctx.createGain();
          const tapTime = t + offset;
          const tail = idx === 3 ? Math.max(0.09, rimDecay) : 0.016;
          g.gain.setValueAtTime(0.001, tapTime);
          g.gain.linearRampToValueAtTime((idx === 3 ? 1.35 : 1.05) * velGain, tapTime + 0.0015);
          g.gain.exponentialRampToValueAtTime(0.0001, tapTime + tail);

          src.connect(bp);
          bp.connect(g);
          g.connect(channelInput);
          src.start(tapTime);
          src.stop(tapTime + tail + 0.02);
        });
      } else if (rimMode === 'snare') {
        [185, 328].forEach((shellFreq, idx) => {
          const osc = this.ctx.createOscillator();
          osc.type = idx === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(shellFreq * 1.35 * microPitch, t);
          osc.frequency.exponentialRampToValueAtTime(shellFreq * microPitch, t + 0.03);
          const g = this.ctx.createGain();
          g.gain.setValueAtTime((idx === 0 ? 0.85 : 0.48) * velGain, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
          osc.connect(g);
          g.connect(channelInput);
          osc.start(t);
          osc.stop(t + 0.095);
        });

        const wire = this.ctx.createBufferSource();
        wire.buffer = this.noiseBuffer;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1200;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = rimFreq * 1.35;
        bp.Q.value = 0.75;
        const wg = this.ctx.createGain();
        wg.gain.setValueAtTime((1.35 + snap * 0.55) * velGain, t);
        wg.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.08, rimDecay));
        wire.connect(hp);
        hp.connect(bp);
        bp.connect(wg);
        wg.connect(channelInput);
        wire.start(t);
        wire.stop(t + Math.max(0.08, rimDecay) + 0.02);
      } else if (rimMode === 'fm') {
        const car = this.ctx.createOscillator();
        const mod = this.ctx.createOscillator();
        car.type = 'sine';
        mod.type = 'sine';
        car.frequency.setValueAtTime(rimFreq * 0.42, t);
        mod.frequency.setValueAtTime(rimFreq * 1.13, t);
        const modGain = this.ctx.createGain();
        modGain.gain.setValueAtTime(rimFreq * 1.4, t);
        modGain.gain.exponentialRampToValueAtTime(1, t + rimDecay);
        const carGain = this.ctx.createGain();
        carGain.gain.setValueAtTime(1.05 * velGain, t);
        carGain.gain.exponentialRampToValueAtTime(0.0001, t + rimDecay);
        mod.connect(modGain);
        modGain.connect(car.frequency);
        car.connect(carGain);
        carGain.connect(channelInput);
        car.start(t);
        mod.start(t);
        car.stop(t + rimDecay + 0.02);
        mod.stop(t + rimDecay + 0.02);
      } else {
        const wood = this.ctx.createOscillator();
        wood.type = 'triangle';
        wood.frequency.setValueAtTime(rimFreq * 0.52, t);
        wood.frequency.exponentialRampToValueAtTime(rimFreq * 0.36, t + 0.022);
        const wg = this.ctx.createGain();
        wg.gain.setValueAtTime(0.85 * velGain, t);
        wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
        wood.connect(wg);
        wg.connect(channelInput);
        wood.start(t);
        wood.stop(t + 0.04);

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.vinylNoiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = rimFreq;
        bp.Q.value = 2.6;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime((1.05 + snap * 0.75) * velGain, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + rimDecay);
        noise.connect(bp);
        bp.connect(ng);
        ng.connect(channelInput);
        noise.start(t);
        noise.stop(t + rimDecay + 0.02);
      }
      return;
    }

    // Closed Hat ('ch') or Open Hat ('oh')
    const isOpen = trackId === 'oh';
    const mode = isOpen ? (tone.ohMode ?? 'open') : (tone.hatMode ?? '909');
    const baseTightness = tone.hatTightness ?? 0.05;
    const decay = isOpen ? (tone.hatAir ?? 0.26) : baseTightness;

    const hatBus = this.ctx.createGain();
    hatBus.gain.setValueAtTime(0.001, t);
    const attack = mode === 'shaker' || mode === 'wash' ? 0.009 : 0.002;
    hatBus.gain.linearRampToValueAtTime((isOpen ? 0.86 : 0.96) * velGain, t + attack);
    hatBus.gain.exponentialRampToValueAtTime(0.0001, t + decay);

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    const baseFreq = (tone.hatFreq ?? 6400) * microPitch;
    hp.frequency.value = isOpen ? Math.max(3200, baseFreq * 0.72) : baseFreq;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = mode === 'ride' ? 5400 * microPitch : mode === 'shaker' ? 6200 : 8800 * microPitch;
    bp.Q.value = mode === 'ride' ? 1.8 : mode === 'fm' ? 2.1 : 0.75;

    const metalSrc = this.ctx.createBufferSource();
    metalSrc.buffer = this.metallicBuffer;
    metalSrc.playbackRate.value = (mode === 'fm' ? 1.32 : mode === 'ride' ? 0.88 : 1.0) * microPitch;
    const metalGain = this.ctx.createGain();
    metalGain.gain.value = mode === 'shaker' ? 0.45 : 0.92;
    metalSrc.connect(metalGain);
    metalGain.connect(hp);

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = mode === 'shaker' || mode === 'wash' ? this.vinylNoiseBuffer : this.noiseBuffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = mode === 'shaker' || mode === 'wash' ? 1.15 : 0.75;
    noiseSrc.connect(noiseGain);
    noiseGain.connect(hp);

    hp.connect(bp);
    bp.connect(hatBus);
    hatBus.connect(channelInput);

    const startOffset = Math.random() * 0.08;
    metalSrc.start(t, startOffset);
    noiseSrc.start(t, startOffset);
    metalSrc.stop(t + decay + 0.03);
    noiseSrc.stop(t + decay + 0.03);
  }
}

/**
 * Live Web Audio engine managing playback and real-time controls.
 */
export class DubAudioEngine {
  constructor() {
    this.ctx = null;
    this.graph = null;
    this.chordSound = { ...SOUND_PRESETS['basic-channel'] };
    this.fxParams = { ...FX_PRESETS['basic-channel'] };

    this.isPlaying = false;
    this.timerId = null;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this.getPlaybackState = null;
    this.onStepCallback = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    this.graph = new DubSynthGraph(this.ctx, { createAnalyser: true });
    this.graph.applyChordParams(this.chordSound);
    this.graph.applyFxParams(this.fxParams, 126);
  }

  applyChordParams(nextChord, bpm = 126) {
    this.chordSound = { ...this.chordSound, ...nextChord };
    if (this.graph) {
      this.graph.applyChordParams(this.chordSound);
      this.graph.applyFxParams(this.fxParams, bpm);
    }
  }

  applyFxParams(nextFx, bpm = 126) {
    this.fxParams = { ...this.fxParams, ...nextFx };
    if (this.graph) {
      this.graph.applyFxParams(this.fxParams, bpm);
    }
  }

  applyMixer(mixer, opts = {}) {
    if (!this.graph) return;
    this.graph.applyMixer(mixer, opts);
  }

  triggerChord(midiNotes, opts = {}) {
    this.init();
    this.graph.triggerChord(midiNotes, { ...opts, chordSound: this.chordSound });
  }

  triggerBass(midiNote, opts = {}) {
    this.init();
    this.graph.triggerBass(midiNote, opts);
  }

  triggerDrum(trackId, opts = {}) {
    this.init();
    this.graph.triggerDrum(trackId, opts);
  }

  startSequencer(getPlaybackState, onStepCallback) {
    this.init();
    if (this.isPlaying) return;

    this.getPlaybackState = getPlaybackState;
    this.onStepCallback = onStepCallback;
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;

    this.timerId = setInterval(() => this._schedulerTick(), 22);
    this._schedulerTick();
  }

  stopSequencer() {
    this.isPlaying = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.onStepCallback) {
      this.onStepCallback(-1);
    }
  }

  _schedulerTick() {
    if (!this.isPlaying || !this.ctx || !this.getPlaybackState) return;

    const state = this.getPlaybackState();
    const { bpm, swingRatio, steps, chordConfig, mixer, bass, drums } = state;
    const stepCount = steps.length || 16;
    const sixteenthSec = 60 / Math.max(40, bpm) / 4;
    const lookaheadSec = 0.11;

    while (this.nextStepTime < this.ctx.currentTime + lookaheadSec) {
      const stepIdx = this.currentStep % stepCount;
      const step = steps[stepIdx];

      const straightInSixteenths = stepIdx;
      const swungInSixteenths = getStepStartInSixteenths(stepIdx, swingRatio);
      const swingDeltaSec = (swungInSixteenths - straightInSixteenths) * sixteenthSec;
      const triggerTime = this.nextStepTime + swingDeltaSec;

      this.graph.applyChordParams(this.chordSound);
      this.graph.applyFxParams(this.fxParams, bpm);
      this.graph.applyMixer(mixer, { bassDrive: bass?.sound?.drive ?? 0.24 });

      if (drums && drums.enabled) {
        for (const track of drums.tracks) {
          const level = drums.patterns[track.id]?.[stepIdx] ?? 0;
          if (level > 0) {
            this.graph.triggerDrum(track.id, {
              time: triggerTime,
              level,
              tone: drums.tone
            });
          }
        }
      }

      if (bass && bass.enabled) {
        const bassStep = bass.steps[stepIdx];
        if (bassStep && bassStep.active) {
          const midi = getBassMidiNote(chordConfig.rootPc, bass.octave, bassStep.offset ?? 0);
          const bassGateSec = Math.max(0.03, (bassStep.gate ?? 0.65) * sixteenthSec);
          this.graph.triggerBass(midi, {
            time: triggerTime,
            accent: bassStep.accent,
            gateSec: bassGateSec,
            sound: bass.sound
          });
        }
      }

      if (step && step.active) {
        const notes = voiceChord({
          ...chordConfig,
          transpose: step.offset ?? 0
        });
        const gateSec = Math.max(0.03, (step.gate ?? 0.35) * sixteenthSec);
        this.graph.triggerChord(notes, {
          time: triggerTime,
          velocity: step.velocity ?? 96,
          gateSec,
          chordSound: this.chordSound
        });
      }

      const delayMs = Math.max(0, (triggerTime - this.ctx.currentTime) * 1000);
      const capturedIdx = stepIdx;
      setTimeout(() => {
        if (this.isPlaying && this.onStepCallback) {
          this.onStepCallback(capturedIdx);
        }
      }, delayMs);

      this.nextStepTime += sixteenthSec;
      this.currentStep = (this.currentStep + 1) % stepCount;
    }
  }

  getAnalyserData(targetArray) {
    if (!this.graph?.analyser) return false;
    this.graph.analyser.getByteTimeDomainData(targetArray);
    return true;
  }

  getChannelLevels() {
    const out = {};
    if (!this.graph?.channelAnalysers) return out;
    const buf = this.graph._meterScratch;
    for (const [id, analyser] of Object.entries(this.graph.channelAnalysers)) {
      if (!analyser) continue;
      const len = Math.min(buf.length, analyser.fftSize);
      analyser.getByteTimeDomainData(buf);
      let sumSq = 0;
      let peak = 0;
      for (let i = 0; i < len; i++) {
        const sample = (buf[i] - 128) / 128;
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
        sumSq += sample * sample;
      }
      const rms = Math.sqrt(sumSq / len);
      out[id] = { rms, peak };
    }
    return out;
  }
}

/**
 * Sample-accurate OfflineAudioContext renderer for exporting loop sum or isolated stems.
 */
export async function renderMixOffline({
  bpm = 126,
  swingRatio = 0.12,
  steps = [],
  chordConfig,
  chordSound,
  fxParams,
  bass,
  drums,
  mixer,
  loops = 1,
  stemMode = 'sum',
  sampleRate = 44100
}) {
  const stepCount = steps.length || 16;
  const totalSteps = stepCount * Math.max(1, loops);
  const sixteenthSec = 60 / Math.max(40, bpm) / 4;
  const durationSec = totalSteps * sixteenthSec;
  const totalFrames = Math.ceil(durationSec * sampleRate);

  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offlineCtx = new OfflineCtx(2, totalFrames, sampleRate);
  const graph = new DubSynthGraph(offlineCtx, { createAnalyser: false });

  graph.applyChordParams(chordSound);
  graph.applyFxParams(fxParams, bpm, 0);
  graph.applyMixer(mixer, {
    bassDrive: bass?.sound?.drive ?? 0.24,
    stemMode,
    atTime: 0
  });

  for (let absStep = 0; absStep < totalSteps; absStep++) {
    const stepIdx = absStep % stepCount;
    const step = steps[stepIdx];
    const swungSixteenth = Math.floor(absStep / stepCount) * stepCount + getStepStartInSixteenths(stepIdx, swingRatio);
    const triggerTime = swungSixteenth * sixteenthSec;

    if (drums && drums.enabled) {
      for (const track of drums.tracks) {
        const level = drums.patterns[track.id]?.[stepIdx] ?? 0;
        if (level > 0) {
          graph.triggerDrum(track.id, {
            time: triggerTime,
            level,
            tone: drums.tone
          });
        }
      }
    }

    if (bass && bass.enabled) {
      const bassStep = bass.steps[stepIdx];
      if (bassStep && bassStep.active) {
        const midi = getBassMidiNote(chordConfig.rootPc, bass.octave, bassStep.offset ?? 0);
        const bassGateSec = Math.max(0.03, (bassStep.gate ?? 0.65) * sixteenthSec);
        graph.triggerBass(midi, {
          time: triggerTime,
          accent: bassStep.accent,
          gateSec: bassGateSec,
          sound: bass.sound
        });
      }
    }

    if (step && step.active) {
      const notes = voiceChord({
        ...chordConfig,
        transpose: step.offset ?? 0
      });
      const gateSec = Math.max(0.03, (step.gate ?? 0.35) * sixteenthSec);
      graph.triggerChord(notes, {
        time: triggerTime,
        velocity: step.velocity ?? 96,
        gateSec,
        chordSound
      });
    }
  }

  return offlineCtx.startRendering();
}
