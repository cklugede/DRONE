/**
 * Minimal Dub Techno Bass Synth Sound Presets & Step Sequencer Engine.
 */

import { quantizeOffsetToScale, rootToMidi } from './theory.js';
import { generateEuclideanPattern } from './sequencer.js';

// 8 Artist Bass Sound Presets (shape synthesis character only; sequence is preserved)
export const BASS_PRESETS = [
  {
    id: 'basic-channel',
    name: 'Basic Channel',
    sound: { cutoff: 175, resonance: 3.2, envAmount: 420, decay: 0.28, release: 0.15, drive: 0.24, shape: 0.28, fmAmount: 0.12, subPunch: 0.35 }
  },
  {
    id: 'robert-hood',
    name: 'Robert Hood',
    sound: { cutoff: 310, resonance: 6.4, envAmount: 1150, decay: 0.15, release: 0.06, drive: 0.4, shape: 0.72, fmAmount: 0.18, subPunch: 0.55 }
  },
  {
    id: 'shed',
    name: 'Shed / Wax',
    sound: { cutoff: 245, resonance: 5.0, envAmount: 820, decay: 0.22, release: 0.11, drive: 0.65, shape: 0.6, fmAmount: 0.32, subPunch: 0.45 }
  },
  {
    id: 'deepchord',
    name: 'Deepchord',
    sound: { cutoff: 130, resonance: 1.8, envAmount: 240, decay: 0.48, release: 0.36, drive: 0.15, shape: 0.14, fmAmount: 0.05, subPunch: 0.2 }
  },
  {
    id: 'maurizio',
    name: 'Maurizio',
    sound: { cutoff: 215, resonance: 4.8, envAmount: 680, decay: 0.21, release: 0.12, drive: 0.32, shape: 0.46, fmAmount: 0.22, subPunch: 0.4 }
  },
  {
    id: 'rhythm-sound',
    name: 'Rhythm & Sound',
    sound: { cutoff: 155, resonance: 2.4, envAmount: 320, decay: 0.36, release: 0.26, drive: 0.2, shape: 0.22, fmAmount: 0.15, subPunch: 0.5 }
  },
  {
    id: 'monolake',
    name: 'Monolake',
    sound: { cutoff: 360, resonance: 5.8, envAmount: 1350, decay: 0.13, release: 0.05, drive: 0.28, shape: 0.76, fmAmount: 0.65, subPunch: 0.3 }
  },
  {
    id: 'surgeon',
    name: 'Surgeon',
    sound: { cutoff: 260, resonance: 7.2, envAmount: 1080, decay: 0.19, release: 0.09, drive: 0.82, shape: 0.8, fmAmount: 0.48, subPunch: 0.65 }
  }
];

const CURATED_BASS_GROOVES = {
  'basic-channel': {
    pattern: [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    accents: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    offsets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 5, 0],
    gates:   [0.85, 0.5, 0.5, 0.45, 0.5, 0.5, 0.5, 0.5, 0.9, 0.5, 0.5, 0.55, 0.5, 0.5, 0.4, 0.5]
  },
  'robert-hood': {
    pattern: [0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0],
    accents: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    offsets: [0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0],
    gates:   [0.4, 0.4, 0.55, 0.4, 0.4, 0.3, 0.45, 0.4, 0.4, 0.4, 0.55, 0.4, 0.35, 0.4, 0.45, 0.4]
  },
  shed: {
    pattern: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1],
    accents: [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    offsets: [0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 7, 0, 0, 3, 0, -5],
    gates:   [0.7, 0.45, 0.45, 0.45, 0.45, 0.65, 0.45, 0.45, 0.75, 0.45, 0.5, 0.45, 0.45, 0.6, 0.45, 0.35]
  },
  deepchord: {
    pattern: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    accents: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    offsets: [0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    gates:   [1.6, 0.6, 0.6, 0.6, 0.6, 0.6, 1.2, 0.6, 0.6, 0.6, 1.5, 0.6, 0.6, 0.6, 0.6, 0.6]
  },
  maurizio: {
    pattern: [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1],
    accents: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    offsets: [0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 5, 0, 3],
    gates:   [0.4, 0.35, 0.65, 0.4, 0.4, 0.35, 0.65, 0.4, 0.4, 0.35, 0.65, 0.4, 0.4, 0.45, 0.4, 0.3]
  },
  'rhythm-sound': {
    pattern: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    accents: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    offsets: [0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 5, 0, 0, 0, 0],
    gates:   [1.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9, 0.5, 0.8, 0.5, 0.5, 0.85, 0.5, 0.5, 0.5, 0.5]
  },
  monolake: {
    pattern: [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0],
    accents: [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    offsets: [0, 0, 12, 0, 0, 0, 0, 7, 0, 0, 0, 12, 0, 5, 0, 0],
    gates:   [0.35, 0.35, 0.25, 0.35, 0.35, 0.4, 0.35, 0.25, 0.45, 0.35, 0.35, 0.3, 0.35, 0.3, 0.4, 0.35]
  }
};

export const BASS_OFFSET_CYCLE = [-5, 0, 3, 5, 7, 10, 12];

export function createDefaultBassStep(overrides = {}) {
  return {
    active: false,
    accent: false,
    offset: 0,
    gate: 0.65,
    ...overrides
  };
}

/**
 * Generate a bass step sequence from a style or Euclidean rhythm.
 */
export function generateBassSequence({
  presetId = 'basic-channel',
  stepCount = 16,
  scaleId = 'minor',
  pulses = 5,
  rotation = 0
} = {}) {
  const groove = CURATED_BASS_GROOVES[presetId];
  if (groove && pulses === 5 && rotation === 0) {
    return Array.from({ length: stepCount }, (_, i) => {
      const idx = i % 16;
      return createDefaultBassStep({
        active: groove.pattern[idx] === 1,
        accent: groove.accents[idx] === 1,
        offset: quantizeOffsetToScale(groove.offsets[idx] ?? 0, scaleId),
        gate: groove.gates[idx] ?? 0.65
      });
    });
  }

  const hits = generateEuclideanPattern(stepCount, pulses, rotation);
  const cycle = [0, 0, 5, 7, 3, -5, 12];
  let hitIdx = 0;
  return hits.map((active, i) => {
    const offset = active ? quantizeOffsetToScale(cycle[hitIdx % cycle.length], scaleId) : 0;
    const gate = active ? (i % 4 === 0 ? 0.85 : 0.45) : 0.65;
    if (active) hitIdx++;
    return createDefaultBassStep({
      active,
      accent: active && i % 4 === 0,
      offset,
      gate
    });
  });
}

/**
 * Resize bass steps cleanly when changing step count (8 / 16 / 32).
 */
export function resizeBassSteps(steps, targetCount) {
  return Array.from({ length: targetCount }, (_, i) =>
    steps.length > 0 ? { ...steps[i % steps.length] } : createDefaultBassStep()
  );
}

/**
 * Create an empty bass sequence.
 */
export function createEmptyBassSteps(stepCount = 16) {
  return Array.from({ length: stepCount }, () => createDefaultBassStep());
}

/**
 * Compute MIDI note number for a bass step locked to chord root in bass register (octave 1 or 2).
 */
export function getBassMidiNote(rootPc, octave = 1, offset = 0) {
  const safeOctave = Math.max(0, Math.min(3, octave));
  const midi = rootToMidi(rootPc, safeOctave) + offset;
  return Math.max(24, Math.min(60, midi));
}
