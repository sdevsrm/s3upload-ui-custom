/**
 * Formatting utilities
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return 'N/A';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Calculating...';
  if (seconds === 0) return '0s';
  seconds = Math.round(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  let str = '';
  if (h > 0) str += `${h}h `;
  if (m > 0 || h > 0) str += `${m}m `;
  if (s > 0 || (!h && !m)) str += `${s}s`;
  return str.trim();
}

export function formatSpeed(speedMbps) {
  if (!Number.isFinite(speedMbps) || speedMbps <= 0) return 'Calculating...';
  return speedMbps >= 1000
    ? `${(speedMbps / 1000).toFixed(2)} Gbps`
    : `${speedMbps.toFixed(2)} Mbps`;
}

export function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleString();
}
