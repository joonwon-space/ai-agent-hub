/**
 * autosave.js — Debounced autosave with exponential backoff retry.
 *
 * Usage:
 *   const saver = createAutosaver({
 *     saveFn: async () => { ... },  // returns Promise
 *     onState: (state) => { ... },  // 'idle' | 'saving' | 'saved' | 'error'
 *   });
 *   input.addEventListener('input', () => saver.schedule());
 *   saver.flush();   // force immediate save (e.g., on beforeunload)
 *   saver.cancel();  // cancel pending timer
 */

'use strict';

// B-1 잔존: shrunk from 500 → 250 to narrow the window where typed content
// can be lost on F5/tab-close before the debounce fires. Pages also wire
// a beforeunload+pagehide flush as a backup.
const DEBOUNCE_MS = 250;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

/**
 * Create an autosaver instance.
 *
 * @param {{ saveFn: () => Promise<any>, onState: (state: string) => void }} opts
 * @returns {{ schedule: () => void, flush: () => Promise<void>, cancel: () => void }}
 */
function createAutosaver({ saveFn, onState }) {
  let timerId = null;
  let saving = false;

  function setState(state) {
    if (typeof onState === 'function') onState(state);
  }

  /**
   * Attempt to save with exponential backoff.
   * @param {number} attempt 0-based attempt index
   */
  async function attemptSave(attempt) {
    setState('saving');
    try {
      await saveFn();
      setState('saved');
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return attemptSave(attempt + 1);
      }
      // All retries exhausted
      setState('error');
    }
  }

  /**
   * Schedule a save after DEBOUNCE_MS. Resets the timer on each call.
   */
  function schedule() {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    // P-1: surface a 'pending' state immediately on every keystroke so
    // users get instant feedback that their input is being tracked. The
    // 'saving' state then takes over once the debounce fires and the
    // network request actually starts.
    setState('pending');
    timerId = setTimeout(async () => {
      timerId = null;
      if (saving) return;
      saving = true;
      try {
        await attemptSave(0);
      } finally {
        saving = false;
      }
    }, DEBOUNCE_MS);
  }

  /**
   * Cancel any pending debounced save.
   */
  function cancel() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  /**
   * Force an immediate save, bypassing the debounce timer.
   * Returns a Promise that resolves when the save completes (or fails after retries).
   */
  async function flush() {
    cancel();
    if (saving) return;
    saving = true;
    try {
      await attemptSave(0);
    } finally {
      saving = false;
    }
  }

  return { schedule, cancel, flush };
}
