import { UPLOAD_CONFIG } from '../config/upload';

/**
 * Manages upload state in localStorage for persistence across
 * network drops, browser refreshes, and pause/resume.
 */
export class UploadStateManager {
  constructor() {
    this.prefix = 'upload-v2-';
    this.activeUploads = new Map();
    this.listeners = new Map();
    this._cleanupTimer = null;
  }

  init() {
    this._cleanupTimer = setInterval(
      () => this.cleanupStale(),
      UPLOAD_CONFIG.CLEANUP.CHECK_INTERVAL_MINUTES * 60 * 1000
    );
    window.addEventListener('storage', this._onStorageChange);
    this.cleanupStale();
  }

  destroy() {
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
    window.removeEventListener('storage', this._onStorageChange);
    this.listeners.clear();
    this.activeUploads.clear();
  }

  _onStorageChange = (e) => {
    if (e.key?.startsWith(this.prefix)) {
      const uploadId = e.key.slice(this.prefix.length);
      const state = e.newValue ? JSON.parse(e.newValue) : null;
      this._notify(uploadId, state);
    }
  };

  // --- Listeners ---
  onProgress(uploadId, callback) {
    this.listeners.set(uploadId, callback);
    return () => this.listeners.delete(uploadId);
  }

  _notify(uploadId, state) {
    const cb = this.listeners.get(uploadId);
    if (cb) cb(state);
  }

  // --- State CRUD ---
  save(uploadId, state) {
    const updated = { ...state, lastUpdated: Date.now() };
    localStorage.setItem(this.prefix + uploadId, JSON.stringify(updated));
    this._notify(uploadId, updated);
  }

  get(uploadId) {
    const raw = localStorage.getItem(this.prefix + uploadId);
    return raw ? JSON.parse(raw) : null;
  }

  remove(uploadId) {
    localStorage.removeItem(this.prefix + uploadId);
    this.activeUploads.delete(uploadId);
  }

  getAll() {
    const states = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        try {
          states.push({ key, state: JSON.parse(localStorage.getItem(key)) });
        } catch { /* skip corrupt entries */ }
      }
    }
    return states;
  }

  // --- Active upload tracking ---
  registerUpload(uploadId, handler) { this.activeUploads.set(uploadId, handler); }
  unregisterUpload(uploadId) { this.activeUploads.delete(uploadId); }
  isUploading() { return this.activeUploads.size > 0; }

  /**
   * Returns uploads that were in-progress but not completed (resumable).
   */
  getResumableUploads() {
    return this.getAll()
      .map(({ state }) => state)
      .filter(s => s && !s.completed && !s.aborted && s.completedParts);
  }

  // --- Cleanup ---
  cleanupStale() {
    const cutoff = Date.now() - (UPLOAD_CONFIG.CLEANUP.STALE_THRESHOLD_HOURS * 3600 * 1000);
    for (const { key, state } of this.getAll()) {
      if (!state || state.lastUpdated < cutoff) {
        localStorage.removeItem(key);
      }
    }
  }
}
