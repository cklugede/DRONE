/**
 * Pure Standard MIDI File (SMF Type 0) binary encoder.
 */

import { voiceChord } from './theory.js';
import { getStepStartInSixteenths } from './sequencer.js';

export const MIDI_PPQN = 480; // Ticks per quarter note (120 ticks per 16th note)

/**
 * Encode a non-negative integer as MIDI Variable-Length Quantity (VLQ) bytes.
 */
export function encodeVLQ(value) {
  let v = Math.max(0, Math.floor(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

/**
 * Write 32-bit big-endian unsigned integer into byte array.
 */
function uint32BE(val) {
  return [(val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff];
}

/**
 * Write 16-bit big-endian unsigned integer into byte array.
 */
function uint16BE(val) {
  return [(val >>> 8) & 0xff, val & 0xff];
}

/**
 * Build an SMF Type 0 MIDI byte array (`Uint8Array`) from chord, sequence, and timing settings.
 */
export function buildMidiBytes({
  bpm = 126,
  swingRatio = 0,
  steps = [],
  chordConfig = {
    rootPc: 5,
    octave: 3,
    intervals: [0, 3, 7, 10],
    inversion: 0,
    voicing: 'close'
  },
  loops = 1,
  channel = 0,
  trackName = 'Dub Techno Chords'
}) {
  const ppqn = MIDI_PPQN;
  const ticksPerSixteenth = ppqn / 4; // 120
  const safeChannel = Math.max(0, Math.min(15, channel));
  const safeLoops = Math.max(1, Math.min(16, Math.round(loops)));
  const stepCount = steps.length || 16;

  const rawEvents = [];

  // Meta: Track Name (tick 0)
  const nameBytes = Array.from(new TextEncoder().encode(trackName));
  rawEvents.push({
    tick: 0,
    order: 0,
    bytes: [0xff, 0x03, ...encodeVLQ(nameBytes.length), ...nameBytes]
  });

  // Meta: Tempo (microseconds per quarter note)
  const clampedBpm = Math.max(40, Math.min(240, bpm));
  const usPerQuarter = Math.round(60000000 / clampedBpm);
  rawEvents.push({
    tick: 0,
    order: 1,
    bytes: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff]
  });

  // Meta: Time Signature 4/4
  rawEvents.push({
    tick: 0,
    order: 2,
    bytes: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08]
  });

  // Note events across requested pattern loops
  const patternTicks = stepCount * ticksPerSixteenth;
  const maxTotalTick = safeLoops * patternTicks;

  for (let loopIdx = 0; loopIdx < safeLoops; loopIdx++) {
    const loopTickOffset = loopIdx * patternTicks;

    for (let i = 0; i < stepCount; i++) {
      const step = steps[i];
      if (!step || !step.active) continue;

      const startSixteenth = getStepStartInSixteenths(i, swingRatio);
      const startTick = loopTickOffset + Math.round(startSixteenth * ticksPerSixteenth);
      const gateTicks = Math.max(12, Math.round((step.gate ?? 0.35) * ticksPerSixteenth));
      // Cap note-off neatly before end of exported region to avoid trailing overshoot
      const endTick = Math.min(maxTotalTick, startTick + gateTicks);
      if (endTick <= startTick) continue;

      const notes = voiceChord({
        ...chordConfig,
        transpose: step.offset ?? 0
      });

      const velocity = Math.max(1, Math.min(127, Math.round(step.velocity ?? 96)));

      for (const note of notes) {
        rawEvents.push({
          tick: startTick,
          order: 10, // Note On after Note Off at same tick
          bytes: [0x90 | safeChannel, note & 0x7f, velocity & 0x7f]
        });
        rawEvents.push({
          tick: endTick,
          order: 5, // Note Off before Note On if overlapping at exact tick
          bytes: [0x80 | safeChannel, note & 0x7f, 0x00]
        });
      }
    }
  }

  // Sort chronologically, breaking ties with `order`
  rawEvents.sort((a, b) => (a.tick !== b.tick ? a.tick - b.tick : a.order - b.order));

  // Encode delta times into track byte buffer
  const trackData = [];
  let prevTick = 0;
  for (const ev of rawEvents) {
    const delta = Math.max(0, ev.tick - prevTick);
    prevTick = ev.tick;
    trackData.push(...encodeVLQ(delta), ...ev.bytes);
  }

  // End of Track Meta Event at end of loop boundary (or immediately after last note)
  const endDelta = Math.max(0, maxTotalTick - prevTick);
  trackData.push(...encodeVLQ(endDelta), 0xff, 0x2f, 0x00);

  // Assemble Header Chunk (MThd) + Track Chunk (MTrk)
  const headerChunk = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    ...uint32BE(6),         // Header length = 6
    ...uint16BE(0),         // Format 0
    ...uint16BE(1),         // 1 track
    ...uint16BE(ppqn)       // Division
  ];

  const trackChunk = [
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    ...uint32BE(trackData.length),
    ...trackData
  ];

  return new Uint8Array([...headerChunk, ...trackChunk]);
}

/**
 * Trigger a browser download for the generated MIDI file.
 */
export function downloadMidiFile(midiBytes, filename = 'dub-techno-chords.mid') {
  const blob = new Blob([midiBytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
