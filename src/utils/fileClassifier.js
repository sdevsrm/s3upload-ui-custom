import { CONTENT_CATEGORIES } from '../config/upload';

/**
 * Classifies a file into a content category based on MIME type and extension.
 */
export function classifyFile(file) {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return classifyByMimeAndName(mime, name);
}

/**
 * Classifies by MIME string and filename (for use without a File object).
 */
export function classifyByMimeAndName(mime, name) {
  const ext = name.includes('.') ? '.' + name.split('.').pop() : '';

  for (const [category, config] of Object.entries(CONTENT_CATEGORIES)) {
    if (category === 'other') continue;
    if (mime && config.mimePatterns.some(p => mime.startsWith(p))) return category;
    if (ext && config.extensions.includes(ext)) return category;
  }
  return 'other';
}

/**
 * Builds a content-type routed S3 key from a filename and MIME type.
 *
 * Input:  "photo.jpg", "image/jpeg"
 * Output: "images/2026/03/05/photo.jpg"
 */
export function buildS3KeyFromName(fileName, mimeType = '') {
  const category = classifyByMimeAndName(mimeType, fileName);
  const prefix = CONTENT_CATEGORIES[category].prefix;
  const now = new Date();
  const datePath = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('/');

  return `${prefix}/${datePath}/${fileName}`;
}

/**
 * Builds S3 key from a File object (convenience wrapper).
 */
export function buildS3Key(file, basePath = '') {
  const parts = [buildS3KeyFromName(file.name, file.type)];
  if (basePath) parts.unshift(basePath);
  return parts.join('/');
}

/**
 * Extracts metadata from a File object for S3 custom metadata headers.
 */
export function extractFileMetadata(file) {
  const category = classifyFile(file);
  const now = new Date().toISOString();

  const metadata = {
    'upload-date': now,
    'original-name': file.name,
    'content-category': category,
    'file-size-bytes': String(file.size),
    'mime-type': file.type || 'application/octet-stream'
  };

  if (file.lastModified) {
    metadata['file-last-modified'] = new Date(file.lastModified).toISOString();
  }

  return metadata;
}
