import { classifyByMimeAndName, buildS3KeyFromName, extractFileMetadata } from '../utils/fileClassifier';

// Mock date to 2026-03-05 for deterministic key paths
const MOCK_DATE = new Date('2026-03-05T00:00:00Z');
jest.spyOn(global, 'Date').mockImplementation(() => MOCK_DATE);

describe('classifyByMimeAndName', () => {
  test.each([
    ['image/jpeg',       'photo.jpg',   'image'],
    ['image/png',        'photo.png',   'image'],
    ['video/mp4',        'clip.mp4',    'video'],
    ['video/quicktime',  'clip.mov',    'video'],
    ['application/pdf',  'report.pdf',  'document'],
    ['audio/mpeg',       'song.mp3',    'audio'],
    ['application/zip',  'archive.zip', 'archive'],
    ['',                 'unknown.xyz', 'other'],
    ['application/octet-stream', 'file.bin', 'other'],
  ])('mime="%s" name="%s" → "%s"', (mime, name, expected) => {
    expect(classifyByMimeAndName(mime, name)).toBe(expected);
  });
});

describe('buildS3KeyFromName', () => {
  test.each([
    ['photo.jpg',   'image/jpeg',        'images/2026/03/05/photo.jpg'],
    ['clip.mp4',    'video/mp4',         'videos/2026/03/05/clip.mp4'],
    ['report.pdf',  'application/pdf',   'documents/2026/03/05/report.pdf'],
    ['song.mp3',    'audio/mpeg',        'audio/2026/03/05/song.mp3'],
    ['archive.zip', 'application/zip',   'archives/2026/03/05/archive.zip'],
    ['unknown.xyz', '',                  'other/2026/03/05/unknown.xyz'],
  ])('%s → %s', (name, mime, expected) => {
    expect(buildS3KeyFromName(name, mime)).toBe(expected);
  });
});

describe('extractFileMetadata', () => {
  it('returns all required metadata keys', () => {
    const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
    const meta = extractFileMetadata(file);
    expect(meta).toMatchObject({
      'original-name': 'photo.jpg',
      'content-category': 'image',
      'mime-type': 'image/jpeg',
      'upload-date': expect.any(String),
      'file-size-bytes': expect.any(String),
    });
  });

  it('includes file-last-modified when available', () => {
    const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg', lastModified: 1000000 });
    const meta = extractFileMetadata(file);
    expect(meta['file-last-modified']).toBeDefined();
  });

  it('falls back to application/octet-stream for missing mime type', () => {
    const file = new File(['content'], 'unknown.xyz', { type: '' });
    const meta = extractFileMetadata(file);
    expect(meta['mime-type']).toBe('application/octet-stream');
  });
});
