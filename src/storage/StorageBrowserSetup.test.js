// Tests for action disable logic extracted from StorageBrowserSetup.js

const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.webm'];
const ANALYZED_PREFIXES = ['images/', 'audio/', 'documents/'];

const analyzeVideoDisable = (selected) => {
  if (!selected?.length || selected.length !== 1) return true;
  const key = (selected[0].key || '').toLowerCase();
  return !VIDEO_EXTS.some(ext => key.endsWith(ext));
};

// Must stay in sync with viewAnalysisAction.actionListItem.disable in StorageBrowserSetup.js
const viewAnalysisDisable = (selected) => {
  if (!selected?.length || selected.length !== 1) return true;
  const key = selected[0].key || '';
  return !ANALYZED_PREFIXES.some(
    p => key.startsWith(p) || key.includes(`/${p.replace('/', '')}/`) || selected[0].type === 'FILE'
  );
};

describe('analyzeVideoDisable', () => {
  test.each([
    ['videos/clip.mp4',  false],
    ['videos/clip.MOV',  false],
    ['videos/clip.avi',  false],
    ['videos/clip.mkv',  false],
    ['videos/clip.wmv',  false],
    ['videos/clip.webm', false],
    ['images/photo.jpg', true],
    ['documents/a.pdf',  true],
    ['audio/song.mp3',   true],
    ['other/file.txt',   true],
  ])('key="%s" → disabled=%s', (key, expected) => {
    expect(analyzeVideoDisable([{ key }])).toBe(expected);
  });

  it('disables when nothing selected', () => {
    expect(analyzeVideoDisable([])).toBe(true);
    expect(analyzeVideoDisable(null)).toBe(true);
  });

  it('disables when multiple selected', () => {
    expect(analyzeVideoDisable([{ key: 'videos/a.mp4' }, { key: 'videos/b.mp4' }])).toBe(true);
  });
});

describe('viewAnalysisDisable', () => {
  // Full S3 key (from bucket root)
  test.each([
    ['images/photo.jpg',  false],
    ['audio/song.mp3',    false],
    ['documents/a.pdf',   false],
    ['videos/clip.mp4',   true],
    ['archives/a.zip',    true],
    ['other/file.txt',    true],
  ])('full key="%s" → disabled=%s', (key, expected) => {
    expect(viewAnalysisDisable([{ key }])).toBe(expected);
  });

  // Relative key when browsed into subfolder (e.g. navigated into images/)
  test.each([
    ['2026/03/05/photo.jpg', { type: 'FILE' }, false],  // type=FILE fallback
    ['2026/03/05/clip.mp4',  { type: 'FILE' }, false],  // type=FILE enables all files
    ['2026/03/05/',          { type: 'FOLDER' }, true], // folders always disabled
  ])('relative key="%s" type=%o → disabled=%s', (key, extra, expected) => {
    expect(viewAnalysisDisable([{ key, ...extra }])).toBe(expected);
  });

  it('disables when nothing selected', () => {
    expect(viewAnalysisDisable([])).toBe(true);
    expect(viewAnalysisDisable(null)).toBe(true);
  });

  it('disables when multiple selected', () => {
    expect(viewAnalysisDisable([{ key: 'images/a.jpg' }, { key: 'images/b.jpg' }])).toBe(true);
  });
});
