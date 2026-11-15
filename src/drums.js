/**
 * Minimal Dub Techno Drum Machine: 8 Distinct Analog/Hardware-Inspired Sound Kits,
 * pattern helpers, and shared track definitions.
 */

export const DRUM_TRACKS = [
  { id: 'kick', name: 'KICK', short: 'BD', dubSend: 0.0 },
  { id: 'rim', name: 'RIM / CLAP', short: 'RM', dubSend: 0.55 },
  { id: 'ch', name: 'CLOSED HAT', short: 'CH', dubSend: 0.18 },
  { id: 'oh', name: 'OPEN HAT', short: 'OH', dubSend: 0.35 }
];

// 8 Artist Drum Sound / Sample Kits (affect synthesis character & architecture only, NOT the sequence)
export const DRUM_SOUND_PRESETS = [
  {
    id: 'basic-channel',
    name: 'Basic Channel',
    tone: {
      kitModel: 'Tape 909/Dub',
      rimMode: 'rim',
      hatMode: 'shaker',
      ohMode: 'wash',
      kickPitch: 44,
      kickPunch: 2.6,
      kickDecay: 0.31,
      kickDrive: 0.35,
      rimTone: 920,
      rimSnap: 0.55,
      rimDecay: 0.065,
      hatFreq: 5400,
      hatTightness: 0.058,
      hatAir: 0.28
    }
  },
  {
    id: 'robert-hood',
    name: 'Robert Hood',
    tone: {
      kitModel: 'Detroit 909',
      rimMode: 'clap',
      hatMode: '909',
      ohMode: 'open',
      kickPitch: 52,
      kickPunch: 3.5,
      kickDecay: 0.21,
      kickDrive: 0.44,
      rimTone: 1380,
      rimSnap: 0.82,
      rimDecay: 0.11,
      hatFreq: 7400,
      hatTightness: 0.042,
      hatAir: 0.22
    }
  },
  {
    id: 'shed',
    name: 'Shed / Wax',
    tone: {
      kitModel: 'Warehouse Tape',
      rimMode: 'snare',
      hatMode: '909',
      ohMode: 'ride',
      kickPitch: 48,
      kickPunch: 3.2,
      kickDecay: 0.27,
      kickDrive: 0.68,
      rimTone: 1120,
      rimSnap: 0.72,
      rimDecay: 0.12,
      hatFreq: 6100,
      hatTightness: 0.05,
      hatAir: 0.34
    }
  },
  {
    id: 'deepchord',
    name: 'Deepchord',
    tone: {
      kitModel: 'Analog 808 Sub',
      rimMode: 'rim',
      hatMode: 'shaker',
      ohMode: 'wash',
      kickPitch: 40,
      kickPunch: 2.1,
      kickDecay: 0.4,
      kickDrive: 0.22,
      rimTone: 760,
      rimSnap: 0.38,
      rimDecay: 0.085,
      hatFreq: 4600,
      hatTightness: 0.072,
      hatAir: 0.38
    }
  },
  {
    id: 'maurizio',
    name: 'Maurizio',
    tone: {
      kitModel: 'M-Series Analog',
      rimMode: 'clap',
      hatMode: '909',
      ohMode: 'open',
      kickPitch: 47,
      kickPunch: 3.0,
      kickDecay: 0.25,
      kickDrive: 0.4,
      rimTone: 1080,
      rimSnap: 0.62,
      rimDecay: 0.095,
      hatFreq: 6900,
      hatTightness: 0.046,
      hatAir: 0.24
    }
  },
  {
    id: 'rhythm-sound',
    name: 'Rhythm & Sound',
    tone: {
      kitModel: 'Dub Roots Kit',
      rimMode: 'rim',
      hatMode: 'shaker',
      ohMode: 'wash',
      kickPitch: 42,
      kickPunch: 2.3,
      kickDecay: 0.36,
      kickDrive: 0.26,
      rimTone: 840,
      rimSnap: 0.4,
      rimDecay: 0.055,
      hatFreq: 4900,
      hatTightness: 0.068,
      hatAir: 0.35
    }
  },
  {
    id: 'monolake',
    name: 'Monolake',
    tone: {
      kitModel: 'Modular FM Perc',
      rimMode: 'fm',
      hatMode: 'fm',
      ohMode: 'ride',
      kickPitch: 50,
      kickPunch: 3.7,
      kickDecay: 0.19,
      kickDrive: 0.3,
      rimTone: 1620,
      rimSnap: 0.85,
      rimDecay: 0.068,
      hatFreq: 7800,
      hatTightness: 0.035,
      hatAir: 0.26
    }
  },
  {
    id: 'surgeon',
    name: 'Surgeon',
    tone: {
      kitModel: 'Overdriven Raw',
      rimMode: 'snare',
      hatMode: 'fm',
      ohMode: 'ride',
      kickPitch: 54,
      kickPunch: 3.9,
      kickDecay: 0.24,
      kickDrive: 0.85,
      rimTone: 1240,
      rimSnap: 0.78,
      rimDecay: 0.13,
      hatFreq: 6500,
      hatTightness: 0.048,
      hatAir: 0.3
    }
  }
];

export const DEFAULT_DRUM_PATTERN = {
  kick: [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0],
  rim:  [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2, 0],
  ch:   [0, 1, 1, 2, 0, 1, 1, 0, 0, 1, 1, 2, 0, 1, 1, 1],
  oh:   [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0]
};

/**
 * Build default 4/4 dub techno drum pattern resized to `stepCount`.
 */
export function buildDefaultDrumPatterns(stepCount = 16) {
  const result = {};
  for (const track of DRUM_TRACKS) {
    const src = DEFAULT_DRUM_PATTERN[track.id] || [];
    result[track.id] = Array.from({ length: stepCount }, (_, i) => src[i % src.length] || 0);
  }
  return result;
}

/**
 * Resize existing drum patterns cleanly when step count changes (8 / 16 / 32).
 */
export function resizeDrumPatterns(patterns, targetCount) {
  const result = {};
  for (const track of DRUM_TRACKS) {
    const src = patterns[track.id] || [];
    result[track.id] = Array.from({ length: targetCount }, (_, i) =>
      src.length > 0 ? src[i % src.length] : 0
    );
  }
  return result;
}

/**
 * Create an empty (all 0) drum pattern dictionary.
 */
export function createEmptyDrumPatterns(stepCount = 16) {
  const result = {};
  for (const track of DRUM_TRACKS) {
    result[track.id] = new Array(stepCount).fill(0);
  }
  return result;
}
