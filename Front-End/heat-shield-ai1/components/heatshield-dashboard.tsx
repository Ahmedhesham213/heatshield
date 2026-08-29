'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  Crosshair,
  Droplets,
  ExternalLink,
  Flame,
  Info,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Snowflake,
  Sun,
  Thermometer,
  TrendingUp,
  Trophy,
  Wind,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { GamificationBadge } from '@/components/gamification-badge'
import { HeatAlertsCenter } from '@/components/heat-alerts-center'
import { HeatRouteCalculator } from '@/components/heat-route-calculator'
import { HeatWarningToast } from '@/components/heat-warning-toast'
import { LocationCompare } from '@/components/location-compare'
import { Navbar, US_PRESET_CITIES } from '@/components/navbar'
import { OutdoorPlanner } from '@/components/outdoor-planner'
import { ProtectMePanel } from '@/components/protect-me-panel'
import { SettingsModal } from '@/components/settings-modal'
import { useGeolocation } from '@/hooks/use-geolocation'
import { useLiveHeatProtection } from '@/hooks/use-live-heat-protection'
import {
  getHeatRisk,
  getNearbySafer,
  isUSLocation,
  type HeatRiskResponse,
  type NearbySaferResponse,
} from '@/services/api'
import {
  ACTIVITY_PROFILES,
  getActivityProfile,
  celsiusToFahrenheit,
  formatTempUnit,
  getRiskTheme,
  TEMP_RISK_BANDS,
  TempUnit,
} from '@/utils/risk-theme'

const HeatMap = dynamic(
  () => import('@/components/heat-map').then((module) => module.HeatMap),
  { ssr: false }
)

const DEFAULT_US_LOCATION = { lat: 40.7128, lon: -74.0060, name: 'New York City, NY' }

const BOOT_PHASES = [
  { id: 0, delay: 0,    label: 'Scanning local thermal conditions…' },
  { id: 1, delay: 420,  label: 'Reading current temperature…' },
  { id: 2, delay: 800,  label: 'Detecting historical anomaly…' },
  { id: 3, delay: 1100, label: 'Analyzing 12-hour forecast window…' },
  { id: 4, delay: 1380, label: 'Computing AI risk score…' },
  { id: 5, delay: 1680, label: 'ANALYSIS COMPLETE' },
] as const

function formatDiff(diff: number): string {
  return diff >= 0 ? `+${diff.toFixed(1)}°C` : `${diff.toFixed(1)}°C`
}

function levelToRiskScore(level: string): number {
  switch (level.toLowerCase()) {
    case 'low': return 20
    case 'moderate': return 42
    case 'high': return 62
    case 'very_high': case 'veryhigh': return 80
    case 'extreme': return 94
    default: return 30
  }
}

// ── COUNT-UP HOOK ──────────────────────────────────────────────────
function useCountUp(target: number, duration = 900, enabled = true): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled) { setValue(0); return }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration, enabled])

  return value
}

// ── INTERSECTION OBSERVER HOOK ─────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect() } },
      { threshold }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, inView }
}

// ── RISK BADGE ─────────────────────────────────────────────────────
function RiskBadge({ level, label }: { level: string; label: string }) {
  const theme = getRiskTheme(level)
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide"
      style={{
        color: theme.ringColor,
        background: `${theme.ringColor}18`,
        border: `1px solid ${theme.ringColor}35`,
      }}
    >
      {label}
    </span>
  )
}

// ── ANIMATED RISK RING / GAUGE ─────────────────────────────────────
function RiskRing({ score, level, animated }: { score: number; level: string; animated: boolean }) {
  const displayScore = useCountUp(score, 1000, animated)
  const ringPct = animated ? (displayScore / 100) * 100 : 0
  const theme = getRiskTheme(level)

  return (
    <div className="relative flex items-center justify-center" style={{ width: 170, height: 170 }}>
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-300"
        style={{
          background: `conic-gradient(${theme.ringColor} 0 ${ringPct}%, var(--border-subtle) ${ringPct}% 100%)`,
          boxShadow: animated && score > 25 ? theme.glow : 'none',
        }}
      />
      {/* Inner circle */}
      <div
        className="relative flex flex-col items-center justify-center rounded-full shadow-2xl"
        style={{
          width: 132,
          height: 132,
          background: 'var(--bg-surface)',
          border: '2px solid var(--border-subtle)',
        }}
      >
        <div
          className="font-mono text-4xl font-black tracking-tighter leading-none"
          style={{ color: theme.ringColor }}
        >
          {displayScore}
        </div>
        <div className="text-[9px] font-bold tracking-widest mt-1" style={{ color: 'var(--text-tertiary)' }}>
          HEAT RISK / 100
        </div>
      </div>
    </div>
  )
}

// ── LIVE INDICATOR ─────────────────────────────────────────────────
function LiveDot({ elapsed, confidence, dataSource }: { elapsed: number; confidence: number; dataSource: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-emerald-400 animate-live-pulse" />
        <span style={{ color: 'var(--text-secondary)' }}>LIVE</span>
      </span>
      <span>Updated {elapsed}s ago</span>
      {dataSource === 'MOCK_DETERMINISTIC' && (
        <span className="text-amber-500 font-bold">Demo Mode</span>
      )}
      {confidence > 0 && (
        <span style={{ color: 'var(--accent-cyan)' }}>
          {confidence}% confidence
        </span>
      )}
    </div>
  )
}

// ── BOOT OVERLAY ───────────────────────────────────────────────────
function BootOverlay({ phase, heatData }: { phase: number; heatData: HeatRiskResponse | null }) {
  const temp = heatData?.current.temperature
  const diff = heatData?.historical.difference
  const peakTemp = heatData?.peak.temperature
  const score = heatData?.current.riskScore ?? 0
  const level = heatData?.current.riskLabel ?? 'Analyzing…'
  const theme = getRiskTheme(heatData?.current.riskLevel ?? 'unknown')
  const progress = Math.min(100, Math.round(((phase + 1) / BOOT_PHASES.length) * 100))

  const currentStepLabel = BOOT_PHASES[Math.min(Math.max(0, phase), BOOT_PHASES.length - 1)]?.label ?? 'Initializing HeatShield…'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 select-none transition-colors duration-200"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Background Radial Glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none rounded-full blur-3xl opacity-30"
        style={{
          width: '80vw',
          maxWidth: 400,
          height: '80vw',
          maxHeight: 400,
          background: 'radial-gradient(circle, rgba(56,189,248,0.3) 0%, rgba(249,115,22,0.1) 60%, transparent 100%)',
        }}
      />

      {/* Main Glass Card */}
      <div
        className="relative z-10 flex flex-col items-center max-w-xs sm:max-w-sm w-full p-6 sm:p-8 rounded-3xl text-center border shadow-2xl backdrop-blur-2xl transition-colors duration-200"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Brand Icon & Header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="grid size-11 place-items-center rounded-2xl shadow-md"
            style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)' }}
          >
            <ShieldCheck className="size-6 text-sky-400" />
          </div>
          <div className="text-left">
            <p className="text-lg font-black tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              HeatShield AI
            </p>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-sky-400">
              Climate Safety Scanner
            </p>
          </div>
        </div>

        {/* Phase Status Pill */}
        <div
          className="mb-5 px-3.5 py-1.5 rounded-full border text-[11px] font-mono font-semibold flex items-center gap-2 max-w-full truncate"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <Loader2 className="size-3.5 text-sky-400 animate-spin flex-shrink-0" />
          <span className="truncate">{currentStepLabel}</span>
        </div>

        {/* Fixed Height Data Container — prevents layout shift & height explosion on mobile */}
        <div
          className="w-full h-32 flex flex-col items-center justify-center rounded-2xl border p-4 transition-all duration-300"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          {phase < 1 || temp === undefined ? (
            <div className="flex flex-col items-center space-y-2">
              <div className="size-6 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
              <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Reading Satellite & Thermal Sensors…</p>
            </div>
          ) : (
            <div className="space-y-1.5 animate-fade-in w-full">
              <p className="text-[9px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                Current Outdoor Temperature
              </p>
              <p className="font-mono text-3xl sm:text-4xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {formatTempUnit(temp, 'C')}
              </p>

              {diff !== undefined && (
                <p className="text-xs font-bold" style={{ color: diff >= 0 ? '#fb923c' : '#4ade80' }}>
                  {formatDiff(diff)} vs historical baseline
                </p>
              )}

              {phase >= 4 && score > 0 && (
                <div className="pt-1">
                  <span
                    className="inline-block px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider"
                    style={{
                      color: theme.ringColor,
                      background: `${theme.ringColor}20`,
                      border: `1px solid ${theme.ringColor}40`,
                    }}
                  >
                    {level} · {score}/100 Risk
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar & Counter */}
        <div className="mt-6 w-full space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono font-bold" style={{ color: 'var(--text-tertiary)' }}>
            <span>CALIBRATING</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #38bdf8 0%, #fb923c 100%)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}


function Skel({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg animate-shimmer ${className}`}
      style={{ background: 'var(--border-subtle)' }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════
// HERO SECTION
// ═══════════════════════════════════════════════════════════════════
function HeroSection({
  heatData,
  loading,
  riskLevel,
  riskScore,
  riskLabel,
  selectedLocation,
  elapsedDisplay,
  bootComplete,
  tempUnit,
  selectedActivity,
}: {
  heatData: HeatRiskResponse | null
  loading: boolean
  riskLevel: string
  riskScore: number
  riskLabel: string
  selectedLocation: { lat: number; lon: number; name: string }
  elapsedDisplay: number
  bootComplete: boolean
  tempUnit: TempUnit
  selectedActivity: string
}) {
  const theme = getRiskTheme(riskLevel)
  const temp = heatData?.current.temperature
  const feelsLike = heatData?.current.feelsLike
  const diff = heatData?.historical.difference ?? 0
  const recommendation = heatData?.recommendation ?? ''
  const activityProfile = getActivityProfile(selectedActivity)

  return (
    <section
      id="dashboard"
      className="hero-thermal animate-section-reveal"
      style={{
        borderRadius: 24,
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}
    >
      {/* Risk color accent bar */}
      <div style={{ height: 4, background: `linear-gradient(90deg, transparent, ${theme.ringColor}, transparent)` }} />

      <div className="relative z-10 p-4 sm:p-6 lg:p-10">

        {/* ── LOCATION ROW ── */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="size-3.5 flex-shrink-0" style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-xs font-bold uppercase tracking-wide truncate" style={{ color: 'var(--text-secondary)' }}>
              {selectedLocation.name}
            </span>
          </div>
          <div className="flex-shrink-0">
            <LiveDot
              elapsed={elapsedDisplay}
              confidence={heatData?.explainability.confidence ?? 0}
              dataSource={heatData?.dataSource ?? ''}
            />
          </div>
        </div>

        {/* ── MOBILE: stacked layout / DESKTOP: 3-col grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 lg:gap-12 items-center">

          {/* Temperature Column */}
          <div className="sm:col-span-1 flex flex-row sm:flex-col items-center sm:items-start gap-4 sm:gap-0">
            {loading ? (
              <Skel className="h-16 w-32 sm:h-20 sm:w-48 mb-0 sm:mb-4" />
            ) : (
              <div
                className="font-mono font-black tracking-tighter leading-none"
                style={{ fontSize: 'clamp(3.5rem, 16vw, 5rem)', color: 'var(--text-primary)', letterSpacing: '-0.04em' }}
              >
                {formatTempUnit(temp, tempUnit)}
              </div>
            )}

            {!loading && heatData && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <Droplets className="size-3.5" style={{ color: '#38bdf8' }} />
                  <span>Feels</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                    {formatTempUnit(feelsLike, tempUnit)}
                  </span>
                </div>

                {diff !== 0 && (
                  <div
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{
                      background: diff >= 0 ? 'rgba(251,146,60,0.12)' : 'rgba(74,222,128,0.12)',
                      border: `1px solid ${diff >= 0 ? 'rgba(251,146,60,0.25)' : 'rgba(74,222,128,0.25)'}`,
                      color: diff >= 0 ? '#fb923c' : '#4ade80',
                    }}
                  >
                    <TrendingUp className="size-3" />
                    {formatDiff(diff)} vs baseline
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Risk Ring — centered, visible on mobile */}
          <div className="sm:col-span-1 flex flex-col items-center gap-3">
            {loading ? (
              <div className="size-36 sm:size-44 rounded-full animate-shimmer" style={{ background: 'var(--border-subtle)' }} />
            ) : (
              <RiskRing score={riskScore} level={riskLevel} animated={bootComplete} />
            )}
            {!loading && heatData && (
              <RiskBadge level={riskLevel} label={riskLabel} />
            )}
          </div>

          {/* Peak + Hydration info — hidden on mobile (shown below), shown on sm+ */}
          <div className="hidden sm:block sm:col-span-1 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                Safety Info
              </p>
              <span className="text-xs font-bold" style={{ color: 'var(--accent-cyan)' }}>
                {activityProfile.icon} {activityProfile.title}
              </span>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skel key={i} className="h-14 w-full" />)}
              </div>
            ) : heatData ? (
              <>
                <div className="rounded-xl p-3.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-[9px] font-extrabold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-tertiary)' }}>NOW</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {formatTempUnit(temp, tempUnit)} · {riskLabel}
                  </p>
                </div>

                <div className="rounded-xl p-3.5" style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)' }}>
                  <p className="text-[9px] font-extrabold uppercase tracking-widest mb-1.5" style={{ color: '#fb923c' }}>🔥 PEAK</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {formatTempUnit(heatData.peak.temperature, tempUnit)} at {heatData.peak.time}
                  </p>
                </div>

                <div className="rounded-xl p-3.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-[9px] font-extrabold uppercase tracking-widest mb-1.5" style={{ color: '#4ade80' }}>HYDRATION</p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Every {activityProfile.hydrationIntervalMins} mins
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* ── MOBILE: Peak window pill (always visible) ── */}
        {!loading && heatData && (
          <div className="sm:hidden mt-4 flex items-center gap-3 flex-wrap">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)', color: '#fb923c' }}
            >
              <Flame className="size-3.5" />
              Peak {heatData.peak.time}
            </div>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: 'var(--accent-cyan)' }}
            >
              💧 Every {activityProfile.hydrationIntervalMins} min
            </div>
          </div>
        )}

        {/* ── AI RECOMMENDATION (compact) ── */}
        {!loading && recommendation && (
          <div
            className="mt-4 flex items-start gap-3 rounded-2xl p-4"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="grid size-8 flex-shrink-0 place-items-center rounded-full mt-0.5"
              style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.2)' }}
            >
              <ShieldCheck className="size-4" style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--accent-cyan)' }}>
                ⚠️ HeatShield AI
              </p>
              <p className="text-xs sm:text-sm font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {recommendation}
              </p>
            </div>
          </div>
        )}

        {/* ── 4 PRIMARY QUICK-ACTIONS ── */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {[
            {
              label: '🛡️ Protect Me',
              target: 'protect-me',
              style: { background: 'rgba(56,189,248,0.12)', borderColor: 'rgba(56,189,248,0.3)', color: 'var(--accent-cyan)' },
              icon: <ShieldCheck className="size-4" />,
            },
            {
              label: '🧊 Cooler Area',
              target: 'routes',
              style: { background: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.25)', color: '#4ade80' },
              icon: <Snowflake className="size-4" />,
            },
            {
              label: '⏰ Safer Time',
              target: 'planner',
              style: { background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' },
              icon: <Clock className="size-4 text-amber-400" />,
            },
            {
              label: '🗺️ Heat Map',
              target: 'map',
              style: { background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' },
              icon: <Compass className="size-4 text-sky-400" />,
            },
          ].map(({ label, target, style, icon }) => (
            <button
              key={target}
              type="button"
              onClick={() => {
                const el = document.getElementById(target)
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
              className="flex items-center justify-center gap-2 rounded-2xl border font-bold text-xs transition-all active:scale-95 hover:scale-[1.02]"
              style={{ ...style, minHeight: 52, padding: '12px 8px' }}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>

      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// AI EXPLANABILITY PANEL ("Why HeatShield Gave You This Score")
// ═══════════════════════════════════════════════════════════════════
function AIExplanationPanel({ heatData, loading, tempUnit }: { heatData: HeatRiskResponse | null; loading: boolean; tempUnit: TempUnit }) {
  const { ref, inView } = useInView()
  const [expanded, setExpanded] = useState(false)
  const theme = getRiskTheme(heatData?.current.riskLevel ?? 'unknown')
  const score = heatData?.current.riskScore ?? 0
  const label = heatData?.current.riskLabel ?? '—'
  const explain = heatData?.explainability
  const factors = heatData?.riskFactors

  const breakdown5Signals = [
    { name: 'Thermal Severity', score: factors?.temperature ?? 0, weight: '35%', status: (factors?.temperature ?? 0) >= 60 ? 'High Thermal Stress' : 'Moderate', desc: 'Current apparent temperature relative to dangerous heat threshold.' },
    { name: 'Historical Anomaly', score: factors?.historicalGap ?? 0, weight: '25%', status: (factors?.historicalGap ?? 0) >= 50 ? 'Significant Anomaly' : 'Near Normal', desc: "Deviation from the local 7-day historical baseline average." },
    { name: 'Forecast Persistence', score: factors?.heatDuration ?? 0, weight: '20%', status: 'Persistent High Risk', desc: 'Consecutive hours of uninterrupted elevated temperatures.' },
    { name: 'Forecast Peak', score: Math.round((heatData?.peak.temperature ?? 0) * 2), weight: '10%', status: `${formatTempUnit(heatData?.peak.temperature, tempUnit)} Peak`, desc: 'Maximum predicted thermal reading over the next 12 hours.' },
    { name: 'Solar Index / Apparent Load', score: Math.round((heatData?.current.feelsLike ?? 0) * 1.8), weight: '10%', status: 'Direct Solar Load', desc: 'Calculated apparent heat index factoring relative humidity.' },
  ]

  return (
    <section
      ref={ref}
      className={`section-hidden ${inView ? 'section-visible' : ''}`}
      style={{ transitionDelay: '100ms' }}
    >
      <div className="hs-card p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
          <div className="flex items-center gap-4">
            <div
              className="grid size-11 place-items-center rounded-2xl flex-shrink-0"
              style={{ background: `${theme.ringColor}18`, border: `1px solid ${theme.ringColor}30` }}
            >
              <BrainCircuit className="size-5" style={{ color: theme.ringColor }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Why HeatShield Gave You This Score ({score}/100)
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                heatshield-risk-v1 · 5-Signal Explainable Heat Intelligence Model
              </p>
            </div>
          </div>

          {!loading && explain && (
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              <span className="size-2 rounded-full" style={{ backgroundColor: theme.ringColor }} />
              {explain.confidence}% AI Model Confidence
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skel key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <>
            {/* Quick 3-bullet summary — always visible */}
            <div
              className="mb-4 rounded-2xl p-4 border"
              style={{ background: `${theme.ringColor}08`, borderColor: `${theme.ringColor}25` }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: theme.ringColor }}>
                ⚡ Why this risk score?
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>🌡️</span>
                  <span>Apparent temp: <strong style={{ color: 'var(--text-primary)' }}>{formatTempUnit(heatData?.current.feelsLike, tempUnit)}</strong> — {(factors?.temperature ?? 0) >= 60 ? 'high thermal stress' : 'moderate thermal load'}</span>
                </li>
                <li className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>📈</span>
                  <span>Historical gap: <strong style={{ color: 'var(--text-primary)' }}>{(factors?.historicalGap ?? 0) >= 50 ? 'Significant anomaly' : 'Near normal baseline'}</strong></span>
                </li>
                <li className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>🔥</span>
                  <span>Risk score: <strong style={{ color: theme.ringColor }}>{score}/100 — {label}</strong></span>
                </li>
              </ul>
            </div>

            {/* Toggle for full breakdown */}
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-2 text-xs font-bold mb-4 transition-colors"
              style={{ color: 'var(--accent-cyan)' }}
            >
              <ChevronDown
                className="size-4 transition-transform duration-300"
                style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
              {expanded ? 'Hide Full Analysis' : 'View 5-Signal AI Breakdown'}
            </button>

            {expanded && (
              <div className="space-y-4">
                <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                  5-Signal Risk Factor Breakdown
                </p>

                <div className="grid grid-cols-1 gap-3">
                  {breakdown5Signals.map((sig) => (
                    <div
                      key={sig.name}
                      className="p-4 rounded-2xl border transition-all"
                      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{sig.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                            {sig.weight}
                          </span>
                        </div>
                        <span className="font-mono text-sm font-bold" style={{ color: theme.ringColor }}>
                          {sig.score}/100
                        </span>
                      </div>

                      <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--border-subtle)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{
                            width: `${Math.min(100, sig.score)}%`,
                            background: `linear-gradient(90deg, ${theme.ringColor}60, ${theme.ringColor})`,
                          }}
                        />
                      </div>

                      <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{sig.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// FORECAST SECTION
// ═══════════════════════════════════════════════════════════════════
function ForecastSection({ heatData, loading, tempUnit }: { heatData: HeatRiskResponse | null; loading: boolean; tempUnit: TempUnit }) {
  const { ref, inView } = useInView()
  const [selectedHourIndex, setSelectedHourIndex] = useState<number | null>(null)

  const forecast = heatData?.forecast ?? []

  const chartData = useMemo(() => {
    if (!forecast.length) return []
    return forecast.map((item, idx) => ({
      time: item.time,
      temp: tempUnit === 'F' ? celsiusToFahrenheit(item.temperature) : item.temperature,
      tempC: item.temperature,
      riskScore: item.riskScore || levelToRiskScore(item.level),
      level: item.level,
      label: item.label,
      hourIndex: idx,
    }))
  }, [forecast, tempUnit])

  const hottestHour = useMemo(() => {
    if (!forecast.length) return null
    return [...forecast].sort((a, b) => b.temperature - a.temperature)[0]
  }, [forecast])

  const highestRiskHour = useMemo(() => {
    if (!forecast.length) return null
    return [...forecast].sort((a, b) => b.riskScore - a.riskScore)[0]
  }, [forecast])

  const safestHour = useMemo(() => {
    if (!forecast.length) return null
    return [...forecast].sort((a, b) => a.riskScore - b.riskScore)[0]
  }, [forecast])

  const temps = chartData.map((d) => d.temp)
  const minT = temps.length ? Math.max(0, Math.floor(Math.min(...temps) - 3)) : 0
  const maxT = temps.length ? Math.ceil(Math.max(...temps) + 3) : 50

  const selectedItem = selectedHourIndex !== null ? forecast[selectedHourIndex] : null

  return (
    <section
      id="forecast"
      ref={ref}
      className={`section-hidden ${inView ? 'section-visible' : ''}`}
      style={{ transitionDelay: '50ms' }}
    >
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
          12-Hour Timeline
        </p>
        <h2 className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Hourly Forecast
        </h2>
      </div>

      {/* Smart summary — most important info first */}
      {!loading && safestHour && (
        <div
          className="mb-4 rounded-2xl p-4 border"
          style={{ background: 'rgba(74,222,128,0.07)', borderColor: 'rgba(74,222,128,0.25)' }}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 mb-1.5">
            🟢 Best time to go outside
          </p>
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            {safestHour.time} — {formatTempUnit(safestHour.temperature, tempUnit)}
          </p>
          {hottestHour && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              ⚠️ Avoid around <strong style={{ color: '#fb923c' }}>{hottestHour.time}</strong> ({formatTempUnit(hottestHour.temperature, tempUnit)} peak)
            </p>
          )}
        </div>
      )}

      {/* Compact 3-stat row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
        <div className="p-3 sm:p-4 rounded-2xl border text-center" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-red-400 mb-1">🔥 Peak</p>
          <p className="font-mono text-xs sm:text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {hottestHour ? `${hottestHour.time}` : '--'}
          </p>
          <p className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            {hottestHour ? formatTempUnit(hottestHour.temperature, tempUnit) : ''}
          </p>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl border text-center" style={{ background: 'rgba(251,146,60,0.08)', borderColor: 'rgba(251,146,60,0.2)' }}>
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-orange-400 mb-1">⚠️ High-Risk</p>
          <p className="font-mono text-xs sm:text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {highestRiskHour ? `${highestRiskHour.time}` : '--'}
          </p>
          <p className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            {highestRiskHour ? `${highestRiskHour.riskScore}/100` : ''}
          </p>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl border text-center" style={{ background: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.2)' }}>
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-400 mb-1">🟢 Safest</p>
          <p className="font-mono text-xs sm:text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {safestHour ? `${safestHour.time}` : '--'}
          </p>
          <p className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            {safestHour ? formatTempUnit(safestHour.temperature, tempUnit) : ''}
          </p>
        </div>
      </div>

      <div className="hs-card p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Hourly Cards</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Tap any hour for details</p>
          </div>
        </div>

        {/* Hourly Cards Row */}
        <div className="flex gap-2 overflow-x-auto pb-2 pr-2">
          {forecast.map((item, idx) => {
            const isSelected = selectedHourIndex === idx
            const theme = getRiskTheme(item.level)
            return (
              <button
                key={idx}
                onClick={() => setSelectedHourIndex(idx)}
                className="flex-shrink-0 min-w-[80px] sm:min-w-[95px] p-3 rounded-2xl border text-center transition-all active:scale-95"
                style={{
                  background: isSelected ? `${theme.ringColor}18` : 'var(--bg-elevated)',
                  borderColor: isSelected ? theme.ringColor : 'var(--border-subtle)',
                }}
              >
                <p className="font-mono text-xs font-bold" style={{ color: 'var(--text-tertiary)' }}>{item.time}</p>
                <p className="font-mono text-sm font-black my-1" style={{ color: 'var(--text-primary)' }}>
                  {formatTempUnit(item.temperature, tempUnit)}
                </p>
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: theme.ringColor }}
                />
              </button>
            )
          })}
        </div>

        {/* Selected Hour Details Callout */}
        {selectedItem && (
          <div className="mt-4 p-4 rounded-2xl border animate-fade-in" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  Hourly Snapshot @ {selectedItem.time}
                </p>
                <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Temperature: {formatTempUnit(selectedItem.temperature, tempUnit)} · Risk: {selectedItem.riskScore}/100 ({selectedItem.label})
                </p>
              </div>
              <button onClick={() => setSelectedHourIndex(null)} className="text-xs text-sky-400 font-bold">Close</button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TEMPERATURE VS FEELS LIKE COMPARISON CARD
// ═══════════════════════════════════════════════════════════════════
function TempVsFeelsLikeCard({ heatData, loading, tempUnit }: { heatData: HeatRiskResponse | null; loading: boolean; tempUnit: TempUnit }) {
  const actualC = heatData?.current.temperature ?? 0
  const feelsC = heatData?.current.feelsLike ?? 0
  const diffC = Math.max(0, feelsC - actualC)

  return (
    <div className="hs-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="grid size-10 place-items-center rounded-2xl"
          style={{ background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.2)' }}
        >
          <Thermometer className="size-5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Temperature vs Feels Like</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Actual reading vs apparent heat index</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-center mb-6">
        <div className="p-4 rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-[9px] font-extrabold uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>Actual Temp</p>
          <p className="font-mono text-3xl font-black" style={{ color: 'var(--text-primary)' }}>
            {formatTempUnit(actualC, tempUnit)}
          </p>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)' }}>
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-amber-400 mb-1">Feels Like</p>
          <p className="font-mono text-3xl font-black text-amber-400">
            {formatTempUnit(feelsC, tempUnit)}
          </p>
        </div>
      </div>

      <div className="p-4 rounded-2xl border text-xs font-medium leading-relaxed" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
        {diffC > 1 ? (
          <>
            🔥 <span className="font-bold text-amber-400">Apparent temperature is {diffC.toFixed(1)}°C higher</span> due to relative humidity preventing sweat evaporation and high solar radiation load.
          </>
        ) : (
          <>
            ✓ Actual and feels-like temperatures are aligned. Humidity load is normal.
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// HISTORICAL COMPARISON CARD ("How Unusual is Today?")
// ═══════════════════════════════════════════════════════════════════
function HistoricalComparisonCard({ heatData, loading, tempUnit }: { heatData: HeatRiskResponse | null; loading: boolean; tempUnit: TempUnit }) {
  const currentTemp = heatData?.current.temperature ?? 0
  const avgTemp = heatData?.historical.averageTemperature ?? 0
  const diff = heatData?.historical.difference ?? 0
  const isUnusual = heatData?.historical.isUnusual ?? false

  return (
    <div className="hs-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="grid size-10 place-items-center rounded-2xl"
          style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.2)' }}
        >
          <Activity className="size-5" style={{ color: '#fb923c' }} />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>How Unusual Is Today?</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Current vs historical baseline</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="font-mono text-3xl font-black" style={{ color: diff >= 0 ? '#fb923c' : '#4ade80' }}>
            {formatDiff(diff)}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {isUnusual ? 'Significant Anomaly' : 'Near Baseline'}
          </p>
        </div>

        <div className="text-right text-xs">
          <p className="text-[9px] font-bold uppercase tracking-widest text-tertiary mb-1">Historical Avg</p>
          <p className="font-mono text-lg font-bold" style={{ color: 'var(--text-secondary)' }}>
            {formatTempUnit(avgTemp, tempUnit)}
          </p>
        </div>
      </div>

      <div className="p-4 rounded-2xl border text-xs font-medium" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
        {heatData?.historical.message || "Today's temperature is evaluated against Thirty-year regional baseline data."}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════
export function HeatShieldDashboard() {
  const geo = useGeolocation(DEFAULT_US_LOCATION.lat, DEFAULT_US_LOCATION.lon)
  const protection = useLiveHeatProtection()
  const [selectedLocation, setSelectedLocation] = useState(DEFAULT_US_LOCATION)
  const [heatData, setHeatData] = useState<HeatRiskResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<'api' | 'location' | null>(null)

  const [saferData, setSaferData] = useState<NearbySaferResponse | null>(null)
  const [saferLoading, setSaferLoading] = useState(false)

  // Settings State
  const [tempUnit, setTempUnit] = useState<TempUnit>('C')
  const [selectedActivity, setSelectedActivity] = useState<string>('walking')
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false)
  const [alertThreshold, setAlertThreshold] = useState<number>(60)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const [bootPhase, setBootPhase] = useState<number>(-1)
  const [bootComplete, setBootComplete] = useState(false)
  const hasBooted = useRef(false)

  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [elapsedDisplay, setElapsedDisplay] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setElapsedDisplay(Math.round((Date.now() - lastUpdateTime) / 1000)), 1000)
    return () => clearInterval(id)
  }, [lastUpdateTime])

  const isSelectedLocationInUS = useMemo(
    () => isUSLocation(selectedLocation.lat, selectedLocation.lon),
    [selectedLocation.lat, selectedLocation.lon]
  )

  const fetchHeatData = useCallback(() => {
    if (!isUSLocation(selectedLocation.lat, selectedLocation.lon)) {
      setLoading(false)
      setHeatData(null)
      setError('FortyGuard currently supports US locations only. Please select a US location.')
      setErrorType('location')
      return
    }
    setLoading(true)
    setError(null)
    setErrorType(null)
    getHeatRisk(selectedLocation.lat, selectedLocation.lon)
      .then((data) => {
        setHeatData(data)
        setLastUpdateTime(Date.now())
      })
      .catch((err: unknown) => {
        setHeatData(null)
        setError(err instanceof Error && err.message ? err.message : 'Unable to reach HeatShield API.')
        setErrorType('api')
      })
      .finally(() => setLoading(false))
  }, [selectedLocation.lat, selectedLocation.lon])

  useEffect(() => {
    if (hasBooted.current) return
    hasBooted.current = true
    BOOT_PHASES.forEach((phase) => { setTimeout(() => setBootPhase(phase.id), phase.delay) })
    setTimeout(() => setBootComplete(true), 2200)
  }, [])

  useEffect(() => { fetchHeatData() }, [fetchHeatData])

  const handleSelectCity = (lat: number, lon: number, name: string) => {
    setSelectedLocation({ lat, lon, name })
    setSaferData(null)
  }

  const handleRequestGpsLocation = async () => {
    setLoading(true)
    setError(null)
    setErrorType(null)
    try {
      const coords = await geo.requestLocation()
      setSelectedLocation({
        lat: coords.lat,
        lon: coords.lon,
        name: `Device GPS (${coords.lat.toFixed(2)}°, ${coords.lon.toFixed(2)}°)`,
      })
      setSaferData(null)
    } catch (err: unknown) {
      setLoading(false)
      setError(err instanceof Error && err.message ? err.message : 'Unable to determine device location.')
      setErrorType('location')
    }
  }

  const handleRequestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission()
      return perm === 'granted'
    }
    return false
  }

  const riskLevel = heatData?.current.riskLevel ?? 'unknown'
  const riskLabel = heatData?.current.riskLabel ?? 'Analyzing…'
  const riskScore = heatData?.current.riskScore ?? 0

  if (!bootComplete) {
    return <BootOverlay phase={bootPhase} heatData={loading ? null : heatData} />
  }

  // Merge live data into display when protect mode is active
  const displayData = protection.isProtecting && protection.liveData ? protection.liveData : heatData
  const displayLoading = protection.isProtecting && protection.liveLoading ? true : loading

  return (
    <div className="min-h-screen pb-24 md:pb-12" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', transition: 'background-color 0.25s ease' }}>
      {/* Navbar */}
      <Navbar
        selectedCityName={selectedLocation.name}
        onSelectCity={handleSelectCity}
        onRequestGps={handleRequestGpsLocation}
        tempUnit={tempUnit}
        setTempUnit={setTempUnit}
        selectedActivity={selectedActivity}
        setSelectedActivity={setSelectedActivity}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 space-y-8">
        {/* Page Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-slide-up">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80' }}
              >
                🇺🇸 US Coverage Active
              </span>
              {heatData && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: 'var(--accent-cyan)' }}
                >
                  {heatData.dataSource === 'MOCK_DETERMINISTIC' ? '⚙ Demo Data' : '📡 Live Data'}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
              Heat Risk Intelligence Platform
            </h1>
            <p className="text-sm mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
              Explainable AI Hyper-Local Thermal Analysis · FortyGuard Engine
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRequestGpsLocation}
              disabled={geo.loading}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all border disabled:opacity-50"
              style={{
                background: 'var(--bg-elevated)',
                borderColor: 'var(--border-default)',
                color: 'var(--accent-cyan)',
              }}
            >
              <Crosshair className={`size-3.5 ${geo.loading ? 'animate-spin' : ''}`} />
              {geo.loading ? 'Locating Device…' : 'Use Device GPS'}
            </button>
            <button
              onClick={fetchHeatData}
              disabled={loading}
              className="grid size-10 place-items-center rounded-xl transition-all disabled:opacity-50 border"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              title="Refresh data"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* SECTION 0.5: PROTECT ME */}
        <ProtectMePanel protection={protection} tempUnit={tempUnit} />

        {/* SECTION 1: HERO DASHBOARD */}
        <HeroSection
          heatData={displayData}
          loading={displayLoading}
          riskLevel={displayData?.current.riskLevel ?? riskLevel}
          riskScore={displayData?.current.riskScore ?? riskScore}
          riskLabel={displayData?.current.riskLabel ?? riskLabel}
          selectedLocation={selectedLocation}
          elapsedDisplay={elapsedDisplay}
          bootComplete={bootComplete}
          tempUnit={tempUnit}
          selectedActivity={selectedActivity}
        />

        {/* SECTION 2: AI EXPLANABILITY PANEL */}
        <AIExplanationPanel heatData={displayData} loading={displayLoading} tempUnit={tempUnit} />

        {/* SECTION 3: 12-HOUR FORECAST */}
        <ForecastSection heatData={displayData} loading={displayLoading} tempUnit={tempUnit} />

        {/* SECTION 4: SMART OUTDOOR PLANNER ("Plan My Day") */}
        <OutdoorPlanner heatData={heatData} tempUnit={tempUnit} />

        {/* SECTION 5: INTERACTIVE HEAT MAP */}
        <section id="map" className="hs-card overflow-hidden">
          <div className="p-6 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Interactive Heat-Intelligence Map
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Toggle thermal layers and inspect nearby hotspots
            </p>
          </div>

          <div className="w-full h-[440px] min-h-[440px]">
            <HeatMap
              latitude={selectedLocation.lat}
              longitude={selectedLocation.lon}
              currentTemp={heatData?.current.temperature}
              feelsLikeTemp={heatData?.current.feelsLike}
              saferTemp={saferData?.safer_temp_c}
              riskLevel={riskLevel}
              riskScore={riskScore}
              tempUnit={tempUnit}
              onSelect={(lat, lon) => setSelectedLocation({ lat, lon, name: `Custom Spot (${lat.toFixed(2)}, ${lon.toFixed(2)})` })}
            />
          </div>
        </section>

        {/* SECTION 6: HEAT-SAFE ROUTE CALCULATOR */}
        <HeatRouteCalculator saferData={saferData} currentTemp={heatData?.current.temperature ?? 30} tempUnit={tempUnit} />

        {/* SECTION 7: LOCATION COMPARE */}
        <LocationCompare
          currentCityName={selectedLocation.name}
          currentLat={selectedLocation.lat}
          currentLon={selectedLocation.lon}
          tempUnit={tempUnit}
        />

        {/* SECTION 8: TEMPERATURE VS FEELS LIKE & HISTORICAL COMPARISON */}
        <div className="grid gap-6 lg:grid-cols-2">
          <TempVsFeelsLikeCard heatData={heatData} loading={loading} tempUnit={tempUnit} />
          <HistoricalComparisonCard heatData={heatData} loading={loading} tempUnit={tempUnit} />
        </div>

        {/* SECTION 9: SMART HEAT ALERTS */}
        <HeatAlertsCenter
          heatData={heatData}
          notificationsEnabled={notificationsEnabled}
          setNotificationsEnabled={setNotificationsEnabled}
          onRequestNotificationPermission={handleRequestNotificationPermission}
        />

        {/* SECTION 10: GAMIFICATION & BADGES */}
        <GamificationBadge />

        {/* Footer & Disclaimer */}
        <footer className="space-y-4 py-8 text-xs border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
          <div className="flex flex-col sm:flex-row justify-between gap-3 font-semibold">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4" style={{ color: 'var(--accent-cyan)' }} />
              HeatShield AI · Powered by FortyGuard US Hyper-Local API · heatshield-risk-v1
            </span>
            <span className="font-mono">Team Nexio · FortyGuard Hackathon 2026</span>
          </div>

          <p className="text-[10px] leading-relaxed max-w-3xl">
            Disclaimer: HeatShield provides heat-risk decision support and does not replace official weather warnings, occupational safety guidance, or medical advice.
          </p>
        </footer>
      </main>

      {/* Heat Warning Toast */}
      <HeatWarningToast
        heatData={displayData}
        tempUnit={tempUnit}
        isLiveProtecting={protection.isProtecting}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        tempUnit={tempUnit}
        setTempUnit={setTempUnit}
        selectedActivity={selectedActivity}
        setSelectedActivity={setSelectedActivity}
        notificationsEnabled={notificationsEnabled}
        setNotificationsEnabled={setNotificationsEnabled}
        alertThreshold={alertThreshold}
        setAlertThreshold={setAlertThreshold}
        onRequestNotificationPermission={handleRequestNotificationPermission}
      />
    </div>
  )
}
