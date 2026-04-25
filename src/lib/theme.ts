/**
 * HCS-U7 dark theme tokens — used by every component, kept tiny on purpose.
 */
export const theme = {
  bg: '#050c14',
  bgElev: '#0b1722',
  bgCard: '#0f1d2c',
  border: 'rgba(0, 200, 255, 0.18)',
  borderStrong: 'rgba(0, 200, 255, 0.35)',
  text: '#e6f1ff',
  textMuted: '#7a93ad',
  accent: '#00c8ff',
  accentSoft: 'rgba(0, 200, 255, 0.12)',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  font:
    '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
} as const;

export const STATUS_COLOR: Record<
  'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED',
  string
> = {
  PENDING: theme.textMuted,
  PROCESSING: theme.accent,
  SUCCESS: theme.success,
  FAILED: theme.error,
};
