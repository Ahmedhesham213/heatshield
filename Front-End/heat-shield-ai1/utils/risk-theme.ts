/**
 * getRiskTheme — HeatShield Design System
 *
 * Single source of truth for risk-level visual tokens.
 * Use this everywhere: hero ring, badge, chart bands, map,
 * timeline, alerts, recommendation card.
 */

export type RiskTheme = {
  /** Hex color for text / SVG strokes */
  color: string
  /** Hex color for backgrounds (lower opacity applied by consumer) */
  bgColor: string
  /** Tailwind-compatible inline border color */
  borderColor: string
  /** CSS box-shadow glow string for the risk ring / heat pulse */
  glow: string
  /** Color used in the conic-gradient risk ring */
  ringColor: string
  /** Tailwind utility classes for badge styling */
  badgeClass: string
  /** Human-readable label */
  label: string
  /** Emoji icon */
  icon: string
  /** Short one-word descriptor */
  severity: 'low' | 'moderate' | 'high' | 'very_high' | 'extreme'
  /** 0-4 numeric severity index (useful for comparisons) */
  severityIndex: number
}

const THEMES: Record<string, RiskTheme> = {
  low: {
    color: '#16a34a',
    bgColor: '#16a34a',
    borderColor: '#16a34a',
    glow: '0 0 20px rgba(22, 163, 74, 0.25), 0 0 40px rgba(22, 163, 74, 0.10)',
    ringColor: '#22c55e',
    badgeClass: 'bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400',
    label: 'Low Risk',
    icon: '🟢',
    severity: 'low',
    severityIndex: 0,
  },
  moderate: {
    color: '#ca8a04',
    bgColor: '#eab308',
    borderColor: '#eab308',
    glow: '0 0 20px rgba(234, 179, 8, 0.25), 0 0 40px rgba(234, 179, 8, 0.10)',
    ringColor: '#eab308',
    badgeClass: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400',
    label: 'Moderate',
    icon: '🟡',
    severity: 'moderate',
    severityIndex: 1,
  },
  high: {
    color: '#ea580c',
    bgColor: '#f97316',
    borderColor: '#f97316',
    glow: '0 0 24px rgba(249, 115, 22, 0.30), 0 0 48px rgba(249, 115, 22, 0.12)',
    ringColor: '#f97316',
    badgeClass: 'bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-400',
    label: 'High Risk',
    icon: '🟠',
    severity: 'high',
    severityIndex: 2,
  },
  very_high: {
    color: '#dc2626',
    bgColor: '#ef4444',
    borderColor: '#ef4444',
    glow: '0 0 28px rgba(239, 68, 68, 0.35), 0 0 56px rgba(239, 68, 68, 0.15)',
    ringColor: '#ef4444',
    badgeClass: 'bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400',
    label: 'Very High',
    icon: '🔴',
    severity: 'very_high',
    severityIndex: 3,
  },
  extreme: {
    color: '#991b1b',
    bgColor: '#b91c1c',
    borderColor: '#991b1b',
    glow: '0 0 32px rgba(153, 27, 27, 0.45), 0 0 64px rgba(153, 27, 27, 0.20)',
    ringColor: '#991b1b',
    badgeClass: 'bg-red-900/20 text-red-900 border-red-900/40 dark:text-red-300',
    label: 'EXTREME',
    icon: '🆘',
    severity: 'extreme',
    severityIndex: 4,
  },
  unknown: {
    color: '#6b7280',
    bgColor: '#9ca3af',
    borderColor: '#9ca3af',
    glow: 'none',
    ringColor: '#9ca3af',
    badgeClass: 'bg-gray-500/15 text-gray-600 border-gray-500/30 dark:text-gray-400',
    label: 'Unknown',
    icon: '—',
    severity: 'low',
    severityIndex: 0,
  },
}

/** Normalize backend risk_level strings to theme keys */
function normalizeLevel(level: string): string {
  const l = level.toLowerCase().replace(/[\s-]/g, '_')
  if (l === 'veryhigh' || l === 'very_high') return 'very_high'
  if (l in THEMES) return l
  return 'unknown'
}

/**
 * getRiskTheme — returns the full visual token set for a given risk level.
 *
 * @param level - Backend risk_level string (e.g. "high", "very_high", "extreme")
 * @returns RiskTheme with color, bg, glow, ring, badge, label, icon
 */
export function getRiskTheme(level: string): RiskTheme {
  return THEMES[normalizeLevel(level)] ?? THEMES.unknown
}

/** Chart band definitions for the 12h forecast risk overlay */
export const RISK_BANDS = [
  { level: 'low',       min: 0,  max: 30, color: '#16a34a', label: 'Low' },
  { level: 'moderate',  min: 30, max: 55, color: '#eab308', label: 'Moderate' },
  { level: 'high',      min: 55, max: 72, color: '#f97316', label: 'High' },
  { level: 'very_high', min: 72, max: 88, color: '#ef4444', label: 'Very High' },
  { level: 'extreme',   min: 88, max: 100, color: '#991b1b', label: 'Extreme' },
] as const

/** Temperature thresholds for background bands on the forecast chart */
export const TEMP_RISK_BANDS = [
  { label: 'Low',       tempMin: 0,  tempMax: 28, color: '#16a34a' },
  { label: 'Moderate',  tempMin: 28, tempMax: 33, color: '#eab308' },
  { label: 'High',      tempMin: 33, tempMax: 38, color: '#f97316' },
  { label: 'Very High', tempMin: 38, tempMax: 42, color: '#ef4444' },
  { label: 'Extreme',   tempMin: 42, tempMax: 60, color: '#991b1b' },
] as const
