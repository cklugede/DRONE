/**
 * Project state serialization (Save/Load), Undo/Redo history stack,
 * and scale-aware interval pool cycling.
 */

import { quantizeOffsetToScale } from './theory.js';

/**
 * Return the next interval offset from `pool` (quantized to `scaleId`) after `currentOffset`.
 * Deduplicating post-quantization ensures the cycle never gets stuck when two pool entries
 * quantize to the same pitch or when `currentOffset` is not in the pool.
 */
export function getNextPoolOffset(currentOffset, pool, scaleId) {
  const source = pool && pool.length > 0 ? pool : [0];
  const effectivePool = [
    ...new Set(source.map((o) => quantizeOffsetToScale(o, scaleId)))
  ].sort((a, b) => a - b);

  if (effectivePool.length === 0) return 0;

  const curIdx = effectivePool.indexOf(currentOffset);
  if (curIdx >= 0) {
    return effectivePool[(curIdx + 1) % effectivePool.length];
  }

  // If currentOffset is outside the pool, advance to the next higher entry (or wrap)
  const higher = effectivePool.find((o) => o > currentOffset);
  return higher !== undefined ? higher : effectivePool[0];
}

/**
 * Simple bounded Undo/Redo history manager storing JSON-cloned state snapshots.
 */
export class HistoryManager {
  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth;
    this.past = [];
    this.future = [];
  }

  push(snapshot) {
    const serialized = JSON.stringify(snapshot);
    if (this.past.length > 0 && this.past[this.past.length - 1] === serialized) {
      return false;
    }
    this.past.push(serialized);
    if (this.past.length > this.maxDepth) {
      this.past.shift();
    }
    this.future = [];
    return true;
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  undo(currentSnapshot) {
    if (!this.canUndo()) return null;
    this.future.push(JSON.stringify(currentSnapshot));
    return JSON.parse(this.past.pop());
  }

  redo(currentSnapshot) {
    if (!this.canRedo()) return null;
    this.past.push(JSON.stringify(currentSnapshot));
    return JSON.parse(this.future.pop());
  }
}

/**
 * Serialize full app state + synth params into a portable project object.
 */
export function serializeProject(appState, synthParams) {
  return JSON.stringify(
    {
      format: 'dub-lab-project',
      version: 1,
      savedAt: new Date().toISOString(),
      state: structuredClone(appState),
      synthParams: structuredClone(synthParams)
    },
    null,
    2
  );
}

/**
 * Parse and validate a saved project JSON string. Returns `{ state, synthParams }` or throws.
 */
export function parseProjectJson(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || parsed.format !== 'dub-lab-project' || !parsed.state) {
    throw new Error('Invalid DUB LAB project file.');
  }
  return {
    state: parsed.state,
    synthParams: parsed.synthParams || null
  };
}
