/**
 * Dub Techno step sequencer engine, Euclidean rhythm & style pattern generators,
 * and shared swing-aware timing calculations.
 */

import { quantizeOffsetToScale } from './theory.js';

export const SEQUENCE_STYLES = [
  { id: 'basic-channel', name: 'Basic Channel', desc: 'Sparse dotted dub stabs & ghost echoes' },
  { id: 'robert-hood', name: 'Robert Hood', desc: 'Tight minimal pulse & 2-interval call/response' },
  { id: 'shed', name: 'Shed / Wax', desc: 'Syncopated Berlin warehouse chord shifts' },
  { id: 'deepchord', name: 'Deepchord', desc: 'Underwater Echospace slow-breathing stabs' },
  { id: 'maurizio', name: 'Maurizio', desc: 'Hypnotic M-series off-beat lock & ghost hits' },
  { id: 'rhythm-sound', name: 'Rhythm & Sound', desc: 'Reggae-dub step-back skank & open space' },
  { id: 'monolake', name: 'Monolake', desc: 'Surgical Berlin polyrhythmic micro-stabs' },
  { id: 'euclidean', name: 'Euclidean', desc: 'Polyrhythmic pulse distribution' }
];

export function createDefaultStep(overrides = {}) {
  return {
    active: false,
    velocity: 96,
    offset: 0,
    gate: 0.35, // fraction of a 16th note (or multi-step when > 1.0)
    ...overrides
  };
}

/**
 * Resize a sequence while preserving existing step data (repeating or truncating cleanly).
 */
export function resizeSteps(steps, targetCount) {
  const result = [];
  for (let i = 0; i < targetCount; i++) {
    if (steps.length > 0) {
      result.push({ ...steps[i % steps.length] });
    } else {
      result.push(createDefaultStep());
    }
  }
  return result;
}

/**
 * Bjorklund Euclidean rhythm generator returning boolean array of length `steps`
 * with `pulses` evenly distributed hits, rotated by `rotation`.
 */
export function generateEuclideanPattern(steps, pulses, rotation = 0) {
  const n = Math.max(1, Math.round(steps));
  const k = Math.max(0, Math.min(n, Math.round(pulses)));
  if (k === 0) return new Array(n).fill(false);
  if (k === n) return new Array(n).fill(true);

  let pattern = [];
  let counts = [];
  let remainders = [k];
  let divisor = n - k;
  let level = 0;

  while (true) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level += 1;
    if (remainders[level] <= 1) break;
  }
  counts.push(divisor);

  const build = (lvl) => {
    if (lvl === -1) {
      pattern.push(false);
    } else if (lvl === -2) {
      pattern.push(true);
    } else {
      for (let i = 0; i < counts[lvl]; i++) build(lvl - 1);
      if (remainders[lvl] !== 0) build(lvl - 2);
    }
  };

  build(level);

  // Normalize so first hit lands cleanly before applying rotation
  const firstHit = pattern.indexOf(true);
  if (firstHit > 0) {
    pattern = pattern.slice(firstHit).concat(pattern.slice(0, firstHit));
  }

  const rot = ((rotation % n) + n) % n;
  if (rot === 0) return pattern;
  return pattern.slice(n - rot).concat(pattern.slice(0, n - rot));
}

const CURATED_SEQUENCE_TEMPLATES = {
  'basic-channel': {
    // Classic sparse Phylyps Trak / Quadrants off-beat & dotted-eighth stabs
    vels:  [112, 0, 0, 68, 0, 0, 96, 0, 0, 0, 108, 0, 0, 58, 0, 0],
    gates: [0.55, 0.35, 0.35, 0.28, 0.35, 0.35, 0.45, 0.35, 0.35, 0.35, 0.65, 0.35, 0.35, 0.25, 0.35, 0.35],
    pickOffset: ({ stepIdx, stepCount, pool }) =>
      stepIdx >= stepCount - 4 && pool.length > 1 ? pool[1] : pool[0]
  },
  'robert-hood': {
    // Minimal Nation / Floorplan: driving off-beat + motorik 16th ghost stabs
    vels:  [0, 0, 118, 0, 0, 64, 104, 0, 0, 0, 114, 0, 72, 0, 98, 0],
    gates: [0.32, 0.32, 0.32, 0.32, 0.32, 0.22, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.22, 0.32, 0.32, 0.32],
    pickOffset: ({ hitIndex, pool }) =>
      hitIndex % 3 === 2 && pool.length > 1 ? pool[1] : pool[0]
  },
  shed: {
    // Shed / Wax: broken Berlin warehouse groove with moving chord intervals
    vels:  [115, 0, 0, 92, 0, 0, 0, 106, 0, 76, 0, 0, 112, 0, 82, 0],
    gates: [0.38, 0.38, 0.38, 0.65, 0.38, 0.38, 0.38, 0.38, 0.38, 0.65, 0.38, 0.38, 0.38, 0.38, 0.65, 0.38],
    pickOffset: ({ hitIndex, pool }) => pool[hitIndex % pool.length]
  },
  deepchord: {
    // Deepchord / Echospace: wide breathing underwater chords with long echo gaps
    vels:  [104, 0, 0, 0, 0, 0, 74, 0, 0, 0, 98, 0, 0, 0, 62, 0],
    gates: [0.9, 0.45, 0.45, 0.45, 0.45, 0.45, 0.85, 0.45, 0.45, 0.45, 1.4, 0.45, 0.45, 0.45, 0.6, 0.45],
    pickOffset: ({ hitIndex, pool }) =>
      hitIndex % 2 === 1 && pool.length > 1 ? pool[1] : pool[0]
  },
  maurizio: {
    // Maurizio M-series: hypnotic off-beat lock with subtle trailing 16th ghost
    vels:  [0, 0, 108, 0, 0, 58, 102, 0, 0, 0, 110, 0, 0, 0, 88, 52],
    gates: [0.4, 0.35, 0.45, 0.35, 0.35, 0.22, 0.45, 0.35, 0.35, 0.35, 0.48, 0.35, 0.35, 0.35, 0.42, 0.2],
    pickOffset: ({ hitIndex, pool }) =>
      hitIndex >= 4 && pool.length > 2 ? pool[2] : pool[0]
  },
  'rhythm-sound': {
    // Rhythm & Sound: reggae-dub off-beat skank & spacious late echo stabs
    vels:  [0, 0, 110, 0, 0, 0, 96, 0, 0, 0, 114, 0, 0, 72, 0, 0],
    gates: [0.45, 0.4, 0.85, 0.4, 0.4, 0.4, 0.75, 0.4, 0.4, 0.4, 0.9, 0.4, 0.4, 0.35, 0.4, 0.4],
    pickOffset: ({ hitIndex, pool }) =>
      hitIndex % 2 === 1 && pool.length > 1 ? pool[pool.length - 1] : pool[0]
  },
  monolake: {
    // Monolake: surgical Berlin polyrhythmic 3-over-16 micro-stabs
    vels:  [106, 0, 0, 84, 0, 0, 102, 0, 0, 76, 0, 0, 110, 0, 0, 66],
    gates: [0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.28, 0.22, 0.22, 0.22, 0.22, 0.22, 0.35, 0.22, 0.22, 0.2],
    pickOffset: ({ hitIndex, pool }) => pool[hitIndex % pool.length]
  }
};

/**
 * Generate a curated or Euclidean dub techno sequence.
 */
export function generateDubSequence({
  style = 'basic-channel',
  stepCount = 16,
  pulses = 5,
  rotation = 2,
  intervalPool = [0, 3, 5, 7],
  scaleId = 'minor',
  humanize = true
}) {
  const pool = intervalPool && intervalPool.length > 0 ? intervalPool : [0];
  const steps = Array.from({ length: stepCount }, () => createDefaultStep());

  const template = CURATED_SEQUENCE_TEMPLATES[style];
  if (template) {
    let hitIndex = 0;
    for (let i = 0; i < stepCount; i++) {
      const idx = (i + rotation) % 16;
      const baseVel = template.vels[idx];
      const active = baseVel > 0;
      const offsetRaw = active
        ? template.pickOffset({ stepIdx: i, stepCount, hitIndex, pool })
        : pool[0];
      if (active) hitIndex++;

      steps[i] = createDefaultStep({
        active,
        velocity: active ? jitterVel(baseVel, humanize, 6) : 90,
        offset: quantizeOffsetToScale(offsetRaw, scaleId),
        gate: template.gates[idx]
      });
    }
    return steps;
  }

  // Euclidean mode
  const hits = generateEuclideanPattern(stepCount, pulses, rotation);
  let hitIdx = 0;
  for (let i = 0; i < stepCount; i++) {
    const active = hits[i];
    const isDownbeat = i % 4 === 0;
    const isOffbeat = i % 4 === 2;
    const baseVel = isDownbeat ? 112 : isOffbeat ? 98 : 74;
    const offsetRaw = active ? pool[hitIdx % pool.length] : pool[0];
    if (active) hitIdx++;

    steps[i] = createDefaultStep({
      active,
      velocity: active ? jitterVel(baseVel, humanize, 8) : 90,
      offset: quantizeOffsetToScale(offsetRaw, scaleId),
      gate: isOffbeat ? 0.5 : 0.35
    });
  }
  return steps;
}

function jitterVel(base, enabled, range) {
  if (!enabled) return Math.max(1, Math.min(127, base));
  const delta = Math.round((Math.random() * 2 - 1) * range);
  return Math.max(24, Math.min(127, base + delta));
}

/**
 * Shift steps circularly by `delta` (+1 = right, -1 = left).
 */
export function rotateSteps(steps, delta) {
  const n = steps.length;
  if (n === 0) return [];
  const shift = ((delta % n) + n) % n;
  return steps.map((_, i) => ({ ...steps[(i - shift + n) % n] }));
}

/**
 * Compute start time in 16th-note units for step `index`, incorporating swing (0..0.75).
 * Odd 16th steps (1, 3, 5, ...) are delayed proportionally to swing.
 */
export function getStepStartInSixteenths(index, swingRatio = 0) {
  const clampedSwing = Math.max(0, Math.min(0.75, swingRatio));
  const isOdd = index % 2 === 1;
  // Standard MPC swing: 50% = straight (0 delay), 66% = triplet feel (+0.333 of a 16th)
  // Here swingRatio 0..0.75 maps linearly up to +0.5 of a 16th note
  const delay = isOdd ? clampedSwing * 0.6667 : 0;
  return index + delay;
}
