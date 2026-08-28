/**
 * getRiskTheme — HeatShield Design System
 *
 * Single source of truth for risk-level visual tokens.
 * Mapped to calm, sophisticated climate-tech palette.
 */

export type RiskTheme = {
  /** Hex color for text / SVG strokes */
  color: string
  /** Hex color for backgrounds (lower opacity applied by consumer) */
  bgColor: string
  /** Inline border color */
  borderColor: string
  /** CSS box-shadow glow string */
  glow: string
  /** Color used in the conic-gradient risk ring */
  ringColor: string
  /** Tailwind utility classes for badge styling */
  badgeClass: string
  /** Human-readable label */
  label: string
  /** Emoji icon */
  icon: string
  /** Short descriptor */
  severity: 'low' | 'moderate' | 'high' | 'very_high' | 'extreme'
  /** 0-4 numeric severity index */
  severityIndex: number
}

const THEMES: Record<string, RiskTheme> = {
  low: {
    color: '#4ade80',
    bgColor: '#4ade80',
    borderColor: '#4ade80',
    glow: '0 0 20px rgba(74, 222, 128, 0.25), 0 0 40px rgba(74, 222, 128, 0.10)',
    ringColor: '#4ade80',
    badgeClass: 'risk-badge-low',
    label: 'Low Risk',
    icon: '🟢',
    severity: 'low',
    severityIndex: 0,
  },
  moderate: {
    color: '#facc15',
    bgColor: '#facc15',
    borderColor: '#facc15',
    glow: '0 0 20px rgba(250, 204, 21, 0.25), 0 0 40px rgba(250, 204, 21, 0.10)',
    ringColor: '#facc15',
    badgeClass: 'risk-badge-moderate',
    label: 'Moderate Risk',
    icon: '🟡',
    severity: 'moderate',
    severityIndex: 1,
  },
  high: {
    color: '#fb923c',
    bgColor: '#fb923c',
    borderColor: '#fb923c',
    glow: '0 0 24px rgba(251, 146, 60, 0.30), 0 0 48px rgba(251, 146, 60, 0.12)',
    ringColor: '#fb923c',
    badgeClass: 'risk-badge-high',
    label: 'High Risk',
    icon: '🟠',
    severity: 'high',
    severityIndex: 2,
  },
  very_high: {
    color: '#f87171',
    bgColor: '#f87171',
    borderColor: '#f87171',
    glow: '0 0 28px rgba(248, 113, 113, 0.35), 0 0 56px rgba(248, 113, 113, 0.15)',
    ringColor: '#f87171',
    badgeClass: 'risk-badge-very-high',
    label: 'Very High Risk',
    icon: '🔴',
    severity: 'very_high',
    severityIndex: 3,
  },
  extreme: {
    color: '#ef4444',
    bgColor: '#ef4444',
    borderColor: '#ef4444',
    glow: '0 0 32px rgba(239, 68, 68, 0.40), 0 0 64px rgba(239, 68, 68, 0.20)',
    ringColor: '#ef4444',
    badgeClass: 'risk-badge-extreme',
    label: 'EXTREME RISK',
    icon: '🆘',
    severity: 'extreme',
    severityIndex: 4,
  },
  unknown: {
    color: '#38bdf8',
    bgColor: '#38bdf8',
    borderColor: '#38bdf8',
    glow: 'none',
    ringColor: '#38bdf8',
    badgeClass: 'risk-badge-low',
    label: 'Analyzing…',
    icon: '—',
    severity: 'low',
    severityIndex: 0,
  },
}

function normalizeLevel(level: string): string {
  const l = level.toLowerCase().replace(/[\s-]/g, '_')
  if (l === 'veryhigh' || l === 'very_high') return 'very_high'
  if (l in THEMES) return l
  return 'unknown'
}

export function getRiskTheme(level: string): RiskTheme {
  return THEMES[normalizeLevel(level)] ?? THEMES.unknown
}

export const RISK_BANDS = [
  { level: 'low', min: 0, max: 30, color: '#4ade80', label: 'Low' },
  { level: 'moderate', min: 30, max: 55, color: '#facc15', label: 'Moderate' },
  { level: 'high', min: 55, max: 72, color: '#fb923c', label: 'High' },
  { level: 'very_high', min: 72, max: 88, color: '#f87171', label: 'Very High' },
  { level: 'extreme', min: 88, max: 100, color: '#ef4444', label: 'Extreme' },
] as const

export const TEMP_RISK_BANDS = [
  { label: 'Low', tempMin: 0, tempMax: 28, color: '#4ade80' },
  { label: 'Moderate', tempMin: 28, tempMax: 33, color: '#facc15' },
  { label: 'High', tempMin: 33, tempMax: 38, color: '#fb923c' },
  { label: 'Very High', tempMin: 38, tempMax: 42, color: '#f87171' },
  { label: 'Extreme', tempMin: 42, tempMax: 60, color: '#ef4444' },
] as const
