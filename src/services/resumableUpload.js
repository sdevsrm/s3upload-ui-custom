import { Storage } from 'aws-amplify';
import { UPLOAD_CONFIG } from '../config/upload';
import { buildS3Key, extractFileMetadata } from '../utils/fileClassifier';
import { formatBytes, formatTime } from '../utils/formatters';

/**
 * Resumable upload handler.
 *
 * - Splits files into chunks and tracks completed parts in localStorage.
 * - On network drop / pause, state is preserved.
 * - On resume, only remaining parts are uploaded.
 * - Small files (<= CHUNK_SIZE) use single Storage.put for efficiency.
 */
export class ResumableUploadHandler {
  constructor(file, stateManager, { basePath = '', onProgress }) {
    this.file = file;
    this.stateManager = stateManager;
    this.onProgress = onProgress;
    this.basePath = basePath;

    this.s3Key = buildS3Key(file, basePath);
    this.metadata = extractFileMetadata(file);
    this.uploadId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.numParts = Math.ceil(file.size / UPLOAD_CONFIG.CHUNK_SIZE);
    this.completedParts = new Set();
    this.startTime = Date.now();
    this.bytesUploaded = 0;
    this.paused = false;
    this.aborted = false;

    this._speedWindow = [];
  }

  /**
   * Start or resume the upload.
   */
  async start(existingState = null) {
    if (existingState) {
      // Resume from saved state
      this.uploadId = existingState.uploadId;
      this.s3Key = existingState.s3Key;
      this.metadata = existingState.metadata;
      this.numParts = existingState.numParts;
      this.completedParts = new Set(existingState.completedParts || []);
      this.startTime = existingState.startTime;
      this.bytesUploaded = this.completedParts.size * UPLOAD_CONFIG.CHUNK_SIZE;
    }

    this.paused = false;
    this.aborted = false;
    this.stateManager.registerUpload(this.uploadId, this);
    this._saveState();
    this._emitProgress('in-progress');

    try {
      if (this.numParts <= 1) {
        await this._uploadSinglePart();
      } else {
        await this._uploadMultipart();
      }

      if (!this.aborted) {
        this._emitProgress('completed');
        this.stateManager.save(this.uploadId, {
          ...this._getBaseState(),
          completed: true,
          completedAt: Date.now()
        });
      }
      return !this.aborted;
    } catch (error) {
      if (!this.paused && !this.aborted) {
        this._emitProgress('error', error.message);
        this.stateManager.save(this.uploadId, {
          ...this._getBaseState(),
          failed: true,
          error: error.message
        });
      }
      throw error;
    } finally {
      this.stateManager.unregisterUpload(this.uploadId);
    }
  }

  pause() {
    this.paused = true;
    this._saveState();
    this._emitProgress('paused');
  }

  abort() {
    this.aborted = true;
    this.stateManager.save(this.uploadId, { ...this._getBaseState(), aborted: true });
    this.stateManager.unregisterUpload(this.uploadId);
  }

  // --- Single file upload (small files) ---
  async _uploadSinglePart() {
    await Storage.put(this.s3Key, this.file, {
      level: 'protected',
      contentType: this.file.type || 'application/octet-stream',
      metadata: this.metadata,
      progressCallback: (progress) => {
        if (this.aborted || this.paused) return;
        this.bytesUploaded = progress.loaded;
        this._emitProgress('in-progress');
      }
    });
    this.completedParts.add(1);
  }

  // --- Multipart upload ---
  async _uploadMultipart() {
    // Upload remaining parts with concurrency limit
    const remaining = [];
    for (let i = 1; i <= this.numParts; i++) {
      if (!this.completedParts.has(i)) remaining.push(i);
    }

    let idx = 0;
    const runNext = async () => {
      while (idx < remaining.length) {
        if (this.paused || this.aborted) return;
        const partNum = remaining[idx++];
        await this._uploadPart(partNum);
      }
    };

    // Run CONCURRENT_UPLOADS workers in parallel
    const workers = [];
    for (let w = 0; w < Math.min(UPLOAD_CONFIG.CONCURRENT_UPLOADS, remaining.length); w++) {
      workers.push(runNext());
    }
    await Promise.all(workers);

    if (this.paused) {
      throw new PauseError('Upload paused');
    }
  }

  async _uploadPart(partNumber) {
    const start = (partNumber - 1) * UPLOAD_CONFIG.CHUNK_SIZE;
    const end = Math.min(start + UPLOAD_CONFIG.CHUNK_SIZE, this.file.size);
    const chunk = this.file.slice(start, end);
    const chunkSize = end - start;

    let retries = 0;
    while (retries <= UPLOAD_CONFIG.MAX_RETRIES) {
      if (this.paused || this.aborted) return;

      try {
        await Storage.put(`${this.s3Key}.part${partNumber}`, chunk, {
          level: 'protected',
          contentType: 'application/octet-stream',
          progressCallback: (progress) => {
            if (this.aborted || this.paused) return;
            // Update bytes for this part proportionally
            const partBytes = (this.completedParts.size * UPLOAD_CONFIG.CHUNK_SIZE) + progress.loaded;
            this.bytesUploaded = Math.min(partBytes, this.file.size);
            this._recordSpeed(this.bytesUploaded);
            this._emitProgress('in-progress');
          }
        });

        this.completedParts.add(partNumber);
        this._saveState();
        return;
      } catch (error) {
        retries++;
        if (retries > UPLOAD_CONFIG.MAX_RETRIES) {
          throw new Error(`Part ${partNumber} failed after ${UPLOAD_CONFIG.MAX_RETRIES} retries: ${error.message}`);
        }
        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, retries - 1), 32000) + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // --- Progress ---
  _recordSpeed(bytesNow) {
    const now = Date.now();
    this._speedWindow.push({ bytes: bytesNow, time: now });
    // Keep last 5 seconds
    const cutoff = now - 5000;
    this._speedWindow = this._speedWindow.filter(m => m.time > cutoff);
  }

  _getCurrentSpeed() {
    if (this._speedWindow.length < 2) return 0;
    const first = this._speedWindow[0];
    const last = this._speedWindow[this._speedWindow.length - 1];
    const dt = (last.time - first.time) / 1000;
    return dt > 0 ? (last.bytes - first.bytes) / dt : 0;
  }

  _emitProgress(status, error = null) {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const speed = this._getCurrentSpeed();
    const remaining = speed > 0 ? (this.file.size - this.bytesUploaded) / speed : 0;
    const pct = this.file.size > 0 ? (this.bytesUploaded / this.file.size) * 100 : 0;

    const progress = {
      id: this.uploadId,
      filename: this.file.name,
      s3Key: this.s3Key,
      category: this.metadata['content-category'],
      originalDate: this.metadata['file-last-modified'] || null,
      percentage: Math.min(pct, 100),
      status,
      error,
      filesize: formatBytes(this.file.size),
      totalSize: this.file.size,
      bytesUploaded: this.bytesUploaded,
      uploadSpeed: formatBytes(speed) + '/s',
      speedMbps: (speed * 8) / (1000 * 1000),
      estimatedTimeRemaining: formatTime(remaining),
      elapsedTime: formatTime(elapsed),
      completedParts: this.completedParts.size,
      totalParts: this.numParts
    };

    this.onProgress?.(progress);
  }

  // --- State persistence ---
  _getBaseState() {
    return {
      uploadId: this.uploadId,
      s3Key: this.s3Key,
      fileName: this.file.name,
      fileSize: this.file.size,
      fileType: this.file.type,
      metadata: this.metadata,
      numParts: this.numParts,
      completedParts: Array.from(this.completedParts),
      startTime: this.startTime,
      completed: false,
      aborted: false,
      failed: false
    };
  }

  _saveState() {
    this.stateManager.save(this.uploadId, this._getBaseState());
  }
}

class PauseError extends Error {
  constructor(msg) { super(msg); this.name = 'PauseError'; }
}
