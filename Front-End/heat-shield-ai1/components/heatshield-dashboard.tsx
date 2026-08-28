'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  Crosshair,
  Droplets,
  ExternalLink,
  Info,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  ShieldCheck,
  Sun,
  Thermometer,
  TrendingUp,
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
import { Navbar, US_PRESET_CITIES } from '@/components/navbar'
import { useGeolocation } from '@/hooks/use-geolocation'
import {
  getHeatRisk,
  getNearbySafer,
  isUSLocation,
  type HeatRiskResponse,
  type NearbySaferResponse,
} from '@/services/api'
import { getRiskTheme, TEMP_RISK_BANDS } from '@/utils/risk-theme'

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

// ── HELPERS ────────────────────────────────────────────────────────
function formatTemperature(value: number | undefined, digits = 1): string {
  return `${(value ?? 0).toFixed(digits)}°C`
}

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

// ── ANIMATED RISK RING ─────────────────────────────────────────────
function RiskRing({ score, level, animated }: { score: number; level: string; animated: boolean }) {
  const displayScore = useCountUp(score, 1000, animated)
  const ringPct = animated ? (displayScore / 100) * 100 : 0
  const theme = getRiskTheme(level)

  return (
    <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
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
        className="relative flex flex-col items-center justify-center rounded-full"
        style={{
          width: 122,
          height: 122,
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
          / 100
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
        <span className="size-1.5 rounded-full bg-emerald-400 animate-live-pulse" />
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
  const progress = (phase / (BOOT_PHASES.length - 1)) * 100

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(251,146,60,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="animate-boot flex items-center gap-3 mb-16" style={{ animationDelay: '0ms' }}>
        <div
          className="grid size-12 place-items-center rounded-2xl"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
        >
          <ShieldCheck className="size-6 text-sky-400" />
        </div>
        <div>
          <p className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>HeatShield</p>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            Climate Intelligence
          </p>
        </div>
      </div>

      <div className="space-y-4 text-center min-h-[200px] w-full max-w-xs px-6">
        {phase >= 0 && (
          <p
            className="animate-boot text-sm font-mono"
            style={{ color: 'var(--text-secondary)', animationDelay: '80ms' }}
          >
            {BOOT_PHASES[Math.min(phase, BOOT_PHASES.length - 1)].label}
          </p>
        )}

        {phase >= 1 && temp !== undefined && (
          <div className="animate-boot" style={{ animationDelay: '0ms' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>
              Current Temperature
            </p>
            <p className="font-mono text-5xl font-black" style={{ color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>
              {formatTemperature(temp)}
            </p>
          </div>
        )}

        {phase >= 2 && diff !== undefined && (
          <div className="animate-boot" style={{ animationDelay: '0ms' }}>
            <p className="text-sm font-bold" style={{ color: diff >= 0 ? '#fb923c' : '#4ade80' }}>
              {formatDiff(diff)} vs historical baseline
            </p>
          </div>
        )}

        {phase >= 3 && peakTemp !== undefined && (
          <div className="animate-boot" style={{ animationDelay: '0ms' }}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Peak forecast{' '}
              <span style={{ color: '#fb923c', fontWeight: 700 }}>{formatTemperature(peakTemp)}</span>
              {' '}at{' '}
              <span style={{ color: '#fb923c', fontWeight: 700 }}>{heatData?.peak.time}</span>
            </p>
          </div>
        )}

        {phase >= 4 && score > 0 && (
          <div className="animate-boot mt-3" style={{ animationDelay: '0ms' }}>
            <div
              className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl text-base font-bold"
              style={{
                color: theme.ringColor,
                background: `${theme.ringColor}15`,
                border: `1px solid ${theme.ringColor}35`,
              }}
            >
              {level.toUpperCase()} · {score}/100
            </div>
          </div>
        )}

        {phase >= 5 && (
          <div className="animate-boot" style={{ animationDelay: '0ms' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Opening dashboard ↓
            </p>
          </div>
        )}
      </div>

      <div className="mt-12 w-40 h-px rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, background: 'var(--accent-cyan)' }}
        />
      </div>
    </div>
  )
}

// ── SKELETON ───────────────────────────────────────────────────────
function Skel({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg animate-shimmer ${className}`}
      style={{ background: 'var(--border-subtle)' }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════
// SECTION COMPONENTS
// ═══════════════════════════════════════════════════════════════════

// ── HERO SECTION ───────────────────────────────────────────────────
function HeroSection({
  heatData,
  loading,
  riskLevel,
  riskScore,
  riskLabel,
  selectedLocation,
  elapsedDisplay,
  bootComplete,
}: {
  heatData: HeatRiskResponse | null
  loading: boolean
  riskLevel: string
  riskScore: number
  riskLabel: string
  selectedLocation: { lat: number; lon: number; name: string }
  elapsedDisplay: number
  bootComplete: boolean
}) {
  const theme = getRiskTheme(riskLevel)
  const temp = heatData?.current.temperature
  const feelsLike = heatData?.current.feelsLike
  const diff = heatData?.historical.difference ?? 0
  const recommendation = heatData?.recommendation ?? ''

  return (
    <section
      id="dashboard"
      className="hero-thermal animate-section-reveal"
      style={{
        borderRadius: 20,
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        minHeight: 480,
      }}
    >
      <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${theme.ringColor}, transparent)` }} />

      <div className="relative z-10 p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="size-3.5" style={{ color: 'var(--text-tertiary)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                {selectedLocation.name}
              </span>
            </div>
            <p className="font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {selectedLocation.lat.toFixed(4)}° N · {Math.abs(selectedLocation.lon).toFixed(4)}° W
            </p>
          </div>

          <div className="flex items-center gap-3">
            <LiveDot
              elapsed={elapsedDisplay}
              confidence={heatData?.explainability.confidence ?? 0}
              dataSource={heatData?.dataSource ?? ''}
            />
            {!loading && heatData && (
              <RiskBadge level={riskLevel} label={riskLabel} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 lg:gap-12 items-center">
          {/* Temperature */}
          <div className="sm:col-span-1">
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-tertiary)' }}>
              Current Temperature
            </p>
            {loading ? (
              <Skel className="h-20 w-48 mb-4" />
            ) : (
              <div
                className="font-mono font-black tracking-tighter leading-none mb-4"
                style={{ fontSize: 'clamp(3rem, 8vw, 5rem)', color: 'var(--text-primary)', letterSpacing: '-0.04em' }}
              >
                {temp !== undefined ? formatTemperature(temp) : '--'}
              </div>
            )}

            {!loading && heatData && (
              <div className="space-y-2">
                <div
                  className="flex items-center gap-2 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>Feels like</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                    {feelsLike !== undefined ? formatTemperature(feelsLike) : '--'}
                  </span>
                </div>

                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    background: diff >= 0 ? 'rgba(251,146,60,0.12)' : 'rgba(74,222,128,0.12)',
                    border: `1px solid ${diff >= 0 ? 'rgba(251,146,60,0.25)' : 'rgba(74,222,128,0.25)'}`,
                    color: diff >= 0 ? '#fb923c' : '#4ade80',
                  }}
                >
                  <TrendingUp className="size-3" />
                  {formatDiff(diff)} vs 7-day baseline
                </div>
              </div>
            )}
          </div>

          {/* Risk Ring */}
          <div className="sm:col-span-1 flex flex-col items-center gap-4">
            {loading ? (
              <div className="size-40 rounded-full animate-shimmer" style={{ background: 'var(--border-subtle)' }} />
            ) : (
              <RiskRing score={riskScore} level={riskLevel} animated={bootComplete} />
            )}
            <p className="text-[10px] font-bold uppercase tracking-widest text-center" style={{ color: 'var(--text-tertiary)' }}>
              AI Risk Score
            </p>
          </div>

          {/* Action Plan */}
          <div className="sm:col-span-1 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-tertiary)' }}>
              AI Action Plan
            </p>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skel key={i} className="h-14 w-full" />)}
              </div>
            ) : heatData ? (
              <>
                <div
                  className="rounded-xl p-3.5"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                >
                  <p className="text-[9px] font-extrabold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-tertiary)' }}>NOW</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {formatTemperature(temp)} · {riskLabel}
                  </p>
                </div>

                <div
                  className="rounded-xl p-3.5"
                  style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)' }}
                >
                  <p className="text-[9px] font-extrabold uppercase tracking-widest mb-1.5" style={{ color: '#fb923c' }}>PEAK</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {formatTemperature(heatData.peak.temperature)} at {heatData.peak.time}
                  </p>
                </div>

                <div
                  className="rounded-xl p-3.5"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                >
                  <p className="text-[9px] font-extrabold uppercase tracking-widest mb-1.5" style={{ color: '#4ade80' }}>
                    DANGER WINDOW
                  </p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {heatData.peak.windowStart !== '--:--'
                      ? `${heatData.peak.windowStart} – ${heatData.peak.windowEnd}`
                      : 'No extended danger window'}
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* AI Recommendation strip */}
        {!loading && recommendation && (
          <div
            className="mt-8 flex items-start gap-4 rounded-2xl p-5"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="grid size-9 flex-shrink-0 place-items-center rounded-full mt-0.5"
              style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.2)' }}
            >
              <ShieldCheck className="size-4" style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--accent-cyan)' }}>
                HeatShield AI Recommendation
              </p>
              <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {recommendation}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ── AI EXPLAINABILITY ──────────────────────────────────────────────
function AIExplainabilitySection({ heatData, loading }: { heatData: HeatRiskResponse | null; loading: boolean }) {
  const { ref, inView } = useInView()
  const theme = getRiskTheme(heatData?.current.riskLevel ?? 'unknown')
  const score = heatData?.current.riskScore ?? 0
  const label = heatData?.current.riskLabel ?? '—'
  const explain = heatData?.explainability
  const factors = heatData?.riskFactors

  const bars = [
    { label: 'Temperature Severity', value: factors?.temperature ?? 0, icon: Thermometer, desc: 'Thermal stress level based on current reading' },
    { label: 'Historical Anomaly', value: factors?.historicalGap ?? 0, icon: TrendingUp, desc: 'How unusual today is vs 7-day baseline' },
    { label: 'Heat Exposure Duration', value: factors?.heatDuration ?? 0, icon: Clock, desc: 'Persistence of dangerous conditions' },
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
                Why is the risk{' '}
                <span style={{ color: theme.ringColor }}>{label}?</span>
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                heatshield-risk-v1 · Explainable AI
              </p>
            </div>
          </div>

          {!loading && explain && (
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              <span className="size-2 rounded-full" style={{ backgroundColor: theme.ringColor }} />
              {explain.confidence}% confidence
              <span title="Reflects completeness of data" className="cursor-help opacity-60">
                <Info className="size-3.5" />
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-5">
            {[1, 2, 3].map(i => <Skel key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {bars.map(({ label: barLabel, value, icon: Icon, desc }) => (
                <div key={barLabel}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <Icon className="size-4" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{barLabel}</span>
                    </div>
                    <span className="font-mono text-sm font-bold" style={{ color: theme.ringColor }}>
                      {value}/100
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: inView ? `${Math.min(100, value)}%` : '0%',
                        background: `linear-gradient(90deg, ${theme.ringColor}60, ${theme.ringColor})`,
                        transitionDelay: '300ms',
                      }}
                    />
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>{desc}</p>
                </div>
              ))}
            </div>

            {explain && explain.topDrivers.length > 0 && (
              <div
                className="mt-6 rounded-2xl p-5"
                style={{ background: `${theme.ringColor}08`, border: `1px solid ${theme.ringColor}20` }}
              >
                <p className="text-[10px] uppercase tracking-widest font-bold mb-4" style={{ color: 'var(--text-tertiary)' }}>
                  AI-Detected Key Drivers
                </p>
                <div className="space-y-3">
                  {explain.topDrivers.slice(0, 3).map((driver, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span
                        className="flex-shrink-0 grid size-5 place-items-center rounded-full text-[10px] font-black"
                        style={{ backgroundColor: theme.ringColor, color: '#080b10', marginTop: 1 }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium leading-snug" style={{ color: 'var(--text-secondary)' }}>
                        {driver}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                Combined AI Risk Score
              </span>
              <div className="flex items-center gap-3">
                <RiskBadge level={heatData?.current.riskLevel ?? 'unknown'} label={label} />
                <span className="font-mono text-lg font-black" style={{ color: theme.ringColor }}>
                  {score}/100
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

// ── FORECAST CHART ─────────────────────────────────────────────────
function ForecastSection({ heatData, loading }: { heatData: HeatRiskResponse | null; loading: boolean }) {
  const { ref, inView } = useInView()
  const forecast = heatData?.forecast ?? []
  const peak = heatData?.peak
  const peakTime = peak?.time
  const windowStart = peak?.windowStart
  const windowEnd = peak?.windowEnd

  const chartData = useMemo(() => {
    if (!forecast.length) return []
    return forecast.map((item, idx) => ({
      time: item.time,
      temp: item.temperature,
      riskScore: item.riskScore || levelToRiskScore(item.level),
      level: item.level,
      label: item.label,
      hourIndex: idx,
    }))
  }, [forecast])

  const consecutiveByTime = useMemo(() => {
    const result: Record<string, number> = {}
    let count = 0
    for (const item of forecast) {
      const level = item.level.toLowerCase()
      if (level === 'high' || level === 'very_high' || level === 'extreme') {
        count++
        result[item.time] = count
      } else {
        count = 0
      }
    }
    return result
  }, [forecast])

  const temps = chartData.map((d) => d.temp)
  const minT = temps.length ? Math.max(0, Math.floor(Math.min(...temps) - 3)) : 0
  const maxT = temps.length ? Math.ceil(Math.max(...temps) + 3) : 50

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: typeof chartData[0] }> }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    const t = getRiskTheme(d.level)
    const consecutive = consecutiveByTime[d.time]
    return (
      <div
        className="rounded-xl shadow-2xl p-3 text-xs min-w-[140px]"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
      >
        <p className="font-mono font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>{d.time}</p>
        <p className="font-bold text-lg font-mono" style={{ color: 'var(--text-primary)' }}>{d.temp.toFixed(1)}°C</p>
        <p className="font-semibold mt-1" style={{ color: t.ringColor }}>{d.label}</p>
        {consecutive > 1 && (
          <p className="mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {consecutive}{consecutive === 1 ? 'st' : consecutive === 2 ? 'nd' : consecutive === 3 ? 'rd' : 'th'} consecutive high-risk hour
          </p>
        )}
      </div>
    )
  }

  const timeline = useMemo(() => {
    if (!heatData?.forecast?.length) return []
    return heatData.forecast.slice(0, 8).map(item => [item.time, item.label, item.level]) as Array<[string, string, string]>
  }, [heatData])

  const bestHours = useMemo(() => {
    if (!forecast.length) return { start: '--:--', end: '--:--' }
    const lowHours = forecast.filter(h => h.level === 'low' || h.level === 'moderate')
    if (!lowHours.length) return { start: '--:--', end: '--:--' }
    return { start: lowHours[0].time, end: lowHours[lowHours.length - 1].time }
  }, [forecast])

  return (
    <section
      id="forecast"
      ref={ref}
      className={`section-hidden ${inView ? 'section-visible' : ''}`}
      style={{ transitionDelay: '50ms' }}
    >
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
          Section 02
        </p>
        <h2 className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          What happens over the next 12 hours
        </h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <div className="hs-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>12-Hour Temperature Forecast</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Risk zones overlaid on temperature curve</p>
            </div>
            {peak && peak.temperature > 0 && (
              <div className="text-right rounded-xl px-3.5 py-2" style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.2)' }}>
                <p className="text-[9px] font-extrabold uppercase tracking-widest" style={{ color: '#fb923c' }}>Peak</p>
                <p className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {peak.temperature}°C
                  <span className="font-sans text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
                    {peak.time ? ` @ ${peak.time}` : ''}
                  </span>
                </p>
              </div>
            )}
          </div>

          {loading ? (
            <Skel className="h-[240px] w-full" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ left: -16, right: 8, top: 12, bottom: 4 }}>
                  <defs>
                    <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb923c" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#fb923c" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>

                  {TEMP_RISK_BANDS.map((band) => (
                    <ReferenceArea
                      key={band.label}
                      yAxisId="temp"
                      y1={Math.max(minT, band.tempMin)}
                      y2={Math.min(maxT, band.tempMax)}
                      fill={band.color}
                      fillOpacity={0.06}
                      ifOverflow="visible"
                    />
                  ))}

                  {windowStart && windowEnd && windowStart !== '--:--' && (
                    <ReferenceArea
                      yAxisId="temp"
                      x1={windowStart}
                      x2={windowEnd}
                      fill="#ef4444"
                      fillOpacity={0.06}
                      strokeWidth={0}
                    />
                  )}

                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    fontSize={10}
                    interval={1}
                    tick={{ fill: 'var(--text-tertiary)' }}
                  />
                  <YAxis
                    yAxisId="temp"
                    domain={[minT, maxT]}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}°`}
                    fontSize={10}
                    tick={{ fill: 'var(--text-tertiary)' }}
                  />

                  {chartData[0] && (
                    <ReferenceLine
                      yAxisId="temp"
                      x={chartData[0].time}
                      stroke="var(--text-tertiary)"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      label={{ value: 'NOW', position: 'insideTopRight', fontSize: 9, fontWeight: 800, fill: 'var(--text-secondary)' }}
                    />
                  )}

                  {peakTime && peakTime !== '--:--' && (
                    <ReferenceLine
                      yAxisId="temp"
                      x={peakTime}
                      stroke="#fb923c"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      label={{ value: 'PEAK', position: 'insideTopRight', fontSize: 9, fontWeight: 800, fill: '#fb923c' }}
                    />
                  )}

                  <Tooltip content={<CustomTooltip />} />

                  <Area
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temp"
                    stroke="#fb923c"
                    fill="url(#tempGrad)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#fb923c', strokeWidth: 1.5, stroke: 'var(--bg-surface)' }}
                    activeDot={{ r: 5, fill: '#fb923c', strokeWidth: 2, stroke: 'var(--text-primary)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>

              <div className="mt-4 flex flex-wrap gap-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                {TEMP_RISK_BANDS.map((band) => (
                  <span key={band.label} className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="size-2 rounded-sm" style={{ backgroundColor: band.color, opacity: 0.8 }} />
                    {band.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="hs-card p-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3">
            <div
              className="rounded-xl p-3.5"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <p className="text-[9px] font-extrabold uppercase tracking-widest mb-1" style={{ color: '#ef4444' }}>
                ⚠ Avoid Window
              </p>
              <p className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {loading ? '—' : windowStart !== '--:--' ? `${windowStart} – ${windowEnd}` : 'No danger window'}
              </p>
            </div>
            <div
              className="rounded-xl p-3.5"
              style={{ background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)' }}
            >
              <p className="text-[9px] font-extrabold uppercase tracking-widest mb-1" style={{ color: '#4ade80' }}>
                ✓ Best Window
              </p>
              <p className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {loading ? '—' : bestHours.start !== '--:--' ? `${bestHours.start} – ${bestHours.end}` : 'Conditions elevated all day'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-tertiary)' }}>
              Hourly Risk
            </p>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3,4,5,6].map(i => <Skel key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="space-y-1">
                {timeline.map(([time, label, level], idx) => {
                  const t = getRiskTheme(level)
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 py-2 rounded-xl px-2 transition-colors"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <span className="font-mono text-[11px] font-bold w-12 text-right flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                        {time}
                      </span>
                      <span
                        className="size-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: t.ringColor }}
                      />
                      <span className="text-xs font-semibold flex-1" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── MAP SECTION ────────────────────────────────────────────────────
function MapSection({
  latitude, longitude, locationName, onSelect,
  heatData, saferData, loading,
}: {
  latitude: number; longitude: number; locationName: string
  onSelect: (lat: number, lon: number) => void
  heatData: HeatRiskResponse | null; saferData: NearbySaferResponse | null; loading: boolean
}) {
  const { ref, inView } = useInView()
  const summary = heatData?.current
  const peak = heatData?.peak
  const level = summary?.riskLevel ?? 'unknown'
  const theme = getRiskTheme(level)

  return (
    <section
      id="map"
      ref={ref}
      className={`section-hidden ${inView ? 'section-visible' : ''}`}
      style={{ transitionDelay: '80ms' }}
    >
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
          Section 03
        </p>
        <h2 className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Where the heat is
        </h2>
      </div>

      <div className="hs-card overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_280px]">
          <div
            className="relative min-h-[360px] sm:min-h-[420px]"
            aria-label="Live thermal heat map of your location"
          >
            <HeatMap
              latitude={latitude}
              longitude={longitude}
              currentTemp={summary?.temperature}
              saferTemp={saferData?.safer_temp_c}
              riskLevel={level}
              onSelect={onSelect}
            />
            <button
              onClick={() => window.dispatchEvent(new Event('heatshield-recenter'))}
              className="absolute top-3 right-3 z-[1000] flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Crosshair className="size-3.5" />
              Recenter
            </button>
          </div>

          <div className="p-6 flex flex-col justify-between" style={{ borderLeft: '1px solid var(--border-subtle)' }}>
            <div>
              <div className="flex items-start justify-between gap-2 mb-5">
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{locationName}</p>
                  <p className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {latitude.toFixed(4)}, {longitude.toFixed(4)}
                  </p>
                </div>
                {loading ? (
                  <Skel className="h-6 w-20 rounded-full" />
                ) : (
                  <RiskBadge level={level} label={summary?.riskLabel ?? 'Unknown'} />
                )}
              </div>

              <div className="mb-5">
                {loading ? (
                  <Skel className="h-14 w-36" />
                ) : (
                  <div className="font-mono font-black tracking-tighter" style={{ fontSize: 52, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                    {summary ? formatTemperature(summary.temperature) : '--'}
                  </div>
                )}
                <p className="text-xs mt-1.5 font-semibold" style={{ color: 'var(--text-tertiary)' }}>current</p>
              </div>

              <div className="grid grid-cols-2 gap-3 py-4" style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>Risk Score</p>
                  {loading ? <Skel className="h-6 w-14 mt-1" /> : (
                    <p className="font-mono text-base font-bold" style={{ color: theme.ringColor }}>
                      {summary?.riskScore ?? 0}/100
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>Peak Today</p>
                  {loading ? <Skel className="h-6 w-16 mt-1" /> : (
                    <p className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                      {peak ? `${peak.temperature}°C` : '--'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <a
              href="#safer-location"
              onClick={(e) => { e.preventDefault(); document.getElementById('safer-location')?.scrollIntoView({ behavior: 'smooth' }) }}
              className="mt-5 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all"
              style={{ background: 'var(--accent-cyan)', color: 'var(--primary-foreground)', minHeight: 46 }}
            >
              <Navigation className="size-4" />
              Find Cooler Path
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── COOLER PATH SECTION ────────────────────────────────────────────
function CoolerPathSection({
  heatData, saferData, saferLoading, saferError, onFetchSafer, isUS,
}: {
  heatData: HeatRiskResponse | null; saferData: NearbySaferResponse | null
  saferLoading: boolean; saferError: string | null; onFetchSafer: () => void; isUS: boolean
}) {
  const { ref, inView } = useInView()
  const currentTemp = heatData?.current.temperature ?? 0

  return (
    <section
      id="safer-location"
      ref={ref}
      className={`section-hidden ${inView ? 'section-visible' : ''}`}
      style={{ transitionDelay: '100ms' }}
    >
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
          Section 04
        </p>
        <h2 className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Find a cooler route
        </h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="hs-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div
              className="grid size-10 place-items-center rounded-2xl"
              style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.2)' }}
            >
              <Navigation className="size-5" style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>FortyGuard Cooler Spot</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>8-direction thermal sampling</p>
            </div>
          </div>

          {saferLoading ? (
            <div className="space-y-3">
              <Skel className="h-28 w-full" />
              <Skel className="h-12 w-full" />
            </div>
          ) : saferData ? (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-[9px] font-extrabold uppercase tracking-widest mb-2" style={{ color: 'var(--text-tertiary)' }}>Current</p>
                  <p className="font-mono text-3xl font-black" style={{ color: 'var(--text-primary)' }}>
                    {formatTemperature(currentTemp)}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Your location</p>
                </div>
                <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                  <p className="text-[9px] font-extrabold uppercase tracking-widest mb-2" style={{ color: '#4ade80' }}>Cooler Nearby</p>
                  <p className="font-mono text-3xl font-black" style={{ color: '#4ade80' }}>
                    {formatTemperature(saferData.safer_temp_c)}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: '#4ade80' }}>
                    {saferData.distance_m}m {saferData.direction}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <div className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
                <div
                  className="rounded-full px-5 py-2 text-base font-black"
                  style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}
                >
                  −{Math.abs(saferData.delta_c).toFixed(1)}°C cooler
                </div>
                <div className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
              </div>

              <div className="rounded-xl p-3.5 text-sm font-medium" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                {saferData.is_meaningfully_cooler
                  ? `✓ Found a meaningfully cooler micro-zone ${saferData.distance_m}m ${saferData.direction} of your position.`
                  : `Temperature nearby is similar (${saferData.delta_c}°C variance). Conditions are uniform in this area.`}
              </div>

              {saferData.maps_url && (
                <a
                  href={saferData.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all"
                  style={{ background: '#4ade80', color: '#080b10', minHeight: 46 }}
                >
                  Take the cooler route
                  <ArrowRight className="size-4" />
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                Trigger a FortyGuard 8-direction scan to find a nearby cooler spot.
              </p>
              <button
                onClick={onFetchSafer}
                disabled={saferLoading || !isUS}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent-cyan)', color: 'var(--primary-foreground)', minHeight: 46 }}
              >
                {saferLoading ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
                Scan Nearby Cooler Spot
              </button>
            </div>
          )}

          {saferError && (
            <p className="text-xs text-center mt-3 font-semibold" style={{ color: '#ef4444' }}>{saferError}</p>
          )}
        </div>

        <HistoricalBaselineCard heatData={heatData} loading={false} />
      </div>
    </section>
  )
}

// ── HISTORICAL BASELINE ────────────────────────────────────────────
function HistoricalBaselineCard({ heatData, loading }: { heatData: HeatRiskResponse | null; loading: boolean }) {
  const currentTemp = heatData?.current.temperature ?? 0
  const avgTemp = heatData?.historical.averageTemperature ?? 0
  const diff = heatData?.historical.difference ?? 0
  const isUnusual = heatData?.historical.isUnusual ?? false

  const minTemp = Math.floor(Math.min(avgTemp - 4, currentTemp - 2))
  const maxTemp = Math.ceil(Math.max(avgTemp + 4, currentTemp + 2))
  const range = maxTemp - minTemp
  const avgPct = ((avgTemp - minTemp) / range) * 100
  const curPct = ((currentTemp - minTemp) / range) * 100

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
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Historical Baseline</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Current vs 7-day average</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skel className="h-16 w-full" />
          <Skel className="h-8 w-full" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between mb-6">
            <div>
              <div
                className="text-3xl font-mono font-black tracking-tight"
                style={{ color: diff >= 1.5 ? '#fb923c' : diff >= 0 ? '#facc15' : '#4ade80' }}
              >
                {formatDiff(diff)}
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {isUnusual
                  ? diff >= 0 ? 'Hotter than usual' : 'Cooler than usual'
                  : 'Near baseline'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-right text-xs">
              <div>
                <p className="font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>Current</p>
                <p className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>{formatTemperature(currentTemp)}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)', fontSize: 9 }}>7-Day Avg</p>
                <p className="font-mono text-base font-bold" style={{ color: 'var(--text-secondary)' }}>{formatTemperature(avgTemp)}</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div
              className="h-3 rounded-full relative overflow-hidden"
              style={{ background: 'linear-gradient(90deg, rgba(56,189,248,0.3), rgba(250,204,21,0.3), rgba(239,68,68,0.3))' }}
            >
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-3 rounded-full"
                style={{ left: `${avgPct}%`, background: 'var(--bg-base)', border: '2px solid var(--text-tertiary)' }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-4 rounded-full z-10"
                style={{
                  left: `${Math.max(0, Math.min(100, curPct))}%`,
                  backgroundColor: diff >= 1.5 ? '#fb923c' : diff >= 0 ? '#facc15' : '#4ade80',
                  border: '2px solid var(--bg-surface)',
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-bold" style={{ color: 'var(--text-tertiary)' }}>
              <span>{minTemp}°C</span>
              <span>baseline ●</span>
              <span>{maxTemp}°C</span>
            </div>
          </div>

          {heatData?.historical.message && (
            <div
              className="mt-4 rounded-xl p-3.5 text-xs font-medium"
              style={{ background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.15)', color: '#d97706' }}
            >
              {heatData.historical.message}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── RISK FACTOR BREAKDOWN ──────────────────────────────────────────
function RiskFactorsSection({ heatData, loading, riskScore, theme }: {
  heatData: HeatRiskResponse | null; loading: boolean; riskScore: number
  theme: { color: string; ringColor: string; bgColor: string }
}) {
  const { ref, inView } = useInView()

  return (
    <section
      ref={ref}
      className={`section-hidden ${inView ? 'section-visible' : ''}`}
      style={{ transitionDelay: '80ms' }}
    >
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
          Section 05
        </p>
        <h2 className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Why today's heat is different
        </h2>
      </div>

      <div className="hs-card p-6 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Temperature Severity', value: heatData?.riskFactors.temperature ?? 0, icon: Thermometer, desc: 'Thermal stress from current temperature' },
            { label: 'Historical Anomaly', value: heatData?.riskFactors.historicalGap ?? 0, icon: Activity, desc: 'Deviation from 7-day baseline' },
            { label: 'Heat Exposure Duration', value: heatData?.riskFactors.heatDuration ?? 0, icon: Sun, desc: 'Persistence of dangerous conditions' },
          ].map(({ label, value, icon: Icon, desc }) => (
            <div
              key={label}
              className="rounded-2xl p-5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <Icon className="size-4" style={{ color: 'var(--text-tertiary)' }} />
                <span
                  className="font-mono text-base font-black"
                  style={{ color: value >= 70 ? theme.ringColor : 'var(--text-primary)' }}
                >
                  {loading ? '--' : `${value}`}
                </span>
              </div>
              <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{label}</p>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-tertiary)' }}>{desc}</p>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: loading ? '0%' : inView ? `${Math.min(100, value)}%` : '0%',
                    background: value >= 70
                      ? `linear-gradient(90deg, ${theme.ringColor}70, ${theme.ringColor})`
                      : 'var(--accent-cyan)',
                    transitionDelay: '400ms',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>Combined AI Risk Score</span>
          <span className="font-mono text-xl font-black" style={{ color: theme.ringColor }}>
            {loading ? '--' : `${riskScore}/100`}
          </span>
        </div>
      </div>
    </section>
  )
}

// ── SAFETY CHECKLIST ───────────────────────────────────────────────
function SafetySection({ checkedTips, setCheckedTips }: {
  checkedTips: Record<number, boolean>
  setCheckedTips: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
}) {
  const { ref, inView } = useInView()

  const tips = [
    { icon: Droplets, title: 'Stay Hydrated', desc: 'Drink water and electrolytes regularly' },
    { icon: Sun, title: 'Avoid Direct Sunlight', desc: 'Limit prolonged exposure during peak hours' },
    { icon: Wind, title: 'Seek Cool Shade', desc: 'Take breaks in air-conditioned spaces' },
    { icon: Clock, title: 'Limit Strenuous Activity', desc: 'Avoid heavy exercise during peak heat' },
    { icon: ShieldCheck, title: 'Dress Appropriately', desc: 'Lightweight, loose, light-colored clothing' },
    { icon: Route, title: 'Check on Others', desc: 'Monitor vulnerable family members and neighbors' },
  ]

  return (
    <section
      id="safety"
      ref={ref}
      className={`section-hidden ${inView ? 'section-visible' : ''}`}
      style={{ transitionDelay: '60ms' }}
    >
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
          Section 06
        </p>
        <h2 className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Stay safe
        </h2>
      </div>

      <div className="hs-card p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Tap to mark completed
          </p>
          <Droplets className="size-5" style={{ color: 'var(--accent-cyan)' }} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tips.map(({ icon: Icon, title, desc }, idx) => {
            const isChecked = Boolean(checkedTips[idx])
            return (
              <button
                key={title}
                type="button"
                onClick={() => setCheckedTips(prev => ({ ...prev, [idx]: !prev[idx] }))}
                className="flex items-start gap-3.5 rounded-2xl p-4 text-left transition-all"
                style={{
                  background: isChecked ? 'rgba(74,222,128,0.08)' : 'var(--bg-elevated)',
                  border: isChecked ? '1px solid rgba(74,222,128,0.25)' : '1px solid var(--border-subtle)',
                  minHeight: 72,
                }}
              >
                <div
                  className="grid size-9 place-items-center rounded-xl flex-shrink-0 mt-0.5 transition-all"
                  style={{
                    background: isChecked ? 'rgba(74,222,128,0.15)' : 'var(--border-subtle)',
                  }}
                >
                  {isChecked
                    ? <CheckCircle2 className="size-5" style={{ color: '#4ade80' }} />
                    : <Icon className="size-5" style={{ color: 'var(--text-tertiary)' }} />
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {title}
                  </p>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                    {desc}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════
export function HeatShieldDashboard() {
  const geo = useGeolocation(DEFAULT_US_LOCATION.lat, DEFAULT_US_LOCATION.lon)
  const [selectedLocation, setSelectedLocation] = useState(DEFAULT_US_LOCATION)
  const [heatData, setHeatData] = useState<HeatRiskResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<'api' | 'location' | null>(null)

  const [saferData, setSaferData] = useState<NearbySaferResponse | null>(null)
  const [saferLoading, setSaferLoading] = useState(false)
  const [saferError, setSaferError] = useState<string | null>(null)

  const [checkedTips, setCheckedTips] = useState<Record<number, boolean>>({ 0: true, 1: true })

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
      .then((data) => { setHeatData(data); setLastUpdateTime(Date.now()) })
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

  const handleRequestGpsLocation = () => {
    geo.requestLocation()
    if (geo.latitude && geo.longitude) {
      if (isUSLocation(geo.latitude, geo.longitude)) {
        setSelectedLocation({ lat: geo.latitude, lon: geo.longitude, name: 'My GPS Location' })
      } else {
        setError('FortyGuard currently supports US locations only.')
        setErrorType('location')
      }
    }
  }

  const handleFetchSafer = async () => {
    if (!isSelectedLocationInUS) return
    setSaferLoading(true)
    setSaferError(null)
    try {
      const data = await getNearbySafer(selectedLocation.lat, selectedLocation.lon)
      setSaferData(data)
    } catch {
      setSaferError('Could not fetch nearby safer location. Please try again.')
    } finally {
      setSaferLoading(false)
    }
  }

  const riskLevel = heatData?.current.riskLevel ?? 'unknown'
  const riskLabel = heatData?.current.riskLabel ?? 'Analyzing…'
  const riskScore = heatData?.current.riskScore ?? 0
  const theme = getRiskTheme(riskLevel)

  if (!bootComplete) {
    return <BootOverlay phase={bootPhase} heatData={loading ? null : heatData} />
  }

  return (
    <div className="min-h-screen pb-24 md:pb-10" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', transition: 'background-color 0.25s ease, color 0.25s ease' }}>
      {/* Navbar */}
      <Navbar
        selectedCityName={selectedLocation.name}
        onSelectCity={handleSelectCity}
        onRequestGps={handleRequestGpsLocation}
      />

      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 space-y-8">

        {/* Page title bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-slide-up">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80' }}
              >
                🇺🇸 US Coverage
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
              Heat Risk Intelligence
            </h1>
            <p className="text-sm mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
              AI-powered hyper-local thermal analysis · FortyGuard API
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRequestGpsLocation}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                color: 'var(--accent-cyan)',
              }}
            >
              <Crosshair className="size-3.5" />
              Use GPS
            </button>
            <button
              onClick={fetchHeatData}
              disabled={loading}
              className="grid size-10 place-items-center rounded-xl transition-all disabled:opacity-50"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
              title="Refresh data"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Non-US warning */}
        {!isSelectedLocationInUS && (
          <div
            className="rounded-2xl p-5 animate-slide-up"
            style={{ background: 'rgba(250,204,21,0.07)', border: '1px solid rgba(250,204,21,0.2)' }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 flex-shrink-0 mt-0.5" style={{ color: '#facc15' }} />
              <div>
                <h3 className="text-sm font-bold mb-1" style={{ color: '#facc15' }}>Unsupported Location</h3>
                <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                  FortyGuard supports US locations only. Select a US city to access live heat-risk intelligence.
                </p>
                <div className="flex flex-wrap gap-2">
                  {US_PRESET_CITIES.map((city) => (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => handleSelectCity(city.lat, city.lon, city.name)}
                      className="rounded-xl px-3 py-2 text-xs font-bold transition-all"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)',
                        minHeight: 40,
                      }}
                    >
                      {city.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* API Error */}
        {error && isSelectedLocationInUS && !loading && (
          <div
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl p-4 animate-slide-up"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 flex-shrink-0" style={{ color: '#f87171' }} />
              <div>
                <p className="text-sm font-bold" style={{ color: '#f87171' }}>
                  {errorType === 'api' ? 'API Unavailable' : 'Service Error'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#f87171' }}>{error}</p>
              </div>
            </div>
            <button
              onClick={fetchHeatData}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            >
              <RefreshCw className="size-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* High heat advisory */}
        {heatData && heatData.current.riskScore >= 60 && !loading && (
          <div
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl p-5 animate-slide-up"
            style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)' }}
          >
            <div className="flex items-start gap-3">
              <div
                className="grid size-9 place-items-center rounded-full flex-shrink-0"
                style={{ background: 'rgba(251,146,60,0.15)' }}
              >
                <AlertTriangle className="size-4" style={{ color: '#fb923c' }} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: '#fb923c' }}>
                    High Heat Advisory
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c' }}
                  >
                    Risk: {heatData.current.riskScore}/100
                  </span>
                </div>
                <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {heatData.recommendation}
                </p>
              </div>
            </div>
            <a
              href="#safety"
              onClick={(e) => { e.preventDefault(); document.getElementById('safety')?.scrollIntoView({ behavior: 'smooth' }) }}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all flex-shrink-0"
              style={{
                background: 'rgba(251,146,60,0.12)',
                border: '1px solid rgba(251,146,60,0.25)',
                color: '#fb923c',
                minHeight: 40,
              }}
            >
              Safety checklist <ChevronDown className="size-3.5" />
            </a>
          </div>
        )}

        {/* SECTION 1: HERO */}
        <HeroSection
          heatData={heatData}
          loading={loading}
          riskLevel={riskLevel}
          riskScore={riskScore}
          riskLabel={riskLabel}
          selectedLocation={selectedLocation}
          elapsedDisplay={elapsedDisplay}
          bootComplete={bootComplete}
        />

        {/* SECTION 2: AI EXPLAINABILITY */}
        <AIExplainabilitySection heatData={heatData} loading={loading} />

        {/* SECTION 3 + 4: FORECAST */}
        <ForecastSection heatData={heatData} loading={loading} />

        {/* SECTION 5: MAP */}
        <MapSection
          latitude={selectedLocation.lat}
          longitude={selectedLocation.lon}
          locationName={selectedLocation.name}
          onSelect={(lat, lon) => setSelectedLocation({ lat, lon, name: `Custom Spot (${lat.toFixed(2)}, ${lon.toFixed(2)})` })}
          heatData={heatData}
          saferData={saferData}
          loading={loading}
        />

        {/* SECTION 6: COOLER PATH + HISTORICAL */}
        <CoolerPathSection
          heatData={heatData}
          saferData={saferData}
          saferLoading={saferLoading}
          saferError={saferError}
          onFetchSafer={handleFetchSafer}
          isUS={isSelectedLocationInUS}
        />

        {/* SECTION 7: RISK FACTORS */}
        <RiskFactorsSection
          heatData={heatData}
          loading={loading}
          riskScore={riskScore}
          theme={theme}
        />

        {/* SECTION 8: SAFETY CHECKLIST */}
        <SafetySection checkedTips={checkedTips} setCheckedTips={setCheckedTips} />

        {/* Footer */}
        <footer className="flex flex-col sm:flex-row justify-between gap-3 py-8 text-xs" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>
          <span className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-3.5" style={{ color: 'var(--accent-cyan)' }} />
            HeatShield AI · Powered by FortyGuard US Hyper-Local API · heatshield-risk-v1
          </span>
          <span className="font-mono">Team Nexio · Hackathon 2026</span>
        </footer>
      </main>
    </div>
  )
}
