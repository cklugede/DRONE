/**
 * Music theory engine for Dub Techno chords, voicings, and intervals.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const CHORD_PRESETS = [
  { id: 'min7', name: 'Min7', short: 'm7', intervals: [0, 3, 7, 10], tag: 'Basic Channel' },
  { id: 'min9', name: 'Min9', short: 'm9', intervals: [0, 3, 7, 10, 14], tag: 'Deepchord' },
  { id: 'min11', name: 'Min11', short: 'm11', intervals: [0, 3, 7, 10, 14, 17], tag: 'Warehouse' },
  { id: 'min6', name: 'Min6', short: 'm6', intervals: [0, 3, 7, 9], tag: 'Maurizio' },
  { id: 'minadd9', name: 'Min(add9)', short: 'm(add9)', intervals: [0, 3, 7, 14], tag: 'Open Minor' },
  { id: 'min7no5', name: 'Min7 (no5)', short: 'm7(no5)', intervals: [0, 3, 10], tag: 'Sparse Dub' },
  { id: 'quartal', name: 'Quartal (4ths)', short: '4th', intervals: [0, 5, 10, 15], tag: 'Shed / Wax' },
  { id: 'sus4', name: 'Sus4', short: 'sus4', intervals: [0, 5, 7], tag: 'Robert Hood' },
  { id: '7sus4', name: '7sus4', short: '7sus4', intervals: [0, 5, 7, 10], tag: 'Minimal Stab' },
  { id: 'sus2', name: 'Sus2', short: 'sus2', intervals: [0, 2, 7], tag: 'Hypnotic' },
  { id: 'power', name: '5th + Oct', short: '5+8', intervals: [0, 7, 12], tag: 'Detuned Raw' },
  { id: 'maj7', name: 'Maj7', short: 'maj7', intervals: [0, 4, 7, 11], tag: 'Rhythm & Sound' }
];

export const VOICING_MODES = [
  { id: 'close', name: 'Close' },
  { id: 'drop2', name: 'Drop 2' },
  { id: 'drop3', name: 'Drop 3' },
  { id: 'open', name: 'Open Spread' }
];

export const INTERVAL_CATALOG = [
  { semitones: 0, short: 'R', name: 'Root' },
  { semitones: 1, short: 'm2', name: 'Minor 2nd' },
  { semitones: 2, short: 'M2', name: 'Major 2nd' },
  { semitones: 3, short: 'm3', name: 'Minor 3rd' },
  { semitones: 4, short: 'M3', name: 'Major 3rd' },
  { semitones: 5, short: 'P4', name: 'Perfect 4th' },
  { semitones: 6, short: 'TT', name: 'Tritone' },
  { semitones: 7, short: 'P5', name: 'Perfect 5th' },
  { semitones: 8, short: 'm6', name: 'Minor 6th' },
  { semitones: 9, short: 'M6', name: 'Major 6th' },
  { semitones: 10, short: 'm7', name: 'Minor 7th' },
  { semitones: 11, short: 'M7', name: 'Major 7th' },
  { semitones: 12, short: 'Oct', name: 'Octave' },
  { semitones: 14, short: 'M9', name: 'Major 9th' },
  { semitones: 15, short: 'm10', name: 'Minor 10th' },
  { semitones: 17, short: 'P11', name: '11th' },
  { semitones: 19, short: 'P12', name: '12th' }
];

export const SCALES = [
  { id: 'minor', name: 'Natural Minor', degrees: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'dorian', name: 'Dorian', degrees: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'phrygian', name: 'Phrygian', degrees: [0, 1, 3, 5, 7, 8, 10] },
  { id: 'minPent', name: 'Minor Pentatonic', degrees: [0, 3, 5, 7, 10] },
  { id: 'chromatic', name: 'Chromatic', degrees: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
];

export const STEP_INTERVAL_OPTIONS = [
  { offset: -12, label: '-Oct' },
  { offset: -7, label: '-5th' },
  { offset: -5, label: '-4th' },
  { offset: -2, label: '-m7' },
  { offset: 0, label: '0' },
  { offset: 2, label: '+M2' },
  { offset: 3, label: '+m3' },
  { offset: 5, label: '+P4' },
  { offset: 7, label: '+P5' },
  { offset: 8, label: '+m6' },
  { offset: 10, label: '+m7' },
  { offset: 12, label: '+Oct' }
];

/**
 * Convert MIDI note number (0-127) to human-readable name (e.g. 60 -> C4).
 */
export function midiToNoteName(midi) {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(clamped / 12) - 1;
  const note = NOTE_NAMES[clamped % 12];
  return `${note}${octave}`;
}

/**
 * Convert root pitch class (0-11) and octave (-1..9) to MIDI note number.
 */
export function rootToMidi(rootPc, octave) {
  const pc = ((rootPc % 12) + 12) % 12;
  return Math.max(0, Math.min(127, (octave + 1) * 12 + pc));
}

/**
 * Convert MIDI note number to frequency in Hz (A4 = 440Hz).
 */
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Return a readable interval label for a semitone offset.
 */
export function formatIntervalLabel(semitones) {
  if (semitones === 0) return 'R';
  const match = INTERVAL_CATALOG.find((item) => item.semitones === semitones);
  if (match) return `+${semitones} ${match.short}`;
  const sign = semitones > 0 ? '+' : '';
  return `${sign}${semitones}st`;
}

/**
 * Format signed semitone offset compactly for sequencer steps.
 */
export function formatStepOffset(offset) {
  if (offset === 0) return '0';
  return offset > 0 ? `+${offset}` : `${offset}`;
}

/**
 * Apply chord inversion and drop voicing to a sorted array of semitone intervals.
 * Returns sorted MIDI note numbers clamped to [12, 108].
 */
export function voiceChord({
  rootPc = 5, // F
  octave = 3,
  intervals = [0, 3, 7, 10],
  inversion = 0,
  voicing = 'close',
  transpose = 0
}) {
  const baseMidi = rootToMidi(rootPc, octave) + transpose;
  const uniqueIntervals = [...new Set(intervals)].sort((a, b) => a - b);
  if (uniqueIntervals.length === 0) return [];

  let notes = uniqueIntervals.map((iv) => baseMidi + iv);

  // Apply inversion by raising lowest note(s) by an octave
  const invCount = Math.max(0, Math.min(inversion, notes.length - 1));
  for (let i = 0; i < invCount; i++) {
    const lowest = notes.shift();
    notes.push(lowest + 12);
    notes.sort((a, b) => a - b);
  }

  // Apply drop / spread voicing
  if (voicing === 'drop2' && notes.length >= 3) {
    const idx = notes.length - 2;
    notes[idx] -= 12;
  } else if (voicing === 'drop3' && notes.length >= 4) {
    const idx = notes.length - 3;
    notes[idx] -= 12;
  } else if (voicing === 'open' && notes.length >= 3) {
    notes = notes.map((n, i) => (i % 2 === 1 ? n + 12 : n));
  }

  // Deduplicate, sort, and keep within playable synth/MIDI range
  const finalNotes = [...new Set(notes)]
    .map((n) => Math.max(12, Math.min(108, n)))
    .sort((a, b) => a - b);

  return finalNotes;
}

/**
 * Compute chord display name from root, preset id, and custom intervals.
 */
export function getChordSymbol(rootPc, presetId, customIntervals) {
  const rootName = NOTE_NAMES[((rootPc % 12) + 12) % 12];
  if (presetId && presetId !== 'custom') {
    const preset = CHORD_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      return `${rootName}${preset.short}`;
    }
  }
  const count = customIntervals ? customIntervals.length : 0;
  return `${rootName} Custom (${count})`;
}

/**
 * Quantize a semitone offset to the nearest degree in a given scale.
 */
export function quantizeOffsetToScale(offset, scaleId) {
  const scale = SCALES.find((s) => s.id === scaleId);
  if (!scale || scale.id === 'chromatic') return offset;

  const octaveShift = Math.floor(offset / 12) * 12;
  const pc = ((offset % 12) + 12) % 12;

  let bestDegree = scale.degrees[0];
  let bestDist = Infinity;
  for (const deg of scale.degrees) {
    const dist = Math.abs(deg - pc);
    if (dist < bestDist) {
      bestDist = dist;
      bestDegree = deg;
    }
  }
  return octaveShift + bestDegree;
}
