// Tests for action disable logic extracted from StorageBrowserSetup.js

const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.webm'];
const ANALYZED_PREFIXES = ['images/', 'audio/', 'documents/'];

const analyzeVideoDisable = (selected) => {
  if (!selected?.length || selected.length !== 1) return true;
  const key = (selected[0].key || '').toLowerCase();
  return !VIDEO_EXTS.some(ext => key.endsWith(ext));
};

const viewAnalysisDisable = (selected) => {
  if (!selected?.length || selected.length !== 1) return true;
  const key = selected[0].key || '';
  return !ANALYZED_PREFIXES.some(p => key.startsWith(p));
};

describe('analyzeVideoDisable', () => {
  test.each([
    ['videos/2026/03/05/clip.mp4',  false],
    ['videos/2026/03/05/clip.MOV',  false],
    ['videos/2026/03/05/clip.avi',  false],
    ['videos/2026/03/05/clip.mkv',  false],
    ['videos/2026/03/05/clip.wmv',  false],
    ['videos/2026/03/05/clip.webm', false],
    ['images/2026/03/05/photo.jpg', true],
    ['documents/2026/03/05/a.pdf',  true],
    ['audio/2026/03/05/song.mp3',   true],
    ['other/2026/03/05/file.txt',   true],
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
  test.each([
    ['images/2026/03/05/photo.jpg',  false],
    ['audio/2026/03/05/song.mp3',    false],
    ['documents/2026/03/05/a.pdf',   false],
    ['videos/2026/03/05/clip.mp4',   true],
    ['archives/2026/03/05/a.zip',    true],
    ['other/2026/03/05/file.txt',    true],
  ])('key="%s" → disabled=%s', (key, expected) => {
    expect(viewAnalysisDisable([{ key }])).toBe(expected);
  });

  it('disables when nothing selected', () => {
    expect(viewAnalysisDisable([])).toBe(true);
    expect(viewAnalysisDisable(null)).toBe(true);
  });

  it('disables when multiple selected', () => {
    expect(viewAnalysisDisable([{ key: 'images/a.jpg' }, { key: 'images/b.jpg' }])).toBe(true);
  });
});
