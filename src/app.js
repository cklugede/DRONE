/**
 * Main UI controller for DUB LAB.
 */

import {
  NOTE_NAMES,
  CHORD_PRESETS,
  VOICING_MODES,
  INTERVAL_CATALOG,
  SCALES,
  STEP_INTERVAL_OPTIONS,
  midiToNoteName,
  rootToMidi,
  voiceChord,
  getChordSymbol,
  formatStepOffset,
  quantizeOffsetToScale
} from './theory.js';

import {
  SEQUENCE_STYLES,
  generateDubSequence,
  resizeSteps,
  rotateSteps,
  createDefaultStep
} from './sequencer.js';

import { buildMidiBytes, downloadMidiFile } from './midi.js';
import {
  DubAudioEngine,
  SOUND_PRESETS,
  FX_PRESETS,
  DELAY_MS_MIN,
  DELAY_MS_MAX,
  delaySubdivToMs,
  renderMixOffline
} from './audio.js';
import {
  encodeWavFromAudioBuffer,
  createZipArchive,
  triggerBlobDownload
} from './wav.js';
import {
  DRUM_TRACKS,
  DRUM_SOUND_PRESETS,
  buildDefaultDrumPatterns,
  resizeDrumPatterns,
  createEmptyDrumPatterns
} from './drums.js';
import {
  BASS_PRESETS,
  BASS_OFFSET_CYCLE,
  generateBassSequence,
  resizeBassSteps,
  createEmptyBassSteps,
  getBassMidiNote
} from './bass.js';
import {
  HistoryManager,
  getNextPoolOffset,
  serializeProject,
  parseProjectJson
} from './project.js';

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
const STORAGE_KEY = 'dub-lab-autosave-v3';

const MIXER_CHANNELS = [
  { id: 'chords', label: 'Chords', tone: 'chords', kind: 'source' },
  { id: 'kick', label: 'Kick', tone: 'drum', kind: 'source' },
  { id: 'rim', label: 'Rim / Clap', tone: 'drum', kind: 'source' },
  { id: 'ch', label: 'Closed Hat', tone: 'drum', kind: 'source' },
  { id: 'oh', label: 'Open Hat', tone: 'drum', kind: 'source' },
  { id: 'bass', label: 'Bass', tone: 'bass', kind: 'source' },
  { id: 'delay', label: 'Delay Rtn', tone: 'fx', kind: 'return' },
  { id: 'reverb', label: 'Reverb Rtn', tone: 'fx', kind: 'return' },
  { id: 'master', label: 'Master', tone: 'master', kind: 'master' }
];

const STEM_DEFINITIONS = [
  { mode: 'sum', filename: '00-sum.wav' },
  { mode: 'chords', filename: '01-chords.wav' },
  { mode: 'kick', filename: '02-kick.wav' },
  { mode: 'rim', filename: '03-rim-clap.wav' },
  { mode: 'ch', filename: '04-closed-hat.wav' },
  { mode: 'oh', filename: '05-open-hat.wav' },
  { mode: 'bass', filename: '06-bass.wav' },
  { mode: 'delay', filename: '07-fx-delay.wav' },
  { mode: 'reverb', filename: '08-fx-reverb.wav' }
];

const audio = new DubAudioEngine();
const history = new HistoryManager(50);

function createDefaultMixer() {
  return {
    faders: {
      chords: 0.78,
      bass: 0.8,
      kick: 0.85,
      rim: 0.8,
      ch: 0.75,
      oh: 0.75,
      delay: 0.75,
      reverb: 0.7,
      master: 0.85
    },
    pans: {
      chords: 0,
      bass: 0,
      kick: 0,
      rim: 0.15,
      ch: -0.2,
      oh: 0.25,
      delay: 0,
      reverb: 0
    },
    delaySends: {
      chords: 0.56,
      bass: 0.0,
      kick: 0.0,
      rim: 0.35,
      ch: 0.12,
      oh: 0.28
    },
    reverbSends: {
      chords: 0.44,
      bass: 0.0,
      kick: 0.0,
      rim: 0.25,
      ch: 0.1,
      oh: 0.25
    },
    mutes: {
      chords: false,
      bass: false,
      kick: false,
      rim: false,
      ch: false,
      oh: false,
      delay: false,
      reverb: false,
      master: false
    },
    solos: {
      chords: false,
      bass: false,
      kick: false,
      rim: false,
      ch: false,
      oh: false,
      delay: false,
      reverb: false
    }
  };
}

let state = {
  bpm: 126,
  swingRatio: 0.12,
  stepCount: 16,
  playheadStep: -1,

  // Chord Module
  rootPc: 5, // F
  octave: 3,
  presetId: 'min9',
  lastPresetId: 'min9',
  intervals: [0, 3, 7, 10, 14],
  inversion: 0,
  voicing: 'drop2',

  // Interval editor & sequence pool
  scaleId: 'minor',
  intervalPoolEnabled: true,
  intervalPool: [0, 3, 5, 7],

  // Sequence & Generator
  seqStyle: 'basic-channel',
  pulses: 5,
  rotation: 0,
  steps: [],

  // Chord Sound preset
  soundPresetId: 'basic-channel',

  // Bass Module (presets shape sound only, not sequence)
  bass: {
    enabled: true,
    presetId: 'basic-channel',
    octave: 1,
    sound: { ...BASS_PRESETS[0].sound },
    steps: []
  },

  // Drum Module (presets shape sound kit only, not sequence)
  drums: {
    enabled: true,
    presetId: 'basic-channel',
    muted: {},
    tone: { ...DRUM_SOUND_PRESETS[0].tone },
    patterns: buildDefaultDrumPatterns(16)
  },

  // Dub FX Module (Delay & Reverb)
  fxPresetId: 'basic-channel',
  fxParams: { ...FX_PRESETS['basic-channel'] },

  // Mixer Console
  mixer: createDefaultMixer()
};

state.steps = generateDubSequence({
  style: state.seqStyle,
  stepCount: state.stepCount,
  pulses: state.pulses,
  rotation: state.rotation,
  intervalPool: state.intervalPool,
  scaleId: state.scaleId,
  humanize: false
});

state.bass.steps = generateBassSequence({
  presetId: state.bass.presetId,
  stepCount: state.stepCount,
  scaleId: state.scaleId
});

// DOM references
const els = {
  statusLed: document.getElementById('statusLed'),
  playBtn: document.getElementById('playBtn'),
  playIcon: document.getElementById('playIcon'),
  playLabel: document.getElementById('playLabel'),
  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),
  bpmInput: document.getElementById('bpmInput'),
  swingInput: document.getElementById('swingInput'),
  swingValue: document.getElementById('swingValue'),
  stepCountSelect: document.getElementById('stepCountSelect'),
  saveStateBtn: document.getElementById('saveStateBtn'),
  loadStateBtn: document.getElementById('loadStateBtn'),
  loadFileInput: document.getElementById('loadFileInput'),
  exportLoopsSelect: document.getElementById('exportLoopsSelect'),
  exportMidiBtn: document.getElementById('exportMidiBtn'),
  exportWavBtn: document.getElementById('exportWavBtn'),
  exportStemsBtn: document.getElementById('exportStemsBtn'),

  chordSymbol: document.getElementById('chordSymbol'),
  chordNotesList: document.getElementById('chordNotesList'),
  rootGrid: document.getElementById('rootGrid'),
  octaveSelect: document.getElementById('octaveSelect'),
  voicingSelect: document.getElementById('voicingSelect'),
  inversionSelect: document.getElementById('inversionSelect'),
  chordPresetGrid: document.getElementById('chordPresetGrid'),
  miniKeyboard: document.getElementById('miniKeyboard'),

  chordIntervalGrid: document.getElementById('chordIntervalGrid'),
  resetIntervalsBtn: document.getElementById('resetIntervalsBtn'),
  poolEnabledBtn: document.getElementById('poolEnabledBtn'),
  scaleSelect: document.getElementById('scaleSelect'),
  intervalPoolBlock: document.getElementById('intervalPoolBlock'),
  intervalPoolGrid: document.getElementById('intervalPoolGrid'),
  applyPoolBtn: document.getElementById('applyPoolBtn'),

  stylePills: document.getElementById('stylePills'),
  pulsesInput: document.getElementById('pulsesInput'),
  pulsesField: document.getElementById('pulsesField'),
  rotationInput: document.getElementById('rotationInput'),
  generateBtn: document.getElementById('generateBtn'),
  shiftLeftBtn: document.getElementById('shiftLeftBtn'),
  shiftRightBtn: document.getElementById('shiftRightBtn'),
  clearSeqBtn: document.getElementById('clearSeqBtn'),
  stepGrid: document.getElementById('stepGrid'),

  soundPresetPills: document.getElementById('soundPresetPills'),
  chordSynthGrid: document.getElementById('chordSynthGrid'),

  // Bass Module
  bassPresetPills: document.getElementById('bassPresetPills'),
  bassEnabledBtn: document.getElementById('bassEnabledBtn'),
  bassOctaveSelect: document.getElementById('bassOctaveSelect'),
  generateBassBtn: document.getElementById('generateBassBtn'),
  clearBassBtn: document.getElementById('clearBassBtn'),
  bassSoundGrid: document.getElementById('bassSoundGrid'),
  bassGrid: document.getElementById('bassGrid'),

  // Drum Module
  drumKitTag: document.getElementById('drumKitTag'),
  drumPresetPills: document.getElementById('drumPresetPills'),
  drumEnabledBtn: document.getElementById('drumEnabledBtn'),
  initDrumsBtn: document.getElementById('initDrumsBtn'),
  clearDrumsBtn: document.getElementById('clearDrumsBtn'),
  drumGrid: document.getElementById('drumGrid'),

  // Dub FX Module
  fxPresetPills: document.getElementById('fxPresetPills'),
  fxParamGrid: document.getElementById('fxParamGrid'),

  // Mixer Module
  mixerConsole: document.getElementById('mixerConsole')
};

// Shared metadata for uniform Braun rotary parameter knobs across FX, Chord Synth, and Bass
const PARAM_KNOB_GROUPS = {
  fx: [
    {
      key: 'delayMs',
      label: 'Delay Time',
      min: DELAY_MS_MIN,
      max: DELAY_MS_MAX,
      step: 1,
      def: 357,
      tone: 'fx',
      fmt: (v) => `${Math.round(v)}ms`,
      get: () => state.fxParams.delayMs ?? 357,
      set: (v) => {
        state.fxPresetId = 'custom';
        state.fxParams.delayMs = Math.round(v);
        audio.applyFxParams(state.fxParams, state.bpm);
        els.fxPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-fx'));
      }
    },
    {
      key: 'delayFeedback',
      label: 'Feedback',
      min: 0,
      max: 88,
      step: 1,
      def: 62,
      tone: 'fx',
      fmt: (v) => `${Math.round(v)}%`,
      get: () => Math.round((state.fxParams.delayFeedback ?? 0.62) * 100),
      set: (v) => {
        state.fxPresetId = 'custom';
        state.fxParams.delayFeedback = v / 100;
        audio.applyFxParams(state.fxParams, state.bpm);
        els.fxPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-fx'));
      }
    },
    {
      key: 'tapeTone',
      label: 'Tape Tone',
      min: 500,
      max: 5500,
      step: 50,
      def: 1850,
      tone: 'fx',
      fmt: (v) => `${(v / 1000).toFixed(1)}k`,
      get: () => Math.round(state.fxParams.tapeTone ?? 1850),
      set: (v) => {
        state.fxPresetId = 'custom';
        state.fxParams.tapeTone = v;
        audio.applyFxParams(state.fxParams, state.bpm);
        els.fxPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-fx'));
      }
    },
    {
      key: 'tapeFlutter',
      label: 'Wow/Flutter',
      min: 0,
      max: 100,
      step: 1,
      def: 35,
      tone: 'fx',
      fmt: (v) => `${Math.round(v)}%`,
      get: () => Math.round((state.fxParams.tapeFlutter ?? 0.35) * 100),
      set: (v) => {
        state.fxPresetId = 'custom';
        state.fxParams.tapeFlutter = v / 100;
        audio.applyFxParams(state.fxParams, state.bpm);
        els.fxPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-fx'));
      }
    },
    {
      key: 'delayToReverb',
      label: 'Delay → Rev',
      min: 0,
      max: 100,
      step: 1,
      def: 42,
      tone: 'fx',
      fmt: (v) => `${Math.round(v)}%`,
      get: () => Math.round((state.fxParams.delayToReverb ?? 0.42) * 100),
      set: (v) => {
        state.fxPresetId = 'custom';
        state.fxParams.delayToReverb = v / 100;
        audio.applyFxParams(state.fxParams, state.bpm);
        els.fxPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-fx'));
      }
    },
    {
      key: 'reverbDecay',
      label: 'Reverb Size',
      min: 0.8,
      max: 6.5,
      step: 0.1,
      def: 3.4,
      tone: 'fx',
      fmt: (v) => `${Number(v).toFixed(1)}s`,
      get: () => Number(state.fxParams.reverbDecay ?? 3.4),
      set: (v) => {
        state.fxPresetId = 'custom';
        state.fxParams.reverbDecay = v;
        audio.applyFxParams(state.fxParams, state.bpm);
        els.fxPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-fx'));
      }
    },
    {
      key: 'reverbTone',
      label: 'Reverb Tone',
      min: 800,
      max: 5500,
      step: 50,
      def: 3200,
      tone: 'fx',
      fmt: (v) => `${(v / 1000).toFixed(1)}k`,
      get: () => Math.round(state.fxParams.reverbTone ?? 3200),
      set: (v) => {
        state.fxPresetId = 'custom';
        state.fxParams.reverbTone = v;
        audio.applyFxParams(state.fxParams, state.bpm);
        els.fxPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-fx'));
      }
    }
  ],
  chord: [
    {
      key: 'cutoff',
      label: 'Cutoff',
      min: 70,
      max: 1600,
      step: 5,
      def: 240,
      tone: 'chord',
      fmt: (v) => `${Math.round(v)}Hz`,
      get: () => Math.round(audio.chordSound.cutoff),
      set: (v) => {
        state.soundPresetId = 'custom';
        audio.applyChordParams({ cutoff: v }, state.bpm);
        els.soundPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
      }
    },
    {
      key: 'resonance',
      label: 'Resonance',
      min: 0.7,
      max: 11,
      step: 0.1,
      def: 4.2,
      tone: 'chord',
      fmt: (v) => Number(v).toFixed(1),
      get: () => Number(audio.chordSound.resonance),
      set: (v) => {
        state.soundPresetId = 'custom';
        audio.applyChordParams({ resonance: v }, state.bpm);
        els.soundPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
      }
    },
    {
      key: 'envDecay',
      label: 'Env Decay',
      min: 80,
      max: 900,
      step: 10,
      def: 340,
      tone: 'chord',
      fmt: (v) => `${Math.round(v)}ms`,
      get: () => Math.round(audio.chordSound.envDecay * 1000),
      set: (v) => {
        state.soundPresetId = 'custom';
        audio.applyChordParams({ envDecay: v / 1000 }, state.bpm);
        els.soundPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
      }
    },
    {
      key: 'detune',
      label: 'Detune',
      min: 0,
      max: 28,
      step: 1,
      def: 9,
      tone: 'chord',
      fmt: (v) => `${Math.round(v)}ct`,
      get: () => Math.round(audio.chordSound.detune),
      set: (v) => {
        state.soundPresetId = 'custom';
        audio.applyChordParams({ detune: v }, state.bpm);
        els.soundPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
      }
    },
    {
      key: 'drive',
      label: 'Tape Drive',
      min: 0,
      max: 100,
      step: 1,
      def: 25,
      tone: 'chord',
      fmt: (v) => `${Math.round(v)}%`,
      get: () => Math.round(audio.chordSound.drive * 100),
      set: (v) => {
        state.soundPresetId = 'custom';
        audio.applyChordParams({ drive: v / 100 }, state.bpm);
        els.soundPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
      }
    }
  ],
  bass: [
    {
      key: 'cutoff',
      label: 'Cutoff',
      min: 70,
      max: 900,
      step: 5,
      def: 175,
      tone: 'bass',
      fmt: (v) => `${Math.round(v)}Hz`,
      get: () => Math.round(state.bass.sound.cutoff),
      set: (v) => {
        state.bass.presetId = 'custom';
        state.bass.sound.cutoff = v;
        syncMixerToAudio();
        els.bassPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-teal'));
      }
    },
    {
      key: 'resonance',
      label: 'Resonance',
      min: 0.7,
      max: 10,
      step: 0.1,
      def: 3.2,
      tone: 'bass',
      fmt: (v) => Number(v).toFixed(1),
      get: () => Number(state.bass.sound.resonance ?? 3.2),
      set: (v) => {
        state.bass.presetId = 'custom';
        state.bass.sound.resonance = v;
        syncMixerToAudio();
        els.bassPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-teal'));
      }
    },
    {
      key: 'envAmount',
      label: 'Env Depth',
      min: 0,
      max: 2000,
      step: 20,
      def: 420,
      tone: 'bass',
      fmt: (v) => `${Math.round(v)}Hz`,
      get: () => Math.round(state.bass.sound.envAmount ?? 420),
      set: (v) => {
        state.bass.presetId = 'custom';
        state.bass.sound.envAmount = v;
        syncMixerToAudio();
        els.bassPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-teal'));
      }
    },
    {
      key: 'decay',
      label: 'Decay',
      min: 70,
      max: 700,
      step: 10,
      def: 280,
      tone: 'bass',
      fmt: (v) => `${Math.round(v)}ms`,
      get: () => Math.round(state.bass.sound.decay * 1000),
      set: (v) => {
        state.bass.presetId = 'custom';
        state.bass.sound.decay = v / 1000;
        syncMixerToAudio();
        els.bassPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-teal'));
      }
    },
    {
      key: 'release',
      label: 'Release',
      min: 20,
      max: 650,
      step: 5,
      def: 150,
      tone: 'bass',
      fmt: (v) => `${Math.round(v)}ms`,
      get: () => Math.round((state.bass.sound.release ?? 0.15) * 1000),
      set: (v) => {
        state.bass.presetId = 'custom';
        state.bass.sound.release = v / 1000;
        syncMixerToAudio();
        els.bassPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-teal'));
      }
    },
    {
      key: 'drive',
      label: 'Drive',
      min: 0,
      max: 100,
      step: 1,
      def: 24,
      tone: 'bass',
      fmt: (v) => `${Math.round(v)}%`,
      get: () => Math.round(state.bass.sound.drive * 100),
      set: (v) => {
        state.bass.presetId = 'custom';
        state.bass.sound.drive = v / 100;
        syncMixerToAudio();
        els.bassPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-teal'));
      }
    },
    {
      key: 'shape',
      label: 'Sub / Saw',
      min: 0,
      max: 100,
      step: 1,
      def: 28,
      tone: 'bass',
      fmt: (v) => `${Math.round(v)}%`,
      get: () => Math.round(state.bass.sound.shape * 100),
      set: (v) => {
        state.bass.presetId = 'custom';
        state.bass.sound.shape = v / 100;
        syncMixerToAudio();
        els.bassPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-teal'));
      }
    },
    {
      key: 'fmAmount',
      label: 'FM Growl',
      min: 0,
      max: 100,
      step: 1,
      def: 12,
      tone: 'bass',
      fmt: (v) => `${Math.round(v)}%`,
      get: () => Math.round((state.bass.sound.fmAmount ?? 0.12) * 100),
      set: (v) => {
        state.bass.presetId = 'custom';
        state.bass.sound.fmAmount = v / 100;
        syncMixerToAudio();
        els.bassPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-teal'));
      }
    },
    {
      key: 'subPunch',
      label: 'Sub Punch',
      min: 0,
      max: 100,
      step: 1,
      def: 35,
      tone: 'bass',
      fmt: (v) => `${Math.round(v)}%`,
      get: () => Math.round((state.bass.sound.subPunch ?? 0.35) * 100),
      set: (v) => {
        state.bass.presetId = 'custom';
        state.bass.sound.subPunch = v / 100;
        syncMixerToAudio();
        els.bassPresetPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active-teal'));
      }
    }
  ]
};

// --- Audio Mixer Sync ---

function getEffectiveMixerState() {
  return {
    ...state.mixer,
    mutes: {
      ...state.mixer.mutes,
      kick: Boolean(state.mixer.mutes.kick || state.drums.muted.kick),
      rim: Boolean(state.mixer.mutes.rim || state.drums.muted.rim),
      ch: Boolean(state.mixer.mutes.ch || state.drums.muted.ch),
      oh: Boolean(state.mixer.mutes.oh || state.drums.muted.oh)
    }
  };
}

function syncMixerToAudio() {
  audio.applyMixer(getEffectiveMixerState(), { bassDrive: state.bass.sound.drive });
}

// --- Snapshot, Undo/Redo, and Save/Load ---

function captureSnapshot() {
  const { playheadStep, ...persistableState } = state;
  return {
    state: structuredClone(persistableState),
    synthParams: structuredClone(audio.chordSound)
  };
}

function normalizeLoadedState(loaded, loadedSynthParams = null) {
  const defaults = createDefaultMixer();
  const next = {
    ...state,
    ...structuredClone(loaded),
    playheadStep: state.playheadStep
  };
  next.bass = {
    ...state.bass,
    ...(loaded.bass || {}),
    sound: { ...BASS_PRESETS[0].sound, ...(loaded.bass?.sound || {}) }
  };
  next.drums = {
    ...state.drums,
    ...(loaded.drums || {}),
    tone: { ...DRUM_SOUND_PRESETS[0].tone, ...(loaded.drums?.tone || {}) }
  };

  // Migrate older projects where FX params lived inside synthParams / delaySubdiv
  const legacyFx = {};
  if (loadedSynthParams) {
    if (loadedSynthParams.delaySubdiv !== undefined) {
      legacyFx.delayMs = delaySubdivToMs(loadedSynthParams.delaySubdiv, next.bpm || 126);
    }
    if (loadedSynthParams.delayFeedback !== undefined) legacyFx.delayFeedback = loadedSynthParams.delayFeedback;
    if (loadedSynthParams.tapeTone !== undefined) legacyFx.tapeTone = loadedSynthParams.tapeTone;
  }
  if (loaded.fxParams?.delaySubdiv !== undefined && loaded.fxParams?.delayMs === undefined) {
    legacyFx.delayMs = delaySubdivToMs(loaded.fxParams.delaySubdiv, next.bpm || 126);
  }
  next.intervalPoolEnabled =
    loaded.intervalPoolEnabled !== undefined ? Boolean(loaded.intervalPoolEnabled) : true;
  next.fxPresetId = loaded.fxPresetId || (Object.keys(legacyFx).length ? 'custom' : state.fxPresetId);
  next.fxParams = {
    ...FX_PRESETS['basic-channel'],
    ...legacyFx,
    ...(loaded.fxParams || {})
  };
  delete next.fxParams.delaySubdiv;

  const legacyFxReturn = loaded.mixer?.faders?.fx;
  const legacyFxMuted = loaded.mixer?.mutes?.fx;
  next.mixer = {
    faders: {
      ...defaults.faders,
      ...(legacyFxReturn !== undefined ? { delay: legacyFxReturn, reverb: legacyFxReturn } : {}),
      ...(loaded.mixer?.faders || {})
    },
    pans: { ...defaults.pans, ...(loaded.mixer?.pans || {}) },
    delaySends: {
      ...defaults.delaySends,
      ...(loadedSynthParams?.delayMix !== undefined ? { chords: loadedSynthParams.delayMix } : {}),
      ...(loaded.mixer?.delaySends || {})
    },
    reverbSends: {
      ...defaults.reverbSends,
      ...(loadedSynthParams?.reverbMix !== undefined ? { chords: loadedSynthParams.reverbMix } : {}),
      ...(loaded.mixer?.reverbSends || {})
    },
    mutes: {
      ...defaults.mutes,
      ...(legacyFxMuted !== undefined ? { delay: legacyFxMuted, reverb: legacyFxMuted } : {}),
      ...(loaded.mixer?.mutes || {})
    },
    solos: { ...defaults.solos, ...(loaded.mixer?.solos || {}) }
  };
  return next;
}

function applySnapshot(snapshot) {
  if (!snapshot || !snapshot.state) return;
  state = normalizeLoadedState(snapshot.state, snapshot.synthParams);
  if (snapshot.synthParams) {
    audio.applyChordParams(snapshot.synthParams, state.bpm);
  }
  audio.applyFxParams(state.fxParams, state.bpm);
  syncMixerToAudio();
  renderAll();
  persistAutoSave();
}

function recordUndo() {
  history.push(captureSnapshot());
  updateHistoryButtons();
}

function updateHistoryButtons() {
  els.undoBtn.disabled = !history.canUndo();
  els.redoBtn.disabled = !history.canRedo();
}

function performUndo() {
  const prev = history.undo(captureSnapshot());
  if (!prev) return;
  applySnapshot(prev);
  updateHistoryButtons();
}

function performRedo() {
  const next = history.redo(captureSnapshot());
  if (!next) return;
  applySnapshot(next);
  updateHistoryButtons();
}

function persistAutoSave() {
  try {
    const json = serializeProject(captureSnapshot().state, audio.chordSound);
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

function restoreAutoSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('dub-lab-autosave-v2');
    if (!raw) return;
    const loaded = parseProjectJson(raw);
    applySnapshot(loaded);
  } catch {
    // Ignore corrupt localStorage data
  }
}

// --- Helpers ---

function getCurrentChordConfig() {
  return {
    rootPc: state.rootPc,
    octave: state.octave,
    intervals: state.intervals,
    inversion: state.inversion,
    voicing: state.voicing
  };
}

function auditionCurrentChord(offset = 0) {
  const notes = voiceChord({ ...getCurrentChordConfig(), transpose: offset });
  audio.applyChordParams(audio.chordSound, state.bpm);
  audio.applyFxParams(state.fxParams, state.bpm);
  syncMixerToAudio();
  audio.triggerChord(notes, { velocity: 102, gateSec: 0.24 });
}

// --- Renderers ---

function renderStaticSelects() {
  els.voicingSelect.innerHTML = VOICING_MODES.map(
    (v) => `<option value="${v.id}" ${v.id === state.voicing ? 'selected' : ''}>${v.name}</option>`
  ).join('');

  els.scaleSelect.innerHTML = SCALES.map(
    (s) => `<option value="${s.id}" ${s.id === state.scaleId ? 'selected' : ''}>${s.name}</option>`
  ).join('');
}

function renderGlobalBar() {
  els.bpmInput.value = String(state.bpm);
  const swingPct = Math.round(state.swingRatio * 100);
  els.swingInput.value = String(swingPct);
  els.swingValue.textContent = `${swingPct}%`;
  els.stepCountSelect.value = String(state.stepCount);
  updateHistoryButtons();
}

function renderChordSection() {
  els.rootGrid.innerHTML = NOTE_NAMES.map(
    (name, idx) =>
      `<button class="pill ${idx === state.rootPc ? 'active' : ''}" data-root="${idx}">${name}</button>`
  ).join('');

  els.chordPresetGrid.innerHTML = CHORD_PRESETS.map(
    (p) =>
      `<button class="pill ${p.id === state.presetId ? 'active' : ''}" data-preset="${p.id}" title="${p.tag}">${p.name}</button>`
  ).join('');

  els.octaveSelect.value = String(state.octave);
  els.voicingSelect.value = state.voicing;
  els.inversionSelect.value = String(state.inversion);

  const voiced = voiceChord(getCurrentChordConfig());
  els.chordSymbol.textContent = getChordSymbol(state.rootPc, state.presetId, state.intervals);
  els.chordNotesList.textContent =
    voiced.length > 0 ? voiced.map(midiToNoteName).join(' ') : 'No notes';

  renderMiniKeyboard(voiced);
}

function renderMiniKeyboard(voicedNotes) {
  const voicedSet = new Set(voicedNotes);
  const startOctave = Math.max(1, state.octave - 1);
  const startMidi = rootToMidi(0, startOctave);
  const endMidi = Math.min(108, startMidi + 35);

  let html = '';
  for (let m = startMidi; m <= endMidi; m++) {
    const pc = m % 12;
    const selected = voicedSet.has(m);
    if (!BLACK_PCS.has(pc)) {
      const label = pc === 0 || pc === state.rootPc ? midiToNoteName(m) : '';
      html += `<div class="key-white ${selected ? 'selected' : ''}" data-midi="${m}" title="${midiToNoteName(m)}">${label}</div>`;
    } else {
      html += `<div class="key-black"><div class="key-black-btn ${selected ? 'selected' : ''}" data-midi="${m}" title="${midiToNoteName(m)}"></div></div>`;
    }
  }
  els.miniKeyboard.innerHTML = html;
}

function renderIntervalSection() {
  els.scaleSelect.value = state.scaleId;
  els.poolEnabledBtn.setAttribute('aria-pressed', String(state.intervalPoolEnabled));
  els.poolEnabledBtn.textContent = state.intervalPoolEnabled ? 'Pool On' : 'Pool Off (Free)';
  els.intervalPoolBlock.classList.toggle('pool-disabled', !state.intervalPoolEnabled);

  const activeSet = new Set(state.intervals);
  els.chordIntervalGrid.innerHTML = INTERVAL_CATALOG.map((iv) => {
    const isActive = activeSet.has(iv.semitones);
    return `<button class="pill ${isActive ? 'active' : ''}" data-stack-iv="${iv.semitones}" title="${iv.name} (+${iv.semitones}st)">${iv.short}</button>`;
  }).join('');

  const poolSet = new Set(state.intervalPool);
  els.intervalPoolGrid.innerHTML = STEP_INTERVAL_OPTIONS.map((opt) => {
    const isActive = poolSet.has(opt.offset);
    return `<button class="pill ${isActive ? 'active-cyan' : ''}" data-pool-offset="${opt.offset}">${opt.label}</button>`;
  }).join('');
}

function renderSequenceToolbar() {
  els.stylePills.innerHTML = SEQUENCE_STYLES.map(
    (s) =>
      `<button class="pill ${s.id === state.seqStyle ? 'active' : ''}" data-style="${s.id}" title="${s.desc}">${s.name}</button>`
  ).join('');

  els.pulsesInput.max = String(state.stepCount);
  els.pulsesInput.value = String(Math.min(state.pulses, state.stepCount));
  els.rotationInput.max = String(state.stepCount - 1);
  els.rotationInput.value = String(state.rotation % state.stepCount);
  els.pulsesField.style.opacity = state.seqStyle === 'euclidean' ? '1' : '0.45';
}

function renderFreeStepNoteOptions(selectedOffset) {
  const baseMidi = rootToMidi(state.rootPc, state.octave);
  let html = '';
  for (let offset = -12; offset <= 12; offset++) {
    const noteName = midiToNoteName(baseMidi + offset);
    const label = `${noteName} (${formatStepOffset(offset)})`;
    html += `<option value="${offset}" ${offset === selectedOffset ? 'selected' : ''}>${label}</option>`;
  }
  return html;
}

function renderStepGrid() {
  els.stepGrid.classList.toggle('steps-8', state.stepCount === 8);
  els.stepGrid.innerHTML = state.steps
    .map((step, i) => {
      const isBeat = i % 4 === 0;
      const isPlaying = i === state.playheadStep;
      const velPct = Math.round(((step.velocity ?? 96) / 127) * 100);
      const offsetVal = step.offset ?? 0;
      const offsetStr = formatStepOffset(offsetVal);
      const gateVal = Math.max(0.1, Math.min(2.0, step.gate ?? 0.35));

      const pitchControlHtml = state.intervalPoolEnabled
        ? `<button class="step-offset-btn ${offsetVal !== 0 ? 'non-zero' : ''}" data-action="cycle-offset" data-step="${i}" title="Click to cycle pool interval (Shift+click for 0)">${offsetStr}</button>`
        : `<select class="step-note-select" data-action="step-note-select" data-step="${i}" aria-label="Step ${i + 1} note" title="Select note / semitone offset for step ${i + 1}">${renderFreeStepNoteOptions(offsetVal)}</select>`;

      return `
        <div class="step-col ${isBeat ? 'beat-start' : ''} ${step.active ? 'is-active' : ''} ${isPlaying ? 'playing' : ''}" data-step="${i}">
          <span class="step-num">${i + 1}</span>
          <button class="step-pad ${step.active ? 'active' : ''}" data-action="toggle-step" data-step="${i}" title="Toggle step ${i + 1}"></button>
          <div class="step-vel-wrap" data-action="vel-drag" data-step="${i}" title="Velocity: ${step.velocity} (drag vertically)">
            <div class="step-vel-bar" style="height: ${velPct}%"></div>
          </div>
          ${pitchControlHtml}
          <div class="step-gate-wrap" title="Gate length: ${gateVal.toFixed(2)}">
            <input class="step-gate-slider" type="range" min="0.1" max="2.0" step="0.05" value="${gateVal.toFixed(2)}" data-action="chord-gate" data-step="${i}" />
            <span class="step-gate-val">${gateVal.toFixed(2)}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderParamKnobGrid(containerEl, groupName) {
  const specs = PARAM_KNOB_GROUPS[groupName];
  if (!containerEl || !specs) return;
  containerEl.innerHTML = specs
    .map((spec) => {
      const val = spec.get();
      const norm = (val - spec.min) / (spec.max - spec.min);
      return `
        <div class="knob-field knob-rotary-field" data-param-tone="${spec.tone}">
          <span class="rotary-label">${spec.label}</span>
          <button
            type="button"
            class="knob-btn knob-param-btn"
            data-action="param-knob-drag"
            data-group="${groupName}"
            data-key="${spec.key}"
            title="${spec.label} (drag vertically, double-click to reset)"
            aria-label="${spec.label}"
            aria-valuemin="${spec.min}"
            aria-valuemax="${spec.max}"
            aria-valuenow="${val}"
          >${renderRotarySvg(norm, false)}</button>
          <span class="mono-val rotary-val">${spec.fmt(val)}</span>
        </div>
      `;
    })
    .join('');
}

function renderSoundSection() {
  els.soundPresetPills.innerHTML = Object.values(SOUND_PRESETS)
    .map(
      (p) =>
        `<button class="pill ${p.id === state.soundPresetId ? 'active' : ''}" data-sound-preset="${p.id}">${p.name}</button>`
    )
    .join('');
  renderParamKnobGrid(els.chordSynthGrid, 'chord');
}

function renderFxSection() {
  els.fxPresetPills.innerHTML = Object.values(FX_PRESETS)
    .map(
      (p) =>
        `<button class="pill ${p.id === state.fxPresetId ? 'active-fx' : ''}" data-fx-preset="${p.id}">${p.name}</button>`
    )
    .join('');
  renderParamKnobGrid(els.fxParamGrid, 'fx');
}

function renderBassSection() {
  els.bassPresetPills.innerHTML = BASS_PRESETS.map(
    (p) =>
      `<button class="pill ${p.id === state.bass.presetId ? 'active-teal' : ''}" data-bass-preset="${p.id}" title="Load ${p.name} bass sound (preserves sequence)">${p.name}</button>`
  ).join('');

  if (els.bassEnabledBtn) {
    els.bassEnabledBtn.setAttribute('aria-pressed', String(state.bass.enabled));
    els.bassEnabledBtn.textContent = state.bass.enabled ? 'Bass On' : 'Bass Muted';
  }
  els.bassOctaveSelect.value = String(state.bass.octave);
  renderParamKnobGrid(els.bassSoundGrid, 'bass');

  els.bassGrid.classList.toggle('steps-8', state.stepCount === 8);
  els.bassGrid.innerHTML = state.bass.steps
    .map((step, i) => {
      const isBeat = i % 4 === 0;
      const isPlaying = i === state.playheadStep;
      const padClass = step.active ? (step.accent ? 'accent' : 'hit') : '';
      const midi = getBassMidiNote(state.rootPc, state.bass.octave, step.offset ?? 0);
      const offsetLabel = `${formatStepOffset(step.offset ?? 0)} (${midiToNoteName(midi)})`;
      const gateVal = Math.max(0.1, Math.min(2.0, step.gate ?? 0.65));

      return `
        <div class="bass-col ${isBeat ? 'beat-start' : ''} ${isPlaying ? 'playing' : ''}" data-step="${i}">
          <span class="step-num">${i + 1}</span>
          <button class="bass-pad ${padClass}" data-action="bass-pad" data-step="${i}" title="Toggle bass step ${i + 1} (Shift+click for accent)"></button>
          <button class="step-offset-btn ${step.offset !== 0 ? 'non-zero' : ''}" data-action="bass-offset" data-step="${i}" title="Click to cycle bass interval">${offsetLabel}</button>
          <div class="step-gate-wrap" title="Bass gate length: ${gateVal.toFixed(2)}">
            <input class="step-gate-slider" type="range" min="0.1" max="2.0" step="0.05" value="${gateVal.toFixed(2)}" data-action="bass-gate" data-step="${i}" />
            <span class="step-gate-val">${gateVal.toFixed(2)}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderDrumSection() {
  els.drumKitTag.textContent = state.drums.tone.kitModel || 'Analog Dub Kit';

  els.drumPresetPills.innerHTML = DRUM_SOUND_PRESETS.map(
    (p) =>
      `<button class="pill ${p.id === state.drums.presetId ? 'active-cyan' : ''}" data-drum-preset="${p.id}" title="Load ${p.name} (${p.tone.kitModel})">${p.name}</button>`
  ).join('');

  if (els.drumEnabledBtn) {
    els.drumEnabledBtn.setAttribute('aria-pressed', String(state.drums.enabled));
    els.drumEnabledBtn.textContent = state.drums.enabled ? 'Drums On' : 'Drums Muted';
  }

  const stepClass = state.stepCount === 8 ? 'steps-8' : state.stepCount === 32 ? 'steps-32' : '';

  els.drumGrid.innerHTML = DRUM_TRACKS.map((track) => {
    const isMuted = Boolean(state.drums.muted[track.id] || state.mixer.mutes[track.id]);
    const rowSteps = state.drums.patterns[track.id] || [];
    const padsHtml = rowSteps
      .map((val, i) => {
        const beatClass = i % 4 === 0 ? 'beat-start' : '';
        const stateClass = val === 2 ? 'accent' : val === 1 ? 'hit' : '';
        const playClass = i === state.playheadStep ? 'playing' : '';
        return `<button class="drum-pad ${beatClass} ${stateClass} ${playClass}" data-action="drum-pad" data-track="${track.id}" data-step="${i}" title="${track.name} Step ${i + 1}"></button>`;
      })
      .join('');

    return `
      <div class="drum-row ${isMuted ? 'muted' : ''}">
        <div class="drum-track-ctrl">
          <button class="drum-track-name" data-action="drum-audition" data-track="${track.id}" title="Audition ${track.name}">${track.name}</button>
          <button class="drum-mute-btn ${isMuted ? 'active' : ''}" data-action="drum-mute" data-track="${track.id}" title="Mute ${track.name}">M</button>
        </div>
        <div class="drum-steps ${stepClass}">${padsHtml}</div>
      </div>
    `;
  }).join('');
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startDeg, endDeg) {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const diff = endDeg - startDeg;
  const largeArc = Math.abs(diff) > 180 ? 1 : 0;
  const sweep = diff >= 0 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function formatPanLabel(pan) {
  const pct = Math.round(pan * 100);
  if (Math.abs(pct) < 3) return 'C';
  return pct < 0 ? `L${Math.abs(pct)}` : `R${pct}`;
}

function renderRotarySvg(norm, isPan = false) {
  const clamped = Math.max(0, Math.min(1, norm));
  const pointerDeg = -135 + clamped * 270;
  const ptrStart = polarToCartesian(15, 15, 2.8, pointerDeg);
  const ptrEnd = polarToCartesian(15, 15, 9.0, pointerDeg);
  const dotPt = polarToCartesian(15, 15, 6.6, pointerDeg);
  const bgPath = describeArc(15, 15, 12.2, -135, 135);
  const arcStart = isPan ? 0 : -135;
  const valPath =
    Math.abs(pointerDeg - arcStart) >= 1.5
      ? `<path class="knob-arc-val" d="${describeArc(15, 15, 12.2, arcStart, pointerDeg)}" />`
      : '';
  return `
    <svg class="knob-svg" viewBox="0 0 30 30" aria-hidden="true">
      <path class="knob-arc-bg" d="${bgPath}" />
      ${valPath}
      <circle class="knob-cap" cx="15" cy="15" r="9.4" />
      <circle class="knob-bevel" cx="15" cy="15" r="6.4" />
      <line class="knob-pointer" x1="${ptrStart.x.toFixed(2)}" y1="${ptrStart.y.toFixed(2)}" x2="${ptrEnd.x.toFixed(2)}" y2="${ptrEnd.y.toFixed(2)}" />
      <circle class="knob-dot" cx="${dotPt.x.toFixed(2)}" cy="${dotPt.y.toFixed(2)}" r="0.95" />
    </svg>
  `;
}

function updateRotarySvgNode(knobBtn, norm, isPan = false) {
  const clamped = Math.max(0, Math.min(1, norm));
  const pointerDeg = -135 + clamped * 270;
  const ptrStart = polarToCartesian(15, 15, 2.8, pointerDeg);
  const ptrEnd = polarToCartesian(15, 15, 9.0, pointerDeg);
  const dotPt = polarToCartesian(15, 15, 6.6, pointerDeg);
  const arcStart = isPan ? 0 : -135;
  const svg = knobBtn?.querySelector('.knob-svg');
  if (!svg) return;
  const ptr = svg.querySelector('.knob-pointer');
  if (ptr) {
    ptr.setAttribute('x1', ptrStart.x.toFixed(2));
    ptr.setAttribute('y1', ptrStart.y.toFixed(2));
    ptr.setAttribute('x2', ptrEnd.x.toFixed(2));
    ptr.setAttribute('y2', ptrEnd.y.toFixed(2));
  }
  const dot = svg.querySelector('.knob-dot');
  if (dot) {
    dot.setAttribute('cx', dotPt.x.toFixed(2));
    dot.setAttribute('cy', dotPt.y.toFixed(2));
  }
  let arcVal = svg.querySelector('.knob-arc-val');
  if (Math.abs(pointerDeg - arcStart) >= 1.5) {
    const d = describeArc(15, 15, 12.2, arcStart, pointerDeg);
    if (!arcVal) {
      arcVal = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arcVal.setAttribute('class', 'knob-arc-val');
      const bg = svg.querySelector('.knob-arc-bg');
      if (bg) bg.insertAdjacentElement('afterend', arcVal);
    }
    arcVal.setAttribute('d', d);
  } else if (arcVal) {
    arcVal.remove();
  }
}

function renderKnobHtml({ channelId, kind, label, value, title }) {
  const isPan = kind === 'pan';
  const norm = isPan ? (value + 1) / 2 : value;
  const readout = isPan ? formatPanLabel(value) : `${Math.round(value * 100)}%`;

  return `
    <div class="rotary-ctrl">
      <span class="rotary-label">${label}</span>
      <button
        type="button"
        class="knob-btn"
        data-action="knob-drag"
        data-channel="${channelId}"
        data-kind="${kind}"
        title="${title}"
        aria-label="${channelId} ${label}"
        aria-valuenow="${Math.round(value * 100)}"
      >
        ${renderRotarySvg(norm, isPan)}
      </button>
      <span class="rotary-val">${readout}</span>
    </div>
  `;
}

function renderSpacerKnobHtml() {
  return `
    <div class="rotary-ctrl spacer" aria-hidden="true">
      <span class="rotary-label">-</span>
      <div class="knob-btn"></div>
      <span class="rotary-val">-</span>
    </div>
  `;
}

function renderMasterVuHtml() {
  // Braun regie 510/520 dark-dial analog meter with dual white curved scale (0..5)
  const scaleAngles = [-42, -25.2, -8.4, 8.4, 25.2, 42];
  const ticksSvg = scaleAngles
    .map((deg, idx) => {
      const pOuter = polarToCartesian(56, 67, 36.5, deg);
      const pInner = polarToCartesian(56, 67, 33.2, deg);
      const pLabel = polarToCartesian(56, 67, 26.8, deg);
      return `
        <line x1="${pOuter.x.toFixed(1)}" y1="${pOuter.y.toFixed(1)}" x2="${pInner.x.toFixed(1)}" y2="${pInner.y.toFixed(1)}" stroke="#f4f4f0" stroke-width="1.1" />
        <text x="${pLabel.x.toFixed(1)}" y="${(pLabel.y + 2.2).toFixed(1)}" font-size="6.4" font-weight="600" fill="#f4f4f0" text-anchor="middle">${idx}</text>
      `;
    })
    .join('');

  return `
    <div class="knob-stack master-vu-stack">
      <div class="vu-meter-box" aria-label="Master VU Meter">
        <svg class="vu-svg" viewBox="0 0 112 72" aria-hidden="true">
          <defs>
            <linearGradient id="vuGlassGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2c2f32" />
              <stop offset="100%" stop-color="#191b1d" />
            </linearGradient>
          </defs>
          <rect x="0.5" y="0.5" width="111" height="71" fill="url(#vuGlassGrad)" stroke="#0f1112" stroke-width="1" />
          <path d="${describeArc(56, 67, 45, -24, 24)}" fill="none" stroke="#e9e9e3" stroke-width="1" opacity="0.85" />
          <path d="${describeArc(56, 67, 34.8, -42, 42)}" fill="none" stroke="#f4f4f0" stroke-width="1.2" />
          ${ticksSvg}
          <line id="masterVuNeedle" x1="56" y1="67" x2="56" y2="15" stroke="#ffffff" stroke-width="1.35" stroke-linecap="butt" transform="rotate(-42 56 67)" />
          <rect x="0" y="61" width="112" height="11" fill="#181a1c" />
        </svg>
      </div>
    </div>
  `;
}

const FADER_DB_MARKS = ['0', '6', '12', '18', '24', '30', '36', '42', '48', '60'];

function renderFaderScaleHtml() {
  return `
    <div class="fader-db-scale" aria-hidden="true">
      ${FADER_DB_MARKS.map((db) => `<span class="fader-db-mark"><em>${db}</em><i></i></span>`).join('')}
    </div>
  `;
}

function renderLedMeterHtml(channelId) {
  const segs = Array.from({ length: 12 }, (_, idx) => {
    const seg = 11 - idx;
    const band = seg >= 10 ? 'peak' : seg >= 8 ? 'warn' : 'ok';
    return `<span class="led-seg led-${band}" data-seg="${seg}"></span>`;
  }).join('');
  return `<div class="led-meter" data-meter="${channelId}" aria-hidden="true">${segs}</div>`;
}

function renderMixerSection() {
  els.mixerConsole.innerHTML = MIXER_CHANNELS.map((ch) => {
    const val = state.mixer.faders[ch.id] ?? 0.8;
    const pct = Math.round(val * 100);
    const muted = Boolean(state.mixer.mutes[ch.id] || state.drums.muted[ch.id]);
    const soloed = ch.kind !== 'master' && Boolean(state.mixer.solos[ch.id]);

    let knobsHtml = '';
    if (ch.kind === 'source') {
      const dly = state.mixer.delaySends[ch.id] ?? 0;
      const rev = state.mixer.reverbSends[ch.id] ?? 0;
      const pan = state.mixer.pans[ch.id] ?? 0;
      knobsHtml = `
        <div class="knob-stack">
          <div class="knob-row">
            ${renderKnobHtml({ channelId: ch.id, kind: 'delay', label: 'DLY', value: dly, title: `${ch.label} Delay Send (drag vertically, double-click to reset)` })}
            ${renderKnobHtml({ channelId: ch.id, kind: 'reverb', label: 'REV', value: rev, title: `${ch.label} Reverb Send (drag vertically, double-click to reset)` })}
          </div>
          ${renderKnobHtml({ channelId: ch.id, kind: 'pan', label: 'PAN', value: pan, title: `${ch.label} Pan (drag vertically, double-click for Center)` })}
        </div>
      `;
    } else if (ch.kind === 'return') {
      const pan = state.mixer.pans[ch.id] ?? 0;
      knobsHtml = `
        <div class="knob-stack">
          <div class="knob-row">${renderSpacerKnobHtml()}${renderSpacerKnobHtml()}</div>
          ${renderKnobHtml({ channelId: ch.id, kind: 'pan', label: 'PAN', value: pan, title: `${ch.label} Pan (drag vertically, double-click for Center)` })}
        </div>
      `;
    } else {
      knobsHtml = renderMasterVuHtml();
    }

    const msButtons =
      ch.kind === 'master'
        ? `<div class="mixer-ms-row single"><button class="mixer-mute-btn ${muted ? 'active' : ''}" data-action="mixer-mute" data-channel="${ch.id}" title="Mute Master">M</button></div>`
        : `<div class="mixer-ms-row">
             <button class="mixer-mute-btn ${muted ? 'active' : ''}" data-action="mixer-mute" data-channel="${ch.id}" title="Mute ${ch.label}">M</button>
             <button class="mixer-solo-btn ${soloed ? 'active' : ''}" data-action="mixer-solo" data-channel="${ch.id}" title="Solo ${ch.label}">S</button>
           </div>`;

    const kindClass = ch.kind === 'return' ? 'is-return' : ch.kind === 'master' ? 'is-master' : '';

    return `
      <div class="mixer-strip ${kindClass} ${muted ? 'is-muted' : ''} ${soloed ? 'is-soloed' : ''}" data-channel="${ch.id}" data-tone="${ch.tone}">
        <span class="mixer-label">${ch.label}</span>
        ${knobsHtml}
        <div class="fader-meter-row">
          ${renderFaderScaleHtml()}
          <div class="fader-track" role="slider" tabindex="0" aria-label="${ch.label} level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" data-action="fader-drag" data-channel="${ch.id}">
            <div class="fader-thumb" style="bottom: ${pct}%"><span class="fader-thumb-wings"></span><span class="fader-thumb-core"></span></div>
          </div>
          ${renderLedMeterHtml(ch.id)}
        </div>
        <span class="mixer-val">${pct}%</span>
        ${msButtons}
      </div>
    `;
  }).join('');
}

function renderAll() {
  renderGlobalBar();
  renderChordSection();
  renderIntervalSection();
  renderSequenceToolbar();
  renderStepGrid();
  renderSoundSection();
  renderBassSection();
  renderDrumSection();
  renderFxSection();
  renderMixerSection();
}

function updatePlayheadDOM(nextStep) {
  const prevStep = state.playheadStep;
  state.playheadStep = nextStep;
  if (prevStep >= 0) {
    const prevChord = els.stepGrid.querySelector(`.step-col[data-step="${prevStep}"]`);
    if (prevChord) prevChord.classList.remove('playing');
    const prevBass = els.bassGrid.querySelector(`.bass-col[data-step="${prevStep}"]`);
    if (prevBass) prevBass.classList.remove('playing');
    els.drumGrid.querySelectorAll(`.drum-pad[data-step="${prevStep}"]`).forEach((el) => {
      el.classList.remove('playing');
    });
  }
  if (nextStep >= 0) {
    const nextChord = els.stepGrid.querySelector(`.step-col[data-step="${nextStep}"]`);
    if (nextChord) nextChord.classList.add('playing');
    const nextBass = els.bassGrid.querySelector(`.bass-col[data-step="${nextStep}"]`);
    if (nextBass) nextBass.classList.add('playing');
    els.drumGrid.querySelectorAll(`.drum-pad[data-step="${nextStep}"]`).forEach((el) => {
      el.classList.add('playing');
    });
  }
}

// --- Event Listeners ---

function togglePlayback() {
  if (audio.isPlaying) {
    audio.stopSequencer();
    els.playBtn.classList.remove('playing');
    if (els.playIcon) els.playIcon.innerHTML = '&#9654;';
    els.playLabel.textContent = 'Play';
    els.statusLed.classList.remove('active');
    updatePlayheadDOM(-1);
  } else {
    els.playBtn.classList.add('playing');
    if (els.playIcon) els.playIcon.innerHTML = '&#9632;';
    els.playLabel.textContent = 'Stop';
    els.statusLed.classList.add('active');
    audio.applyChordParams(audio.chordSound, state.bpm);
    audio.applyFxParams(state.fxParams, state.bpm);
    syncMixerToAudio();
    audio.startSequencer(
      () => ({
        bpm: state.bpm,
        swingRatio: state.swingRatio,
        steps: state.steps,
        chordConfig: getCurrentChordConfig(),
        mixer: getEffectiveMixerState(),
        bass: state.bass,
        drums: {
          enabled: state.drums.enabled,
          muted: state.drums.muted,
          tone: state.drums.tone,
          tracks: DRUM_TRACKS,
          patterns: state.drums.patterns
        }
      }),
      (stepIdx) => updatePlayheadDOM(stepIdx)
    );
  }
}

els.playBtn.addEventListener('click', togglePlayback);
els.undoBtn.addEventListener('click', performUndo);
els.redoBtn.addEventListener('click', performRedo);

// Save / Load Project State
els.saveStateBtn.addEventListener('click', () => {
  persistAutoSave();
  const json = serializeProject(captureSnapshot().state, audio.chordSound);
  const symbol = getChordSymbol(state.rootPc, state.presetId, state.intervals).replace(/\s+/g, '');
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dublab-${symbol}-${state.bpm}bpm.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

els.loadStateBtn.addEventListener('click', () => els.loadFileInput.click());

els.loadFileInput.addEventListener('change', async () => {
  const file = els.loadFileInput.files?.[0];
  els.loadFileInput.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const loaded = parseProjectJson(text);
    recordUndo();
    applySnapshot(loaded);
  } catch (err) {
    alert(err.message || 'Could not load project file.');
  }
});

// Coalesce range slider undo points (record once per drag gesture)
function bindRangeWithUndo(inputEl, onInputFn) {
  let gestureRecorded = false;
  inputEl.addEventListener('pointerdown', () => {
    gestureRecorded = false;
  });
  inputEl.addEventListener('input', () => {
    if (!gestureRecorded) {
      recordUndo();
      gestureRecorded = true;
    }
    onInputFn(inputEl.value);
    persistAutoSave();
  });
}

els.bpmInput.addEventListener('change', () => {
  recordUndo();
  const val = Math.max(60, Math.min(180, Number(els.bpmInput.value) || 126));
  state.bpm = val;
  els.bpmInput.value = String(val);
  audio.applyChordParams(audio.chordSound, state.bpm);
  audio.applyFxParams(state.fxParams, state.bpm);
  persistAutoSave();
});

bindRangeWithUndo(els.swingInput, (v) => {
  const pct = Number(v) || 0;
  state.swingRatio = pct / 100;
  els.swingValue.textContent = `${pct}%`;
});

els.stepCountSelect.addEventListener('change', () => {
  recordUndo();
  const nextCount = Number(els.stepCountSelect.value) || 16;
  state.stepCount = nextCount;
  state.steps = resizeSteps(state.steps, nextCount);
  state.bass.steps = resizeBassSteps(state.bass.steps, nextCount);
  state.drums.patterns = resizeDrumPatterns(state.drums.patterns, nextCount);
  renderSequenceToolbar();
  renderStepGrid();
  renderBassSection();
  renderDrumSection();
  persistAutoSave();
});

els.exportMidiBtn.addEventListener('click', () => {
  const loops = Number(els.exportLoopsSelect.value) || 2;
  const symbol = getChordSymbol(state.rootPc, state.presetId, state.intervals).replace(/\s+/g, '');
  const midiBytes = buildMidiBytes({
    bpm: state.bpm,
    swingRatio: state.swingRatio,
    steps: state.steps,
    chordConfig: getCurrentChordConfig(),
    loops,
    trackName: `DUB LAB - ${symbol}`
  });
  downloadMidiFile(midiBytes, `dublab-${symbol}-${state.bpm}bpm.mid`);
});

function buildOfflineRenderOptions(stemMode) {
  return {
    bpm: state.bpm,
    swingRatio: state.swingRatio,
    steps: state.steps,
    chordConfig: getCurrentChordConfig(),
    chordSound: { ...audio.chordSound },
    fxParams: { ...state.fxParams },
    bass: state.bass,
    drums: {
      enabled: state.drums.enabled,
      muted: state.drums.muted,
      tone: state.drums.tone,
      tracks: DRUM_TRACKS,
      patterns: state.drums.patterns
    },
    mixer: getEffectiveMixerState(),
    loops: Number(els.exportLoopsSelect.value) || 2,
    stemMode
  };
}

function setExportBusy(busy, label = null) {
  els.exportWavBtn.disabled = busy;
  els.exportStemsBtn.disabled = busy;
  if (!busy) {
    els.exportWavBtn.textContent = '.WAV';
    els.exportStemsBtn.textContent = 'Stems .ZIP';
  } else if (label) {
    if (label.includes('Stem')) els.exportStemsBtn.textContent = label;
    else els.exportWavBtn.textContent = label;
  }
}

els.exportWavBtn.addEventListener('click', async () => {
  const symbol = getChordSymbol(state.rootPc, state.presetId, state.intervals).replace(/\s+/g, '');
  setExportBusy(true, 'Rendering...');
  try {
    const buffer = await renderMixOffline(buildOfflineRenderOptions('sum'));
    const wavBytes = encodeWavFromAudioBuffer(buffer);
    triggerBlobDownload(wavBytes, 'audio/wav', `dublab-${symbol}-${state.bpm}bpm-sum.wav`);
  } catch (err) {
    alert(err?.message || 'Failed to render WAV export.');
  } finally {
    setExportBusy(false);
  }
});

els.exportStemsBtn.addEventListener('click', async () => {
  const symbol = getChordSymbol(state.rootPc, state.presetId, state.intervals).replace(/\s+/g, '');
  setExportBusy(true, `Stems 1/${STEM_DEFINITIONS.length}`);
  try {
    const entries = [];
    for (let i = 0; i < STEM_DEFINITIONS.length; i++) {
      const stem = STEM_DEFINITIONS[i];
      els.exportStemsBtn.textContent = `Stems ${i + 1}/${STEM_DEFINITIONS.length}`;
      const buffer = await renderMixOffline(buildOfflineRenderOptions(stem.mode));
      entries.push({
        name: stem.filename,
        data: encodeWavFromAudioBuffer(buffer)
      });
    }
    const zipBytes = createZipArchive(entries);
    triggerBlobDownload(zipBytes, 'application/zip', `dublab-${symbol}-${state.bpm}bpm-stems.zip`);
  } catch (err) {
    alert(err?.message || 'Failed to render Stems ZIP export.');
  } finally {
    setExportBusy(false);
  }
});

// Chord editor interactions
els.rootGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-root]');
  if (!btn) return;
  recordUndo();
  state.rootPc = Number(btn.dataset.root);
  renderChordSection();
  if (!state.intervalPoolEnabled) renderStepGrid();
  renderBassSection();
  persistAutoSave();
  auditionCurrentChord(0);
});

els.chordPresetGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preset]');
  if (!btn) return;
  const preset = CHORD_PRESETS.find((p) => p.id === btn.dataset.preset);
  if (!preset) return;
  recordUndo();
  state.presetId = preset.id;
  state.lastPresetId = preset.id;
  state.intervals = [...preset.intervals];
  renderChordSection();
  renderIntervalSection();
  persistAutoSave();
  auditionCurrentChord(0);
});

els.octaveSelect.addEventListener('change', () => {
  recordUndo();
  state.octave = Number(els.octaveSelect.value);
  renderChordSection();
  if (!state.intervalPoolEnabled) renderStepGrid();
  persistAutoSave();
  auditionCurrentChord(0);
});

els.voicingSelect.addEventListener('change', () => {
  recordUndo();
  state.voicing = els.voicingSelect.value;
  renderChordSection();
  persistAutoSave();
  auditionCurrentChord(0);
});

els.inversionSelect.addEventListener('change', () => {
  recordUndo();
  state.inversion = Number(els.inversionSelect.value);
  renderChordSection();
  persistAutoSave();
  auditionCurrentChord(0);
});

els.miniKeyboard.addEventListener('click', (e) => {
  const key = e.target.closest('[data-midi]');
  if (!key) return;
  const clickedMidi = Number(key.dataset.midi);
  const baseMidi = rootToMidi(state.rootPc, state.octave);
  let relInterval = clickedMidi - baseMidi;
  while (relInterval < 0) relInterval += 12;

  const exists = state.intervals.includes(relInterval);
  if (exists && state.intervals.length <= 1) return;

  recordUndo();
  if (exists) {
    state.intervals = state.intervals.filter((iv) => iv !== relInterval);
  } else {
    state.intervals = [...state.intervals, relInterval].sort((a, b) => a - b);
  }
  state.presetId = 'custom';
  renderChordSection();
  renderIntervalSection();
  persistAutoSave();
  auditionCurrentChord(0);
});

// Interval editor interactions
els.chordIntervalGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-stack-iv]');
  if (!btn) return;
  const semitones = Number(btn.dataset.stackIv);
  if (state.intervals.includes(semitones) && state.intervals.length <= 1) return;

  recordUndo();
  if (state.intervals.includes(semitones)) {
    state.intervals = state.intervals.filter((iv) => iv !== semitones);
  } else {
    state.intervals = [...state.intervals, semitones].sort((a, b) => a - b);
  }
  state.presetId = 'custom';
  renderChordSection();
  renderIntervalSection();
  persistAutoSave();
  auditionCurrentChord(0);
});

els.resetIntervalsBtn.addEventListener('click', () => {
  const fallback =
    CHORD_PRESETS.find((p) => p.id === state.lastPresetId) || CHORD_PRESETS[1];
  recordUndo();
  state.presetId = fallback.id;
  state.intervals = [...fallback.intervals];
  renderChordSection();
  renderIntervalSection();
  persistAutoSave();
  auditionCurrentChord(0);
});

els.poolEnabledBtn.addEventListener('click', () => {
  recordUndo();
  state.intervalPoolEnabled = !state.intervalPoolEnabled;
  renderIntervalSection();
  renderStepGrid();
  persistAutoSave();
});

els.scaleSelect.addEventListener('change', () => {
  recordUndo();
  state.scaleId = els.scaleSelect.value;
  state.intervalPool = [
    ...new Set(state.intervalPool.map((o) => quantizeOffsetToScale(o, state.scaleId)))
  ].sort((a, b) => a - b);
  if (state.intervalPoolEnabled) {
    state.steps = state.steps.map((s) => ({
      ...s,
      offset: quantizeOffsetToScale(s.offset, state.scaleId)
    }));
  }
  state.bass.steps = state.bass.steps.map((s) => ({
    ...s,
    offset: quantizeOffsetToScale(s.offset, state.scaleId)
  }));
  renderIntervalSection();
  renderStepGrid();
  renderBassSection();
  persistAutoSave();
});

els.intervalPoolGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pool-offset]');
  if (!btn) return;
  const offset = Number(btn.dataset.poolOffset);
  if (state.intervalPool.includes(offset) && state.intervalPool.length <= 1) return;

  recordUndo();
  if (state.intervalPool.includes(offset)) {
    state.intervalPool = state.intervalPool.filter((o) => o !== offset);
  } else {
    state.intervalPool = [...state.intervalPool, offset].sort((a, b) => a - b);
  }
  renderIntervalSection();
  persistAutoSave();
});

els.applyPoolBtn.addEventListener('click', () => {
  recordUndo();
  let idx = 0;
  state.steps = state.steps.map((s) => {
    if (!s.active) return s;
    const rawOffset = state.intervalPool[idx % state.intervalPool.length];
    idx++;
    return {
      ...s,
      offset: quantizeOffsetToScale(rawOffset, state.scaleId)
    };
  });
  renderStepGrid();
  persistAutoSave();
});

// Sequence Generator & Step Grid interactions
els.stylePills.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-style]');
  if (!btn) return;
  recordUndo();
  state.seqStyle = btn.dataset.style;
  regenerateSequence();
});

function regenerateSequence() {
  state.pulses = Math.max(1, Math.min(state.stepCount, Number(els.pulsesInput.value) || 5));
  state.rotation = Math.max(0, Math.min(state.stepCount - 1, Number(els.rotationInput.value) || 0));
  state.steps = generateDubSequence({
    style: state.seqStyle,
    stepCount: state.stepCount,
    pulses: state.pulses,
    rotation: state.rotation,
    intervalPool: state.intervalPool,
    scaleId: state.scaleId,
    humanize: true
  });
  renderSequenceToolbar();
  renderStepGrid();
  persistAutoSave();
}

els.generateBtn.addEventListener('click', () => {
  recordUndo();
  regenerateSequence();
});

els.pulsesInput.addEventListener('change', () => {
  recordUndo();
  state.seqStyle = 'euclidean';
  regenerateSequence();
});

els.rotationInput.addEventListener('change', () => {
  recordUndo();
  regenerateSequence();
});

els.shiftLeftBtn.addEventListener('click', () => {
  recordUndo();
  state.steps = rotateSteps(state.steps, -1);
  renderStepGrid();
  persistAutoSave();
});

els.shiftRightBtn.addEventListener('click', () => {
  recordUndo();
  state.steps = rotateSteps(state.steps, 1);
  renderStepGrid();
  persistAutoSave();
});

els.clearSeqBtn.addEventListener('click', () => {
  recordUndo();
  state.steps = Array.from({ length: state.stepCount }, () => createDefaultStep());
  renderStepGrid();
  persistAutoSave();
});

// Step Grid Clicks + Velocity Drag + Continuous Gate Slider
let draggingVel = null;
let gateUndoArmed = false;

els.stepGrid.addEventListener('pointerdown', (e) => {
  if (e.target.matches('[data-action="chord-gate"]')) {
    gateUndoArmed = true;
  }
});

els.stepGrid.addEventListener('input', (e) => {
  const slider = e.target.closest('[data-action="chord-gate"]');
  if (!slider) return;
  if (gateUndoArmed) {
    recordUndo();
    gateUndoArmed = false;
  }
  const stepIdx = Number(slider.dataset.step);
  const val = Math.max(0.1, Math.min(2.0, Number(slider.value) || 0.35));
  state.steps[stepIdx].gate = val;
  const valEl = slider.parentElement?.querySelector('.step-gate-val');
  if (valEl) valEl.textContent = val.toFixed(2);
  persistAutoSave();
});

els.stepGrid.addEventListener('mousedown', (e) => {
  const velWrap = e.target.closest('[data-action="vel-drag"]');
  if (!velWrap) return;
  e.preventDefault();
  recordUndo();
  const stepIdx = Number(velWrap.dataset.step);
  const rect = velWrap.getBoundingClientRect();
  draggingVel = { stepIdx, rect };
  updateVelocityFromPointer(e.clientY);
});

window.addEventListener('mousemove', (e) => {
  if (!draggingVel) return;
  updateVelocityFromPointer(e.clientY);
});

window.addEventListener('mouseup', () => {
  if (draggingVel) {
    draggingVel = null;
    persistAutoSave();
  }
});

function updateVelocityFromPointer(clientY) {
  if (!draggingVel) return;
  const { stepIdx, rect } = draggingVel;
  const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  const vel = Math.round(20 + ratio * 107);
  state.steps[stepIdx].velocity = vel;
  const col = els.stepGrid.querySelector(`.step-col[data-step="${stepIdx}"]`);
  if (col) {
    const bar = col.querySelector('.step-vel-bar');
    if (bar) bar.style.height = `${Math.round((vel / 127) * 100)}%`;
    const wrap = col.querySelector('.step-vel-wrap');
    if (wrap) wrap.title = `Velocity: ${vel} (drag vertically)`;
  }
}

els.stepGrid.addEventListener('change', (e) => {
  const selectEl = e.target.closest('[data-action="step-note-select"]');
  if (!selectEl) return;
  const stepIdx = Number(selectEl.dataset.step);
  const step = state.steps[stepIdx];
  if (!step) return;
  recordUndo();
  step.offset = Number(selectEl.value) || 0;
  persistAutoSave();
  if (!audio.isPlaying) {
    auditionCurrentChord(step.offset);
  }
});

els.stepGrid.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const stepIdx = Number(actionEl.dataset.step);
  const step = state.steps[stepIdx];
  if (!step) return;

  if (action === 'toggle-step') {
    recordUndo();
    step.active = !step.active;
    renderStepGrid();
    persistAutoSave();
  } else if (action === 'cycle-offset') {
    recordUndo();
    if (e.shiftKey) {
      step.offset = 0;
    } else {
      step.offset = getNextPoolOffset(step.offset ?? 0, state.intervalPool, state.scaleId);
    }
    renderStepGrid();
    persistAutoSave();
    if (!audio.isPlaying) {
      auditionCurrentChord(step.offset);
    }
  }
});

// Chord sound presets & synth controls
els.soundPresetPills.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sound-preset]');
  if (!btn) return;
  const preset = SOUND_PRESETS[btn.dataset.soundPreset];
  if (!preset) return;
  recordUndo();
  state.soundPresetId = preset.id;
  audio.applyChordParams(preset, state.bpm);
  renderSoundSection();
  persistAutoSave();
  if (!audio.isPlaying) {
    auditionCurrentChord(0);
  }
});

// Unified Rotary Parameter Knob Controls (Chord Synth, Dub FX, Bass)
function snapToStep(val, spec) {
  const clamped = Math.max(spec.min, Math.min(spec.max, val));
  const stepped = Math.round((clamped - spec.min) / spec.step) * spec.step + spec.min;
  return Number(Math.max(spec.min, Math.min(spec.max, stepped)).toFixed(4));
}

function setParamKnobValue(groupName, key, rawVal) {
  const spec = PARAM_KNOB_GROUPS[groupName]?.find((item) => item.key === key);
  if (!spec) return;
  const nextVal = snapToStep(rawVal, spec);
  spec.set(nextVal);
  const knobBtn = document.querySelector(`.knob-param-btn[data-group="${groupName}"][data-key="${key}"]`);
  if (knobBtn) {
    const norm = (nextVal - spec.min) / (spec.max - spec.min);
    updateRotarySvgNode(knobBtn, norm, false);
    knobBtn.setAttribute('aria-valuenow', String(nextVal));
    const valEl = knobBtn.parentElement?.querySelector('.rotary-val');
    if (valEl) valEl.textContent = spec.fmt(nextVal);
  }
}

document.addEventListener('pointerdown', (e) => {
  const knobBtn = e.target.closest('[data-action="param-knob-drag"]');
  if (!knobBtn) return;
  const groupName = knobBtn.dataset.group;
  const key = knobBtn.dataset.key;
  const spec = PARAM_KNOB_GROUPS[groupName]?.find((item) => item.key === key);
  if (!spec) return;
  e.preventDefault();
  draggingKnob = {
    kind: 'param',
    groupName,
    key,
    spec,
    startY: e.clientY,
    startVal: spec.get(),
    undoRecorded: false
  };
});

document.addEventListener('dblclick', (e) => {
  const knobBtn = e.target.closest('[data-action="param-knob-drag"]');
  if (!knobBtn) return;
  const groupName = knobBtn.dataset.group;
  const key = knobBtn.dataset.key;
  const spec = PARAM_KNOB_GROUPS[groupName]?.find((item) => item.key === key);
  if (!spec) return;
  recordUndo();
  setParamKnobValue(groupName, key, spec.def);
  persistAutoSave();
});

document.addEventListener('keydown', (e) => {
  const knobBtn = e.target.closest?.('[data-action="param-knob-drag"]');
  if (!knobBtn) return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const groupName = knobBtn.dataset.group;
  const key = knobBtn.dataset.key;
  const spec = PARAM_KNOB_GROUPS[groupName]?.find((item) => item.key === key);
  if (!spec) return;
  e.preventDefault();
  recordUndo();
  const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1;
  const mult = e.shiftKey ? 5 : 1;
  setParamKnobValue(groupName, key, spec.get() + dir * spec.step * mult);
  persistAutoSave();
});

// --- Dub FX Module Controls (Delay & Reverb) ---

els.fxPresetPills.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fx-preset]');
  if (!btn) return;
  const preset = FX_PRESETS[btn.dataset.fxPreset];
  if (!preset) return;
  recordUndo();
  state.fxPresetId = preset.id;
  state.fxParams = { ...preset };
  audio.applyFxParams(state.fxParams, state.bpm);
  renderFxSection();
  persistAutoSave();
});

// --- Bass Module Controls (Presets alter sound ONLY, preserving bass sequence) ---

els.bassPresetPills.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-bass-preset]');
  if (!btn) return;
  const preset = BASS_PRESETS.find((p) => p.id === btn.dataset.bassPreset);
  if (!preset) return;
  recordUndo();
  state.bass.presetId = preset.id;
  state.bass.sound = { ...preset.sound };
  syncMixerToAudio();
  renderBassSection();
  persistAutoSave();
  if (!audio.isPlaying) {
    const midi = getBassMidiNote(state.rootPc, state.bass.octave, 0);
    audio.triggerBass(midi, { accent: true, gateSec: 0.22, sound: state.bass.sound });
  }
});

els.bassEnabledBtn?.addEventListener('click', () => {
  recordUndo();
  state.bass.enabled = !state.bass.enabled;
  renderBassSection();
  persistAutoSave();
});

els.bassOctaveSelect.addEventListener('change', () => {
  recordUndo();
  state.bass.octave = Number(els.bassOctaveSelect.value) || 1;
  renderBassSection();
  persistAutoSave();
});

els.generateBassBtn.addEventListener('click', () => {
  recordUndo();
  state.bass.steps = generateBassSequence({
    presetId: state.bass.presetId === 'custom' ? 'euclidean' : state.bass.presetId,
    stepCount: state.stepCount,
    scaleId: state.scaleId,
    pulses: Math.max(3, Math.round(state.stepCount * 0.35)),
    rotation: Math.floor(Math.random() * 4)
  });
  renderBassSection();
  persistAutoSave();
});

els.clearBassBtn.addEventListener('click', () => {
  recordUndo();
  state.bass.steps = createEmptyBassSteps(state.stepCount);
  renderBassSection();
  persistAutoSave();
});

let bassGateUndoArmed = false;

els.bassGrid.addEventListener('pointerdown', (e) => {
  if (e.target.matches('[data-action="bass-gate"]')) {
    bassGateUndoArmed = true;
  }
});

els.bassGrid.addEventListener('input', (e) => {
  const slider = e.target.closest('[data-action="bass-gate"]');
  if (!slider) return;
  if (bassGateUndoArmed) {
    recordUndo();
    bassGateUndoArmed = false;
  }
  const stepIdx = Number(slider.dataset.step);
  const val = Math.max(0.1, Math.min(2.0, Number(slider.value) || 0.65));
  state.bass.steps[stepIdx].gate = val;
  const valEl = slider.parentElement?.querySelector('.step-gate-val');
  if (valEl) valEl.textContent = val.toFixed(2);
  persistAutoSave();
});

els.bassGrid.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const stepIdx = Number(actionEl.dataset.step);
  const step = state.bass.steps[stepIdx];
  if (!step) return;

  if (action === 'bass-pad') {
    recordUndo();
    if (e.shiftKey) {
      step.active = true;
      step.accent = !step.accent;
    } else {
      step.active = !step.active;
      if (!step.active) step.accent = false;
    }
    renderBassSection();
    persistAutoSave();
    if (step.active && !audio.isPlaying) {
      const midi = getBassMidiNote(state.rootPc, state.bass.octave, step.offset ?? 0);
      syncMixerToAudio();
      audio.triggerBass(midi, { accent: step.accent, gateSec: 0.2, sound: state.bass.sound });
    }
  } else if (action === 'bass-offset') {
    recordUndo();
    if (e.shiftKey) {
      step.offset = 0;
    } else {
      step.offset = getNextPoolOffset(step.offset ?? 0, BASS_OFFSET_CYCLE, state.scaleId);
    }
    renderBassSection();
    persistAutoSave();
    if (!audio.isPlaying) {
      const midi = getBassMidiNote(state.rootPc, state.bass.octave, step.offset ?? 0);
      syncMixerToAudio();
      audio.triggerBass(midi, { accent: step.accent, gateSec: 0.2, sound: state.bass.sound });
    }
  }
});

// --- Drum Machine Controls (Sound Kits preserve sequence) ---

els.drumPresetPills.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-drum-preset]');
  if (!btn) return;
  const preset = DRUM_SOUND_PRESETS.find((p) => p.id === btn.dataset.drumPreset);
  if (!preset) return;
  recordUndo();
  state.drums.presetId = preset.id;
  state.drums.tone = { ...preset.tone };
  syncMixerToAudio();
  renderDrumSection();
  persistAutoSave();
});

els.drumEnabledBtn?.addEventListener('click', () => {
  recordUndo();
  state.drums.enabled = !state.drums.enabled;
  renderDrumSection();
  persistAutoSave();
});

els.initDrumsBtn.addEventListener('click', () => {
  recordUndo();
  state.drums.patterns = buildDefaultDrumPatterns(state.stepCount);
  renderDrumSection();
  persistAutoSave();
});

els.clearDrumsBtn.addEventListener('click', () => {
  recordUndo();
  state.drums.patterns = createEmptyDrumPatterns(state.stepCount);
  renderDrumSection();
  persistAutoSave();
});

els.drumGrid.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const trackId = target.dataset.track;

  if (action === 'drum-mute') {
    recordUndo();
    const nextMuted = !(state.drums.muted[trackId] || state.mixer.mutes[trackId]);
    state.drums.muted[trackId] = nextMuted;
    state.mixer.mutes[trackId] = nextMuted;
    syncMixerToAudio();
    renderDrumSection();
    renderMixerSection();
    persistAutoSave();
  } else if (action === 'drum-audition') {
    audio.applyChordParams(audio.chordSound, state.bpm);
    audio.applyFxParams(state.fxParams, state.bpm);
    syncMixerToAudio();
    audio.triggerDrum(trackId, {
      level: 2,
      tone: state.drums.tone
    });
  } else if (action === 'drum-pad') {
    const stepIdx = Number(target.dataset.step);
    const cur = state.drums.patterns[trackId]?.[stepIdx] ?? 0;
    recordUndo();
    if (e.shiftKey) {
      state.drums.patterns[trackId][stepIdx] = cur === 2 ? 1 : 2;
    } else {
      state.drums.patterns[trackId][stepIdx] = cur > 0 ? 0 : 1;
    }
    renderDrumSection();
    persistAutoSave();
  }
});

// --- Mixer Console Controls ---

let draggingFader = null;
let draggingKnob = null;

function getKnobMap(kind) {
  if (kind === 'delay') return state.mixer.delaySends;
  if (kind === 'reverb') return state.mixer.reverbSends;
  return state.mixer.pans;
}

function updateKnobVisualDOM(channelId, kind, value) {
  const knobBtn = els.mixerConsole.querySelector(
    `.knob-btn[data-channel="${channelId}"][data-kind="${kind}"]`
  );
  if (!knobBtn) return;
  const isPan = kind === 'pan';
  const norm = isPan ? (value + 1) / 2 : value;
  updateRotarySvgNode(knobBtn, norm, isPan);
  knobBtn.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  const readoutEl = knobBtn.parentElement?.querySelector('.rotary-val');
  if (readoutEl) {
    readoutEl.textContent = isPan ? formatPanLabel(value) : `${Math.round(value * 100)}%`;
  }
}

els.mixerConsole.addEventListener('pointerdown', (e) => {
  const trackEl = e.target.closest('[data-action="fader-drag"]');
  if (trackEl) {
    e.preventDefault();
    recordUndo();
    const channelId = trackEl.dataset.channel;
    const rect = trackEl.getBoundingClientRect();
    draggingFader = { channelId, rect };
    updateFaderFromPointer(e.clientY);
    return;
  }

  const knobEl = e.target.closest('[data-action="knob-drag"]');
  if (knobEl) {
    e.preventDefault();
    const channelId = knobEl.dataset.channel;
    const kind = knobEl.dataset.kind;
    const map = getKnobMap(kind);
    draggingKnob = {
      channelId,
      kind,
      startY: e.clientY,
      startVal: map[channelId] ?? 0,
      undoRecorded: false
    };
  }
});

window.addEventListener('pointermove', (e) => {
  if (draggingFader) {
    updateFaderFromPointer(e.clientY);
    return;
  }
  if (draggingKnob) {
    const { channelId, kind, startY, startVal } = draggingKnob;
    const dy = startY - e.clientY;
    if (!draggingKnob.undoRecorded && Math.abs(dy) >= 2) {
      recordUndo();
      draggingKnob.undoRecorded = true;
    }
    if (kind === 'param') {
      const { groupName, key, spec } = draggingKnob;
      const sensitivity = e.shiftKey ? 320 : 140;
      setParamKnobValue(groupName, key, startVal + (dy * (spec.max - spec.min)) / sensitivity);
      return;
    }
    const isPan = kind === 'pan';
    const min = isPan ? -1 : 0;
    const max = 1;
    const sensitivity = isPan ? 90 : 120;
    let next = Math.max(min, Math.min(max, startVal + (dy * (max - min)) / sensitivity));
    if (isPan && Math.abs(next) < 0.04) next = 0;
    next = Math.round(next * 100) / 100;
    getKnobMap(kind)[channelId] = next;
    syncMixerToAudio();
    updateKnobVisualDOM(channelId, kind, next);
  }
});

window.addEventListener('pointerup', () => {
  if (draggingFader) {
    draggingFader = null;
    persistAutoSave();
  }
  if (draggingKnob) {
    const changed = draggingKnob.undoRecorded;
    draggingKnob = null;
    if (changed) persistAutoSave();
  }
});

els.mixerConsole.addEventListener('dblclick', (e) => {
  const knobEl = e.target.closest('[data-action="knob-drag"]');
  if (!knobEl) return;
  const channelId = knobEl.dataset.channel;
  const kind = knobEl.dataset.kind;
  recordUndo();
  getKnobMap(kind)[channelId] = 0;
  syncMixerToAudio();
  updateKnobVisualDOM(channelId, kind, 0);
  persistAutoSave();
});

function updateFaderFromPointer(clientY) {
  if (!draggingFader) return;
  const { channelId, rect } = draggingFader;
  const ratio = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
  state.mixer.faders[channelId] = Math.round(ratio * 100) / 100;
  syncMixerToAudio();

  const strip = els.mixerConsole.querySelector(`.mixer-strip[data-channel="${channelId}"]`);
  if (strip) {
    const pct = Math.round(state.mixer.faders[channelId] * 100);
    const fill = strip.querySelector('.fader-fill');
    const thumb = strip.querySelector('.fader-thumb');
    const valEl = strip.querySelector('.mixer-val');
    const track = strip.querySelector('.fader-track');
    if (fill) fill.style.height = `${pct}%`;
    if (thumb) thumb.style.bottom = `${pct}%`;
    if (valEl) valEl.textContent = `${pct}%`;
    if (track) track.setAttribute('aria-valuenow', String(pct));
  }
}

els.mixerConsole.addEventListener('keydown', (e) => {
  const trackEl = e.target.closest('[data-action="fader-drag"]');
  if (trackEl && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    recordUndo();
    const channelId = trackEl.dataset.channel;
    const delta = e.key === 'ArrowUp' ? 0.05 : -0.05;
    state.mixer.faders[channelId] = Math.max(
      0,
      Math.min(1, (state.mixer.faders[channelId] ?? 0.8) + delta)
    );
    syncMixerToAudio();
    renderMixerSection();
    persistAutoSave();
    return;
  }

  const knobEl = e.target.closest('[data-action="knob-drag"]');
  if (!knobEl) return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  recordUndo();
  const channelId = knobEl.dataset.channel;
  const kind = knobEl.dataset.kind;
  const isPan = kind === 'pan';
  const min = isPan ? -1 : 0;
  const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1;
  const map = getKnobMap(kind);
  const next = Math.max(min, Math.min(1, Math.round(((map[channelId] ?? 0) + dir * 0.05) * 100) / 100));
  map[channelId] = next;
  syncMixerToAudio();
  updateKnobVisualDOM(channelId, kind, next);
  persistAutoSave();
});

els.mixerConsole.addEventListener('click', (e) => {
  const muteBtn = e.target.closest('[data-action="mixer-mute"]');
  if (muteBtn) {
    const channelId = muteBtn.dataset.channel;
    recordUndo();
    const nextMuted = !(state.mixer.mutes[channelId] || state.drums.muted[channelId]);
    state.mixer.mutes[channelId] = nextMuted;
    if (channelId in state.drums.muted || DRUM_TRACKS.some((t) => t.id === channelId)) {
      state.drums.muted[channelId] = nextMuted;
    }
    syncMixerToAudio();
    renderMixerSection();
    renderDrumSection();
    persistAutoSave();
    return;
  }

  const soloBtn = e.target.closest('[data-action="mixer-solo"]');
  if (soloBtn) {
    const channelId = soloBtn.dataset.channel;
    recordUndo();
    state.mixer.solos[channelId] = !state.mixer.solos[channelId];
    syncMixerToAudio();
    renderMixerSection();
    persistAutoSave();
  }
});

// Keyboard shortcuts (Play, Audition, Undo, Redo)
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const isEditing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    if (isEditing && document.activeElement?.type !== 'range') return;
    e.preventDefault();
    if (e.shiftKey) performRedo();
    else performUndo();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    performRedo();
    return;
  }

  if (isEditing) return;

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayback();
  } else if (e.key === 'a' || e.key === 'A') {
    e.preventDefault();
    auditionCurrentChord(0);
  }
});

// Real-time Mixer LED Meters & Analog Master VU Needle loop
const smoothedLevels = {};
const lastLitCount = {};
let smoothedVu = 0;

function updateMetersLoop() {
  const levels = audio.getChannelLevels();

  for (const ch of MIXER_CHANNELS) {
    const sample = levels[ch.id];
    const targetPeak = sample ? Math.min(1, sample.peak * 1.15) : 0;
    const prev = smoothedLevels[ch.id] ?? 0;
    const rate = targetPeak > prev ? 0.65 : 0.22;
    const next = targetPeak < 0.002 && prev < 0.002 ? 0 : prev + (targetPeak - prev) * rate;
    smoothedLevels[ch.id] = next;

    let lit = 0;
    if (next > 0.004) {
      const db = 20 * Math.log10(next);
      const norm = Math.max(0, Math.min(1, (db + 42) / 42));
      lit = Math.round(norm * 12);
    }

    if (lastLitCount[ch.id] !== lit) {
      lastLitCount[ch.id] = lit;
      const meterEl = els.mixerConsole.querySelector(`.led-meter[data-meter="${ch.id}"]`);
      if (meterEl) {
        const segs = meterEl.children;
        for (let i = 0; i < segs.length; i++) {
          const segIdx = Number(segs[i].dataset.seg);
          segs[i].classList.toggle('lit', segIdx < lit);
        }
      }
    }
  }

  // Master Old-School VU Meter needle ballistics (-42deg to +42deg)
  const masterSample = levels.master;
  const masterRms = masterSample ? Math.min(1.4, masterSample.rms * 2.1) : 0;
  let vuTarget = 0;
  if (masterRms > 0.004) {
    const vuDb = 20 * Math.log10(masterRms);
    vuTarget = Math.max(0, Math.min(1, (vuDb + 23) / 26));
  }
  const vuRate = vuTarget > smoothedVu ? 0.28 : 0.12;
  smoothedVu = vuTarget < 0.002 && smoothedVu < 0.002 ? 0 : smoothedVu + (vuTarget - smoothedVu) * vuRate;
  const needleEl = document.getElementById('masterVuNeedle');
  if (needleEl) {
    const angle = (-42 + smoothedVu * 84).toFixed(1);
    needleEl.setAttribute('transform', `rotate(${angle} 56 67)`);
  }

  requestAnimationFrame(updateMetersLoop);
}

// Initial render + restore autosave if present
renderStaticSelects();
restoreAutoSave();
syncMixerToAudio();
renderAll();
updateMetersLoop();
