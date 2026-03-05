/**
 * Upload configuration constants
 */
export const UPLOAD_CONFIG = {
  CHUNK_SIZE: 512 * 1024 * 1024,       // 512MB per chunk
  MAX_RETRIES: 5,
  CONCURRENT_UPLOADS: 4,
  MAX_FILE_SIZE: 5 * 1024 * 1024 * 1024 * 1024, // 5TB
  PROGRESS_UPDATE_INTERVAL: 1000,
  CLEANUP: {
    STALE_THRESHOLD_HOURS: 24,
    CHECK_INTERVAL_MINUTES: 30,
    BATCH_SIZE: 50
  }
};

/**
 * Content type categories and their S3 prefix mappings
 */
export const CONTENT_CATEGORIES = {
  image: {
    prefix: 'images',
    mimePatterns: ['image/'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw']
  },
  video: {
    prefix: 'videos',
    mimePatterns: ['video/'],
    extensions: ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp', '.ts', '.mts', '.m2ts']
  },
  audio: {
    prefix: 'audio',
    mimePatterns: ['audio/'],
    extensions: ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.wma', '.m4a', '.opus', '.aiff']
  },
  document: {
    prefix: 'documents',
    mimePatterns: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats', 'application/vnd.ms-', 'text/'],
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.rtf', '.odt', '.ods', '.odp']
  },
  archive: {
    prefix: 'archives',
    mimePatterns: ['application/zip', 'application/x-tar', 'application/gzip', 'application/x-rar', 'application/x-7z'],
    extensions: ['.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz']
  },
  other: {
    prefix: 'other',
    mimePatterns: [],
    extensions: []
  }
};
