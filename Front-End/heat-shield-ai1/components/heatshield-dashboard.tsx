'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const HeatMap = dynamic(
  () => import('@/components/heat-map').then((module) => module.HeatMap),
  { ssr: false }
)

// Default location — within the US (FortyGuard API requirement)
const DEFAULT_US_LOCATION = { lat: 40.7128, lon: -74.0060, name: 'New York City, NY' }

// ── BOOT SEQUENCE PHASES ───────────────────────────────────────────
const BOOT_PHASES = [
  { id: 0, delay: 0,    label: 'Scanning local thermal conditions…' },
  { id: 1, delay: 400,  label: 'Reading current temperature…' },
  { id: 2, delay: 750,  label: 'Detecting historical anomaly…' },
  { id: 3, delay: 1050, label: 'Analyzing forecast peak window…' },
  { id: 4, delay: 1300, label: 'Computing AI risk score…' },
  { id: 5, delay: 1600, label: 'ANALYSIS COMPLETE' },
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

// ── HOOKS ──────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 800, enabled = true): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled) { setValue(0); return }
    const start = performance.now()
    const from = 0
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(from + (target - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration, enabled])

  return value
}

function useElapsedSeconds(): number {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return secs
}

// ── RISK BADGE (uses getRiskTheme) ─────────────────────────────────
function RiskBadge({ level, children }: { level: string; children: React.ReactNode }) {
  const theme = getRiskTheme(level)
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold border"
      style={{
        color: theme.color,
        backgroundColor: `${theme.bgColor}18`,
        borderColor: `${theme.borderColor}50`,
      }}
    >
      {children}
    </span>
  )
}

// ── ANIMATED RISK RING ─────────────────────────────────────────────
function RiskRing({ score, level, animated }: { score: number; level: string; animated: boolean }) {
  const displayScore = useCountUp(score, 900, animated)
  const ringPct = animated ? (displayScore / 100) * 100 : 0
  const theme = getRiskTheme(level)

  return (
    <div
      className="relative grid place-items-center rounded-full transition-all duration-700 size-36 sm:size-40"
      style={{
        background: `conic-gradient(${theme.ringColor} 0 ${ringPct}%, rgba(255,255,255,0.15) ${ringPct}% 100%)`,
        boxShadow: animated && score > 30 ? theme.glow : 'none',
      }}
    >
      <div
        className="grid place-items-center rounded-full shadow-inner size-28 sm:size-32"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      >
        <div className="text-center">
          <div
            className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight"
            style={{ color: theme.ringColor }}
          >
            {displayScore}
          </div>
          <div className="text-[9px] font-extrabold text-white/60 uppercase tracking-widest mt-0.5">
            Risk / 100
          </div>
        </div>
      </div>
    </div>
  )
}

// ── LIVE STATUS INDICATOR ──────────────────────────────────────────
function LiveStatus({
  dataSource,
  elapsed,
  confidence,
}: {
  dataSource: string
  elapsed: number
  confidence: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/70 font-bold">
      <span className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
        LIVE ANALYSIS
      </span>
      <span className="text-white/40">·</span>
      <span>Updated {elapsed}s ago</span>
      <span className="text-white/40">·</span>
      <span className="text-white/80">FortyGuard</span>
      {dataSource === 'MOCK_DETERMINISTIC' && (
        <>
          <span className="text-white/40">·</span>
          <span className="text-amber-300/80">Demo Data</span>
        </>
      )}
      {confidence > 0 && (
        <>
          <span className="text-white/40">·</span>
          <span className="text-emerald-300/80">Confidence {confidence}%</span>
        </>
      )}
    </div>
  )
}

// ── CINEMATIC BOOT OVERLAY ─────────────────────────────────────────
function BootOverlay({
  phase,
  heatData,
}: {
  phase: number
  heatData: HeatRiskResponse | null
}) {
  const temp = heatData?.current.temperature
  const diff = heatData?.historical.difference
  const peakTemp = heatData?.peak.temperature
  const score = heatData?.current.riskScore ?? 0
  const level = heatData?.current.riskLabel ?? 'Analyzing…'
  const theme = getRiskTheme(heatData?.current.riskLevel ?? 'unknown')

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a] transition-all">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-12 animate-boot" style={{ animationDelay: '0s' }}>
        <div className="grid size-12 place-items-center rounded-2xl bg-white text-black shadow-lg">
          <ShieldCheck className="size-7" />
        </div>
        <div>
          <p className="text-2xl font-extrabold text-white tracking-tight">HeatShield</p>
          <p className="text-xs text-white/50 font-bold uppercase tracking-widest">Heat Intelligence</p>
        </div>
      </div>

      {/* Phase lines */}
      <div className="space-y-3 text-center min-h-[160px]">
        {phase >= 0 && (
          <p className="text-sm text-white/60 font-mono animate-boot" style={{ animationDelay: '0.1s' }}>
            {BOOT_PHASES[Math.min(phase, BOOT_PHASES.length - 1)].label}
          </p>
        )}

        {phase >= 1 && temp !== undefined && (
          <div className="animate-boot" style={{ animationDelay: '0.05s' }}>
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold">Current</p>
            <p className="text-4xl font-mono font-extrabold text-white mt-1">{formatTemperature(temp)}</p>
          </div>
        )}

        {phase >= 2 && diff !== undefined && (
          <div className="animate-boot" style={{ animationDelay: '0.05s' }}>
            <p className="text-sm font-bold" style={{ color: diff >= 0 ? '#f97316' : '#22c55e' }}>
              Historical anomaly: {formatDiff(diff)} above baseline
            </p>
          </div>
        )}

        {phase >= 3 && peakTemp !== undefined && (
          <div className="animate-boot" style={{ animationDelay: '0.05s' }}>
            <p className="text-sm text-white/70 font-bold">
              Forecast peak: <span className="text-orange-400">{formatTemperature(peakTemp)}</span>{' '}
              at <span className="text-orange-400">{heatData?.peak.time}</span>
            </p>
          </div>
        )}

        {phase >= 4 && score > 0 && (
          <div className="animate-boot mt-4" style={{ animationDelay: '0.05s' }}>
            <div
              className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl border-2 font-extrabold text-lg"
              style={{
                color: theme.ringColor,
                borderColor: theme.ringColor,
                backgroundColor: `${theme.bgColor}15`,
              }}
            >
              {theme.icon} {level.toUpperCase()} · {score}/100
            </div>
          </div>
        )}

        {phase >= 5 && (
          <div className="animate-boot mt-2" style={{ animationDelay: '0.05s' }}>
            <p className="text-xs text-white/40 font-bold uppercase tracking-widest">AI Action Plan Ready ↓</p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-10 w-48 h-0.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-orange-500 transition-all duration-300"
          style={{ width: `${(phase / (BOOT_PHASES.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  )
}

// ── AI EXPLAINABILITY CARD ─────────────────────────────────────────
function AIExplainabilityCard({ heatData, loading }: { heatData: HeatRiskResponse | null; loading: boolean }) {
  const theme = getRiskTheme(heatData?.current.riskLevel ?? 'unknown')
  const score = heatData?.current.riskScore ?? 0
  const label = heatData?.current.riskLabel ?? '—'
  const explain = heatData?.explainability
  const factors = heatData?.riskFactors

  const bars = [
    {
      label: 'Temperature Severity',
      value: factors?.temperature ?? 0,
      icon: Thermometer,
      desc: 'Current thermal stress level',
    },
    {
      label: 'Historical Anomaly',
      value: factors?.historicalGap ?? 0,
      icon: TrendingUp,
      desc: 'How unusual today is vs baseline',
    },
    {
      label: 'Heat Exposure Duration',
      value: factors?.heatDuration ?? 0,
      icon: Clock,
      desc: 'Persistence of high-risk conditions',
    },
  ]

  return (
    <Card className="border-border/80 shadow-xs overflow-hidden animate-slide-up stagger-2">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div
              className="grid size-11 place-items-center rounded-2xl"
              style={{ backgroundColor: `${theme.bgColor}18` }}
            >
              <BrainCircuit className="size-6" style={{ color: theme.color }} />
            </div>
            <div>
              <CardTitle className="text-base font-extrabold">
                Why is the risk{' '}
                <span style={{ color: theme.color }}>
                  {label}?
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                heatshield-risk-v1 · Explainable AI analysis
              </p>
            </div>
          </div>
          {!loading && explain && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: theme.color }}
              />
              Confidence {explain.confidence}%
              <button
                title="Confidence reflects completeness of available data, not prediction accuracy."
                className="text-muted-foreground/60 hover:text-muted-foreground"
              >
                <Info className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* Factor bars */}
            <div className="space-y-4">
              {bars.map(({ label: barLabel, value, icon: Icon, desc }) => (
                <div key={barLabel}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className="size-3.5 text-muted-foreground" />
                      <span className="text-xs font-bold text-foreground">{barLabel}</span>
                    </div>
                    <span className="font-mono text-sm font-extrabold" style={{ color: theme.color }}>
                      {value}/100
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${Math.min(100, value)}%`,
                        background: `linear-gradient(90deg, ${theme.bgColor}99, ${theme.ringColor})`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{desc}</p>
                </div>
              ))}
            </div>

            {/* Top drivers */}
            {explain && explain.topDrivers.length > 0 && (
              <div
                className="mt-5 rounded-2xl p-4 border"
                style={{
                  backgroundColor: `${theme.bgColor}08`,
                  borderColor: `${theme.borderColor}30`,
                }}
              >
                <p className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground mb-3">
                  AI Detected {explain.topDrivers.length} Key Drivers
                </p>
                <div className="space-y-2">
                  {explain.topDrivers.slice(0, 3).map((driver, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span
                        className="flex-shrink-0 grid size-5 place-items-center rounded-full text-[9px] font-extrabold text-white mt-0.5"
                        style={{ backgroundColor: theme.ringColor }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-xs font-semibold text-foreground leading-snug">{driver}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Score summary */}
            <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
              <span className="text-xs text-muted-foreground font-semibold">
                Combined AI Risk Score
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold border"
                  style={{
                    color: theme.color,
                    backgroundColor: `${theme.bgColor}15`,
                    borderColor: `${theme.borderColor}40`,
                  }}
                >
                  {theme.icon} {label}
                </span>
                <span className="font-mono text-lg font-extrabold text-foreground">{score}/100</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── HEAT CLOCK / ACTION WINDOW ─────────────────────────────────────
function HeatClockCard({ heatData, loading }: { heatData: HeatRiskResponse | null; loading: boolean }) {
  const forecast = heatData?.forecast ?? []
  const peak = heatData?.peak
  const nowTime = forecast[0]?.time ?? '--:--'
  const peakTime = peak?.time ?? '--:--'
  const windowStart = peak?.windowStart ?? '--:--'
  const windowEnd = peak?.windowEnd ?? '--:--'

  // Find best (lowest risk) window from forecast
  const bestHours = useMemo(() => {
    if (!forecast.length) return { start: '--:--', end: '--:--' }
    const lowHours = forecast.filter((h) => h.level === 'low' || h.level === 'moderate')
    if (!lowHours.length) return { start: '--:--', end: '--:--' }
    return { start: lowHours[0].time, end: lowHours[lowHours.length - 1].time }
  }, [forecast])

  return (
    <Card className="border-border/80 shadow-xs animate-slide-up stagger-3">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-extrabold flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            Today's Heat Window
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-extrabold border-primary/30 text-primary">
            12h Outlook
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-8 w-3/4 rounded-xl" />
          </div>
        ) : (
          <>
            {/* Horizontal timeline track */}
            <div className="relative mb-4">
              <div className="h-3 rounded-full overflow-hidden flex">
                {forecast.slice(0, 12).map((h, i) => {
                  const theme = getRiskTheme(h.level)
                  return (
                    <div
                      key={i}
                      className="flex-1 transition-all"
                      style={{ backgroundColor: `${theme.ringColor}cc` }}
                      title={`${h.time}: ${h.label}`}
                    />
                  )
                })}
              </div>
              {/* NOW marker */}
              <div className="absolute top-0 left-0 -translate-x-1/2 flex flex-col items-center">
                <div className="w-0.5 h-3 bg-foreground/80 rounded-full" />
              </div>
            </div>

            {/* Time labels */}
            <div className="flex justify-between text-[10px] font-bold text-muted-foreground mb-4">
              <span>NOW<br />{nowTime}</span>
              <span className="text-center">
                <span className="text-orange-500">PEAK</span><br />
                {peakTime}
              </span>
              <span className="text-right">+12h</span>
            </div>

            {/* Key windows */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3">
                <p className="text-[10px] uppercase font-extrabold text-red-600 dark:text-red-400 mb-1">⚠ Avoid Window</p>
                <p className="font-mono text-sm font-extrabold text-foreground">
                  {windowStart !== '--:--' ? `${windowStart} – ${windowEnd}` : 'No danger window'}
                </p>
              </div>
              <div className="rounded-xl bg-green-500/10 border border-green-500/25 p-3">
                <p className="text-[10px] uppercase font-extrabold text-green-600 dark:text-green-400 mb-1">✓ Best Window</p>
                <p className="font-mono text-sm font-extrabold text-foreground">
                  {bestHours.start !== '--:--' ? `${bestHours.start} – ${bestHours.end}` : 'Conditions elevated'}
                </p>
              </div>
            </div>

            {peak && peak.temperature > 0 && (
              <div className="mt-3 rounded-xl bg-orange-500/10 border border-orange-500/25 p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-extrabold text-orange-600 mb-0.5">Peak Forecast</p>
                  <p className="text-sm font-extrabold text-foreground">
                    {formatTemperature(peak.temperature)} at {peak.time}
                  </p>
                </div>
                <span className="text-2xl">🌡️</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── TODAY'S HEAT STORY ─────────────────────────────────────────────
function HeatStoryCard({ heatData, loading }: { heatData: HeatRiskResponse | null; loading: boolean }) {
  const story = useMemo(() => {
    if (!heatData) return null
    const { current, historical, peak, persistenceDetail } = heatData
    const diff = historical.difference
    const diffStr = diff >= 0 ? `+${diff.toFixed(1)}°C above` : `${Math.abs(diff).toFixed(1)}°C below`
    const consecutiveHours = persistenceDetail.longestContinuousHighRiskHours
    const theme = getRiskTheme(current.riskLevel)

    let openingLine = 'Conditions are elevated.'
    if (current.riskScore >= 80) openingLine = 'Heat is at a critical level.'
    else if (current.riskScore >= 60) openingLine = 'Heat is building rapidly.'
    else if (current.riskScore >= 40) openingLine = 'Conditions are moderately elevated.'
    else openingLine = 'Conditions are within safe range.'

    const anomalyLine = historical.isUnusual
      ? `This location is ${diffStr} its historical baseline — an unusual reading.`
      : `Temperature is ${diffStr} its 7-day baseline.`

    const peakLine = peak.temperature > 0
      ? `Temperatures are expected to peak at ${formatTemperature(peak.temperature)} around ${peak.time}.`
      : ''

    const persistLine = consecutiveHours > 1
      ? `High-or-above conditions may persist for ${consecutiveHours} consecutive hours.`
      : ''

    return { openingLine, anomalyLine, peakLine, persistLine, theme, riskLabel: current.riskLabel }
  }, [heatData])

  return (
    <Card className="border-border/80 shadow-xs animate-slide-up stagger-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-extrabold flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          Today's Heat Story
        </CardTitle>
        <p className="text-xs text-muted-foreground">AI-generated narrative from live data</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : story ? (
          <div
            className="rounded-2xl p-4 border"
            style={{
              backgroundColor: `${story.theme.bgColor}08`,
              borderColor: `${story.theme.borderColor}25`,
            }}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5 flex-shrink-0">{story.theme.icon}</span>
              <div className="space-y-1.5 text-sm text-foreground leading-relaxed">
                <p>
                  <strong>{story.openingLine}</strong> Current conditions are{' '}
                  <strong style={{ color: story.theme.color }}>{story.riskLabel}</strong>.{' '}
                  {story.anomalyLine}
                </p>
                {story.peakLine && <p>{story.peakLine}</p>}
                {story.persistLine && (
                  <p className="font-semibold" style={{ color: story.theme.color }}>
                    {story.persistLine}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No data available.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ── HISTORICAL BASELINE VISUAL ─────────────────────────────────────
function HistoricalBaselineCard({ heatData, loading }: { heatData: HeatRiskResponse | null; loading: boolean }) {
  const currentTemp = heatData?.current.temperature ?? 0
  const avgTemp = heatData?.historical.averageTemperature ?? 0
  const diff = heatData?.historical.difference ?? 0
  const isUnusual = heatData?.historical.isUnusual ?? false

  // Build a visual bar range
  const minTemp = Math.floor(Math.min(avgTemp - 4, currentTemp - 2))
  const maxTemp = Math.ceil(Math.max(avgTemp + 4, currentTemp + 2))
  const range = maxTemp - minTemp
  const avgPct = ((avgTemp - minTemp) / range) * 100
  const curPct = ((currentTemp - minTemp) / range) * 100

  return (
    <Card className="border-border/80 shadow-xs animate-slide-up stagger-5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-extrabold">Historical Baseline</CardTitle>
        <p className="text-xs text-muted-foreground">Current vs 7-day average for this spot</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <>
            {/* Big delta display */}
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="text-3xl font-mono font-extrabold"
                  style={{ color: diff >= 1.5 ? '#ea580c' : diff >= 0 ? '#ca8a04' : '#16a34a' }}
                >
                  {formatDiff(diff)}
                </div>
                <p className="text-xs font-bold text-muted-foreground mt-0.5">
                  {isUnusual
                    ? diff >= 0 ? 'HOTTER THAN USUAL' : 'COOLER THAN USUAL'
                    : 'NEAR BASELINE'}
                </p>
              </div>
              <div className="text-right">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-muted-foreground font-semibold">Current</p>
                    <p className="font-mono text-base font-extrabold text-foreground">
                      {formatTemperature(currentTemp)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-semibold">7-Day Avg</p>
                    <p className="font-mono text-base font-extrabold text-muted-foreground">
                      {formatTemperature(avgTemp)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual range bar */}
            <div className="relative">
              <div className="h-3 rounded-full bg-gradient-to-r from-blue-400/30 via-yellow-400/30 to-red-500/30 relative">
                {/* Baseline marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-3 rounded-full bg-muted-foreground border-2 border-background shadow"
                  style={{ left: `${avgPct}%` }}
                  title={`7-day avg: ${formatTemperature(avgTemp)}`}
                />
                {/* Current temp marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-4 rounded-full border-2 border-background shadow-md z-10"
                  style={{
                    left: `${Math.max(0, Math.min(100, curPct))}%`,
                    backgroundColor: diff >= 1.5 ? '#f97316' : diff >= 0 ? '#eab308' : '#22c55e',
                  }}
                  title={`Current: ${formatTemperature(currentTemp)}`}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground font-bold mt-1.5">
                <span>{minTemp}°C</span>
                <span className="text-muted-foreground/70">baseline ●</span>
                <span>{maxTemp}°C</span>
              </div>
            </div>

            {/* Message */}
            {heatData?.historical.message && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs font-semibold text-amber-900 dark:text-amber-200">
                {heatData.historical.message}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── FORECAST CHART with RISK BANDS ────────────────────────────────
function ForecastChart({ heatData, loading }: { heatData: HeatRiskResponse | null; loading: boolean }) {
  const forecast = heatData?.forecast ?? []
  const peak = heatData?.peak
  const peakTime = peak?.time
  const windowStart = peak?.windowStart
  const windowEnd = peak?.windowEnd

  // Build chart data with risk per hour for tooltip
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

  // Compute consecutive high-risk hour count for tooltip enrichment
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

  // Temperature domain
  const temps = chartData.map((d) => d.temp)
  const minT = Math.max(0, Math.floor(Math.min(...temps) - 3))
  const maxT = Math.ceil(Math.max(...temps) + 3)

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{value: number; payload: typeof chartData[0]}>; label?: string }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    const theme = getRiskTheme(d.level)
    const consecutive = consecutiveByTime[d.time]
    return (
      <div className="bg-popover border border-border rounded-xl shadow-xl p-3 text-xs min-w-[140px]">
        <p className="font-mono font-extrabold text-foreground mb-1">{d.time}</p>
        <p className="font-bold text-foreground">{d.temp.toFixed(1)}°C</p>
        <p className="font-bold mt-0.5" style={{ color: theme.color }}>
          {theme.icon} {d.label}
        </p>
        {consecutive > 1 && (
          <p className="text-muted-foreground mt-1">
            {consecutive}
            {consecutive === 1 ? 'st' : consecutive === 2 ? 'nd' : consecutive === 3 ? 'rd' : 'th'} consecutive high-risk hour
          </p>
        )}
      </div>
    )
  }

  return (
    <Card className="border-border/80 shadow-xs animate-slide-up stagger-3">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-extrabold">12-Hour Heat Risk Forecast</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Temperature line over risk-level background bands
          </p>
        </div>
        {peak && peak.temperature > 0 && (
          <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 text-right">
            <p className="text-[10px] uppercase font-extrabold text-orange-600 dark:text-orange-400">Peak</p>
            <p className="font-mono text-sm font-extrabold text-foreground">
              {peak.temperature}°C
              <span className="font-sans font-normal text-xs text-muted-foreground">
                {peak.time ? ` at ${peak.time}` : ''}
              </span>
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[260px] w-full rounded-2xl" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ left: -16, right: 8, top: 16, bottom: 4 }}>
                <defs>
                  <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                {/* Risk background bands */}
                {TEMP_RISK_BANDS.map((band) => (
                  <ReferenceArea
                    key={band.label}
                    yAxisId="temp"
                    y1={Math.max(minT, band.tempMin)}
                    y2={Math.min(maxT, band.tempMax)}
                    fill={band.color}
                    fillOpacity={0.08}
                    ifOverflow="visible"
                  />
                ))}

                {/* Danger window shade */}
                {windowStart && windowEnd && windowStart !== '--:--' && (
                  <ReferenceArea
                    yAxisId="temp"
                    x1={windowStart}
                    x2={windowEnd}
                    fill="#ef4444"
                    fillOpacity={0.07}
                    strokeWidth={0}
                  />
                )}

                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  interval={1}
                />
                <YAxis
                  yAxisId="temp"
                  domain={[minT, maxT]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}°`}
                  fontSize={11}
                />

                {/* NOW vertical line */}
                {chartData[0] && (
                  <ReferenceLine
                    yAxisId="temp"
                    x={chartData[0].time}
                    stroke="var(--foreground)"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    label={{ value: 'NOW', position: 'insideTopRight', fontSize: 9, fontWeight: 800, fill: 'var(--foreground)' }}
                  />
                )}

                {/* PEAK vertical line */}
                {peakTime && peakTime !== '--:--' && (
                  <ReferenceLine
                    yAxisId="temp"
                    x={peakTime}
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    label={{ value: 'PEAK', position: 'insideTopRight', fontSize: 9, fontWeight: 800, fill: '#f97316' }}
                  />
                )}

                <Tooltip content={<CustomTooltip />} />

                <Area
                  yAxisId="temp"
                  type="monotone"
                  dataKey="temp"
                  stroke="#f97316"
                  fill="url(#tempGradient)"
                  strokeWidth={3}
                  dot={{ r: 3, fill: '#f97316', strokeWidth: 2, stroke: 'var(--card)' }}
                  activeDot={{ r: 5, fill: '#f97316', strokeWidth: 2, stroke: 'white' }}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-bold text-muted-foreground border-t border-border/50 pt-3">
              {TEMP_RISK_BANDS.map((band) => (
                <span key={band.label} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: band.color, opacity: 0.7 }} />
                  {band.label} ({band.tempMin}–{band.tempMax}°C)
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── MAP PANEL ─────────────────────────────────────────────────────
function MapPanel({
  latitude,
  longitude,
  locationName,
  onSelect,
  heatData,
  saferData,
  loading,
}: {
  latitude: number
  longitude: number
  locationName: string
  onSelect: (latitude: number, longitude: number) => void
  heatData: HeatRiskResponse | null
  saferData: NearbySaferResponse | null
  loading: boolean
}) {
  const summary = heatData?.current
  const peak = heatData?.peak
  const score = summary?.riskScore ?? 0
  const level = summary?.riskLevel ?? 'unknown'
  const theme = getRiskTheme(level)

  return (
    <Card className="overflow-hidden border-border/80 shadow-xs animate-slide-up stagger-4">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-lg font-extrabold flex items-center gap-2">
            <Compass className="size-5 text-primary" />
            US Thermal Intelligence Map
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            📍 Live location marker · Estimated thermal visualization
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.dispatchEvent(new Event('heatshield-recenter'))}
          className="h-9 gap-1.5 text-xs font-bold"
        >
          <Crosshair className="size-4" />
          Recenter
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div
          className="relative min-h-[320px] sm:min-h-[380px] overflow-hidden rounded-2xl border border-border/60 shadow-inner"
          aria-label="Live map showing your current location and estimated temperature zones"
        >
          <HeatMap
            latitude={latitude}
            longitude={longitude}
            currentTemp={summary?.temperature}
            saferTemp={saferData?.safer_temp_c}
            riskLevel={level}
            onSelect={onSelect}
          />
        </div>
        <div className="flex flex-col justify-between rounded-2xl bg-muted/50 p-5 border border-border/60">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-foreground">{locationName}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {latitude.toFixed(4)}, {longitude.toFixed(4)}
                </p>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-20 rounded-full" />
              ) : (
                <RiskBadge level={level}>{summary?.riskLabel ?? 'Unknown'}</RiskBadge>
              )}
            </div>

            <div className="my-5 flex items-baseline gap-2">
              {loading ? (
                <Skeleton className="h-12 w-28" />
              ) : (
                <span className="font-mono text-5xl font-extrabold tracking-tight text-foreground">
                  {summary ? formatTemperature(summary.temperature) : '--'}
                </span>
              )}
              <span className="text-xs text-muted-foreground font-bold">current</span>
            </div>

            <div className="grid grid-cols-2 gap-3 border-y border-border/60 py-3 text-xs">
              <div>
                <p className="text-muted-foreground font-semibold">Risk Score</p>
                {loading ? (
                  <Skeleton className="h-5 w-12 mt-1" />
                ) : (
                  <p className="mt-0.5 font-mono font-extrabold text-base" style={{ color: theme.color }}>
                    {score}/100
                  </p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground font-semibold">Peak Today</p>
                {loading ? (
                  <Skeleton className="h-5 w-16 mt-1" />
                ) : (
                  <p className="mt-0.5 font-mono font-extrabold text-foreground text-base">
                    {peak ? `${peak.temperature}°C` : '--'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <a
            href="#safer-location"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('safer-location')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 text-xs font-bold shadow-xs hover:opacity-90 transition min-h-[44px]"
          >
            <Navigation className="size-4" />
            Find Cooler Path
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

// ── COOLER PATH WOW CARD ───────────────────────────────────────────
function CoolerPathCard({
  heatData,
  saferData,
  saferLoading,
  saferError,
  onFetchSafer,
  isUS,
}: {
  heatData: HeatRiskResponse | null
  saferData: NearbySaferResponse | null
  saferLoading: boolean
  saferError: string | null
  onFetchSafer: () => void
  isUS: boolean
}) {
  const currentTemp = heatData?.current.temperature ?? 0

  return (
    <Card className="border-border/80 shadow-xs animate-slide-up stagger-5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-extrabold">
          <Navigation className="size-5 text-primary" />
          Find Cooler Path
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          FortyGuard 8-direction sampling — find a nearby cooler micro-zone
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {saferLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : saferData ? (
          <div className="space-y-4 animate-fade-in">
            {/* Comparison display */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-center">
                <p className="text-[10px] uppercase font-extrabold text-muted-foreground mb-2">Current</p>
                <p className="font-mono text-3xl font-extrabold text-foreground">
                  {formatTemperature(currentTemp)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Your location</p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center relative overflow-hidden">
                <p className="text-[10px] uppercase font-extrabold text-emerald-600 dark:text-emerald-400 mb-2">
                  Cooler Nearby
                </p>
                <p className="font-mono text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">
                  {formatTemperature(saferData.safer_temp_c)}
                </p>
                <p className="text-[10px] text-emerald-600/80 mt-1">
                  {saferData.distance_m}m {saferData.direction}
                </p>
              </div>
            </div>

            {/* Delta badge */}
            <div className="flex items-center justify-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <div className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-4 py-1.5 text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                −{Math.abs(saferData.delta_c).toFixed(1)}°C cooler · {saferData.distance_m}m {saferData.direction}
              </div>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            {/* Message */}
            <div className="rounded-xl bg-muted/50 p-3.5 text-xs font-semibold text-foreground border border-border/60">
              {saferData.is_meaningfully_cooler
                ? `✓ Found a meaningfully cooler micro-zone ${saferData.distance_m}m ${saferData.direction} of your position.`
                : `Temperature nearby is similar (${saferData.delta_c}°C variance). Conditions are uniform in this area.`}
            </div>

            {/* CTA */}
            {saferData.maps_url && (
              <a
                href={saferData.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-3 text-xs font-extrabold shadow-xs hover:bg-emerald-700 transition min-h-[44px]"
              >
                Take the cooler route
                <ArrowRight className="size-4" />
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        ) : (
          <div className="py-3 text-center">
            <p className="text-xs text-muted-foreground mb-5">
              Trigger a FortyGuard 8-direction scan to find a nearby cooler spot.
            </p>
            <Button
              onClick={onFetchSafer}
              disabled={saferLoading || !isUS}
              className="w-full gap-2 text-xs font-extrabold min-h-[44px] rounded-xl"
            >
              {saferLoading ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
              Scan Nearby Cooler Spot
            </Button>
          </div>
        )}
        {saferError && (
          <p className="text-xs text-destructive text-center font-bold">{saferError}</p>
        )}
      </CardContent>
    </Card>
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

  // Safer nearby state
  const [saferData, setSaferData] = useState<NearbySaferResponse | null>(null)
  const [saferLoading, setSaferLoading] = useState(false)
  const [saferError, setSaferError] = useState<string | null>(null)

  // Checklist state
  const [checkedTips, setCheckedTips] = useState<Record<number, boolean>>({ 0: true, 1: true })

  // Boot sequence (only plays once on mount)
  const [bootPhase, setBootPhase] = useState<number>(-1)
  const [bootComplete, setBootComplete] = useState(false)
  const hasBooted = useRef(false)

  // Live status timer (resets on data load)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const elapsed = useRef(0)
  const [elapsedDisplay, setElapsedDisplay] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedDisplay(Math.round((Date.now() - lastUpdateTime) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [lastUpdateTime])

  // US validation
  const isSelectedLocationInUS = useMemo(
    () => isUSLocation(selectedLocation.lat, selectedLocation.lon),
    [selectedLocation.lat, selectedLocation.lon]
  )

  // ── FETCH ──────────────────────────────────────────────────────
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
        console.error('HeatRisk request failed', err)
        setHeatData(null)
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Unable to reach HeatShield API. Please ensure the server is running on localhost:8000.'
        )
        setErrorType('api')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [selectedLocation.lat, selectedLocation.lon])

  // ── BOOT SEQUENCE ──────────────────────────────────────────────
  useEffect(() => {
    if (hasBooted.current) return
    hasBooted.current = true

    // Start boot phases
    BOOT_PHASES.forEach((phase) => {
      setTimeout(() => setBootPhase(phase.id), phase.delay)
    })
    // Complete boot after all phases
    setTimeout(() => setBootComplete(true), 2100)
  }, [])

  useEffect(() => {
    fetchHeatData()
  }, [fetchHeatData])

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
    } catch (err: unknown) {
      console.error('NearbySafer request failed', err)
      setSaferError('Could not fetch nearby safer location. Please try again.')
    } finally {
      setSaferLoading(false)
    }
  }

  // Derived values
  const riskLevel = heatData?.current.riskLevel ?? 'unknown'
  const riskLabel = heatData?.current.riskLabel ?? 'Analyzing…'
  const riskScore = heatData?.current.riskScore ?? 0
  const theme = getRiskTheme(riskLevel)

  // Animated score (only after boot)
  const animatedScore = useCountUp(riskScore, 900, bootComplete && !loading)

  // Location alert (high+ risk)
  const locationAlert = useMemo(() => {
    if (!heatData || heatData.current.riskScore < 60) return null
    return {
      level: heatData.current.riskLevel,
      label: heatData.current.riskLabel,
      score: heatData.current.riskScore,
      message: heatData.recommendation,
    }
  }, [heatData])

  // Hourly timeline for side panel
  const timeline = useMemo(() => {
    if (!heatData?.forecast?.length) return [] as Array<[string, string, string]>
    return heatData.forecast.slice(0, 7).map((item) => [
      item.time,
      item.label,
      item.level,
    ]) as Array<[string, string, string]>
  }, [heatData])

  const safetyTips = [
    'Stay hydrated with water and electrolyte drinks',
    'Avoid prolonged direct sunlight exposure',
    'Take regular breaks in cool shaded areas',
    'Limit strenuous activity during peak heat hours',
    'Wear lightweight, loose-fitting, light-colored clothing',
    'Check on vulnerable family members and neighbors',
  ]

  // ── RENDER ─────────────────────────────────────────────────────
  // Show boot overlay until boot is complete
  if (!bootComplete) {
    return <BootOverlay phase={bootPhase} heatData={loading ? null : heatData} />
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 md:pb-8">
      {/* Sticky Top Navbar */}
      <Navbar
        selectedCityName={selectedLocation.name}
        onSelectCity={handleSelectCity}
        onRequestGps={handleRequestGpsLocation}
      />

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 space-y-6">

        {/* ── PAGE HEADER ──────────────────────────────────────── */}
        <div className="flex flex-col justify-between gap-3 border-b border-border/50 pb-5 animate-slide-up stagger-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-bold text-[11px] px-2.5 py-0.5">
              🇺🇸 US Coverage
            </Badge>
            <span className="text-xs font-semibold text-muted-foreground">
              FortyGuard Hyper-Local Temperature API
            </span>
            {heatData && (
              <Badge
                variant="outline"
                className="text-[11px] font-bold border-orange-500/30 text-orange-600 dark:text-orange-400"
              >
                {heatData.dataSource === 'MOCK_DETERMINISTIC' ? '⚙ Demo Data' : '📡 Live Data'}
              </Badge>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                Heat Risk Intelligence
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground font-medium">
                Real-time thermal analysis · AI risk scoring · Safety intelligence for every outdoor decision.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleRequestGpsLocation}
                className="gap-2 font-bold text-xs h-10 rounded-xl"
              >
                <Crosshair className="size-4 text-primary" />
                Use GPS Location
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchHeatData}
                className="h-10 w-10 rounded-xl"
                title="Refresh data"
                disabled={loading}
              >
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* ── NON-US WARNING ────────────────────────────────────── */}
        {!isSelectedLocationInUS && (
          <div className="rounded-2xl border-2 border-amber-500/50 bg-amber-500/10 p-5 text-amber-950 dark:text-amber-50 shadow-md animate-slide-up">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-3">
                <div>
                  <h3 className="font-extrabold text-base">Unsupported Location</h3>
                  <p className="text-xs text-amber-900/90 dark:text-amber-100/90 mt-1 leading-relaxed">
                    FortyGuard currently supports US locations only. Select a US city to access live heat-risk intelligence.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {US_PRESET_CITIES.map((city) => (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => handleSelectCity(city.lat, city.lon, city.name)}
                      className="rounded-xl border border-amber-600/30 bg-background/80 px-3 py-2 text-xs font-bold text-foreground transition hover:bg-background shadow-xs min-h-[44px]"
                    >
                      📍 {city.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── API ERROR BANNER ─────────────────────────────────── */}
        {error && isSelectedLocationInUS && !loading && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-destructive flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs animate-slide-up">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 shrink-0" />
              <div>
                <p className="font-extrabold text-xs sm:text-sm">
                  {errorType === 'api' ? 'API Unavailable' : 'Service Error'}
                </p>
                <p className="text-xs mt-0.5 text-destructive/90">{error}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHeatData}
              className="border-destructive/30 hover:bg-destructive/20 text-xs font-bold h-9"
            >
              <RefreshCw className="size-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        )}

        {/* ── HIGH HEAT ADVISORY ───────────────────────────────── */}
        {locationAlert && !loading && (
          <div className="overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-950 shadow-xs dark:text-amber-50 animate-slide-up">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-9 place-items-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-200 shrink-0">
                  <AlertTriangle className="size-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-100">
                      High Heat Advisory
                    </span>
                    <span className="rounded-full bg-amber-500/20 text-amber-900 border border-amber-500/30 text-[10px] px-2 py-0 font-bold">
                      Risk: {locationAlert.score}/100
                    </span>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm font-medium leading-relaxed text-amber-900 dark:text-amber-50">
                    {locationAlert.message}
                  </p>
                </div>
              </div>
              <a
                href="#safety"
                onClick={(e) => { e.preventDefault(); document.getElementById('safety')?.scrollIntoView({ behavior: 'smooth' }) }}
                className="inline-flex items-center justify-center rounded-xl border border-amber-700/30 bg-background/40 px-4 py-2.5 text-xs font-extrabold text-amber-900 transition hover:bg-background/60 dark:text-amber-50 shrink-0 min-h-[44px]"
              >
                Safety checklist ↓
              </a>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
             SECTION 1: HERO — RISK COCKPIT
        ══════════════════════════════════════════════════════════ */}
        <section id="dashboard" className="scroll-mt-20 animate-slide-up stagger-1">
          <div className="overflow-hidden rounded-3xl bg-primary text-primary-foreground shadow-2xl relative min-h-[380px]">
            {/* Decorative ring */}
            <div className="absolute -right-32 -top-32 size-80 rounded-full border border-primary-foreground/8 pointer-events-none" />
            <div className="absolute -right-16 -top-16 size-48 rounded-full border border-primary-foreground/5 pointer-events-none" />

            <div className="relative z-10 p-6 sm:p-8 flex flex-col gap-6">
              {/* Top row: location + live status + level badge */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-primary-foreground/70 mb-1">
                    <MapPin className="size-3.5" />
                    {selectedLocation.name}
                  </div>
                  <p className="font-mono text-[11px] text-primary-foreground/50">
                    {selectedLocation.lat.toFixed(4)}° N · {Math.abs(selectedLocation.lon).toFixed(4)}° W
                  </p>
                  <div className="mt-2">
                    <LiveStatus
                      dataSource={heatData?.dataSource ?? 'UNKNOWN'}
                      elapsed={elapsedDisplay}
                      confidence={heatData?.explainability.confidence ?? 0}
                    />
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-8 w-28 bg-primary-foreground/20 rounded-full" />
                ) : (
                  <div
                    className="self-start rounded-full px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-white border"
                    style={{
                      borderColor: `${theme.ringColor}60`,
                      backgroundColor: `${theme.ringColor}20`,
                      color: theme.ringColor === '#991b1b' ? '#fca5a5' : theme.ringColor,
                    }}
                  >
                    {theme.icon} {riskLabel}
                  </div>
                )}
              </div>

              {/* Main cockpit: temp + ring + action plan */}
              <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6">
                {/* Left: Temperature */}
                <div className="text-center sm:text-left">
                  <p className="text-[11px] font-bold uppercase text-primary-foreground/70 tracking-wider mb-1">
                    Current Temperature
                  </p>
                  {loading ? (
                    <Skeleton className="h-20 w-48 bg-primary-foreground/20" />
                  ) : (
                    <div className="font-mono text-6xl sm:text-7xl font-extrabold tracking-tight text-primary-foreground">
                      {heatData ? formatTemperature(heatData.current.temperature) : '--'}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-center sm:justify-start gap-3 text-xs text-primary-foreground/80 font-bold">
                    <span>Feels like: <span className="font-mono text-sm font-extrabold">
                      {loading ? '…' : heatData ? formatTemperature(heatData.current.feelsLike) : '--'}
                    </span></span>
                  </div>
                  {/* Historical anomaly pill */}
                  {!loading && heatData && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 border border-primary-foreground/20 px-3 py-1 text-xs font-bold text-primary-foreground/90">
                      <TrendingUp className="size-3.5" />
                      {heatData.historical.difference >= 0 ? '+' : ''}
                      {heatData.historical.difference.toFixed(1)}°C{' '}
                      {heatData.historical.difference >= 0 ? 'above' : 'below'} local baseline
                    </div>
                  )}
                </div>

                {/* Center: Risk Ring */}
                <div className="flex-shrink-0">
                  {loading ? (
                    <Skeleton className="size-40 rounded-full bg-primary-foreground/20" />
                  ) : (
                    <RiskRing score={riskScore} level={riskLevel} animated={bootComplete} />
                  )}
                </div>

                {/* Right: AI Action Plan */}
                <div className="w-full sm:w-auto sm:min-w-[200px] space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-extrabold text-primary-foreground/60 mb-2">
                    AI Action Plan
                  </p>
                  {loading ? (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full bg-primary-foreground/20 rounded-xl" />
                      ))}
                    </div>
                  ) : heatData ? (
                    <>
                      <div className="rounded-xl bg-primary-foreground/10 border border-primary-foreground/20 p-3">
                        <p className="text-[10px] font-extrabold text-primary-foreground/60 uppercase mb-0.5">NOW</p>
                        <p className="text-sm font-extrabold text-primary-foreground">
                          {formatTemperature(heatData.current.temperature)} · {riskLabel}
                        </p>
                      </div>
                      <div className="rounded-xl bg-primary-foreground/10 border border-primary-foreground/20 p-3">
                        <p className="text-[10px] font-extrabold text-orange-300/80 uppercase mb-0.5">PEAK</p>
                        <p className="text-sm font-extrabold text-primary-foreground">
                          {formatTemperature(heatData.peak.temperature)} at {heatData.peak.time}
                        </p>
                      </div>
                      <div className="rounded-xl bg-primary-foreground/10 border border-primary-foreground/20 p-3">
                        <p className="text-[10px] font-extrabold text-emerald-300/80 uppercase mb-0.5">
                          PERSISTS {heatData.persistenceDetail.longestContinuousHighRiskHours > 0
                            ? `(${heatData.persistenceDetail.longestContinuousHighRiskHours}h)`
                            : ''}
                        </p>
                        <p className="text-xs font-semibold text-primary-foreground/80 leading-snug">
                          {heatData.peak.windowStart !== '--:--'
                            ? `Danger window ${heatData.peak.windowStart} – ${heatData.peak.windowEnd}`
                            : 'No extended danger window'}
                        </p>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Bottom: Recommendation */}
              {!loading && heatData && (
                <div className="rounded-2xl bg-primary-foreground/10 border border-primary-foreground/15 p-4 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="grid size-8 place-items-center rounded-full bg-primary-foreground/15 shrink-0 mt-0.5">
                      <ShieldCheck className="size-4 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-extrabold text-primary-foreground/60 mb-1">
                        HeatShield AI Recommendation
                      </p>
                      <p className="text-xs sm:text-sm font-semibold text-primary-foreground/90 leading-relaxed">
                        {heatData.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════
             SECTION 2: AI EXPLAINABILITY
        ══════════════════════════════════════════════════════════ */}
        <section className="scroll-mt-20">
          <AIExplainabilityCard heatData={heatData} loading={loading} />
        </section>

        {/* ══════════════════════════════════════════════════════════
             SECTION 3: 12H FORECAST + HOURLY TIMELINE
        ══════════════════════════════════════════════════════════ */}
        <section id="forecast" className="scroll-mt-20 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
          <ForecastChart heatData={heatData} loading={loading} />

          {/* Hourly risk list */}
          <Card className="border-border/80 shadow-xs animate-slide-up stagger-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-extrabold">Hourly Risk Scale</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Detailed hourly breakdown</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[...Array(7)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col">
                  {timeline.map(([time, label, level], index) => {
                    const t = getRiskTheme(level)
                    return (
                      <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0" key={index}>
                        <div className="w-14 font-mono text-xs font-bold text-muted-foreground text-right">{time}</div>
                        <div
                          className="size-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: t.ringColor }}
                        />
                        <div className="flex flex-1 items-center justify-between">
                          <span className="text-xs font-bold text-foreground">{label}</span>
                          <RiskBadge level={level}>{label}</RiskBadge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ══════════════════════════════════════════════════════════
             SECTION 4: HEAT CLOCK + HEAT STORY
        ══════════════════════════════════════════════════════════ */}
        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <HeatClockCard heatData={heatData} loading={loading} />
          <HeatStoryCard heatData={heatData} loading={loading} />
        </section>

        {/* ══════════════════════════════════════════════════════════
             SECTION 5: MAP
        ══════════════════════════════════════════════════════════ */}
        <section id="map" className="scroll-mt-20">
          <MapPanel
            latitude={selectedLocation.lat}
            longitude={selectedLocation.lon}
            locationName={selectedLocation.name}
            onSelect={(lat, lon) =>
              setSelectedLocation({ lat, lon, name: `Custom Spot (${lat.toFixed(2)}, ${lon.toFixed(2)})` })
            }
            heatData={heatData}
            saferData={saferData}
            loading={loading}
          />
        </section>

        {/* ══════════════════════════════════════════════════════════
             SECTION 6: COOLER PATH + HISTORICAL BASELINE
        ══════════════════════════════════════════════════════════ */}
        <section id="safer-location" className="scroll-mt-20 grid gap-5 lg:grid-cols-[1fr_1fr]">
          <CoolerPathCard
            heatData={heatData}
            saferData={saferData}
            saferLoading={saferLoading}
            saferError={saferError}
            onFetchSafer={handleFetchSafer}
            isUS={isSelectedLocationInUS}
          />
          <HistoricalBaselineCard heatData={heatData} loading={loading} />
        </section>

        {/* ══════════════════════════════════════════════════════════
             SECTION 7: RISK FACTOR BREAKDOWN
        ══════════════════════════════════════════════════════════ */}
        <section className="animate-slide-up stagger-5">
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-extrabold">Risk Factor Breakdown</CardTitle>
              <p className="text-xs text-muted-foreground">Weighted drivers behind your AI Heat Risk Score</p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Temperature Severity', value: heatData?.riskFactors.temperature ?? 0, icon: Thermometer, desc: 'Thermal stress' },
                  { label: 'Historical Anomaly', value: heatData?.riskFactors.historicalGap ?? 0, icon: Activity, desc: 'vs. baseline' },
                  { label: 'Heat Exposure Duration', value: heatData?.riskFactors.heatDuration ?? 0, icon: Sun, desc: 'Persistence' },
                ].map(({ label, value, icon: Icon, desc }) => (
                  <div className="rounded-2xl bg-muted/50 p-4 border border-border/60" key={label}>
                    <div className="flex items-center justify-between mb-2">
                      <Icon className="size-4 text-muted-foreground" />
                      <span
                        className="font-mono text-sm font-extrabold"
                        style={{ color: value >= 70 ? theme.color : 'var(--foreground)' }}
                      >
                        {loading ? '--' : `${value}/100`}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground mb-2">{desc}</p>
                    <div className="h-2 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: loading ? '0%' : `${Math.min(100, value)}%`,
                          background: value >= 70
                            ? `linear-gradient(90deg, ${theme.bgColor}99, ${theme.ringColor})`
                            : 'var(--primary)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                <span className="text-xs font-semibold text-muted-foreground">Combined AI Risk Score</span>
                <span className="font-mono text-lg font-extrabold" style={{ color: theme.color }}>
                  {loading ? '--' : `${riskScore}/100`}
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ══════════════════════════════════════════════════════════
             SECTION 8: SAFETY CHECKLIST
        ══════════════════════════════════════════════════════════ */}
        <section id="safety" className="scroll-mt-20 animate-slide-up stagger-6">
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base font-extrabold">Outdoor Safety Checklist</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">Actionable steps to manage heat strain</p>
              </div>
              <Droplets className="size-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                {safetyTips.map((tip, idx) => {
                  const isChecked = Boolean(checkedTips[idx])
                  return (
                    <button
                      type="button"
                      key={tip}
                      onClick={() => setCheckedTips((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                      className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left text-xs transition-all min-h-[48px] ${
                        isChecked
                          ? 'border-emerald-500/40 bg-emerald-500/10 font-bold text-foreground'
                          : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70'
                      }`}
                    >
                      <CheckCircle2
                        className={`size-5 shrink-0 transition-colors ${
                          isChecked ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/40'
                        }`}
                      />
                      <span>{tip}</span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <footer className="mt-12 flex flex-col justify-between gap-3 border-t border-border/60 py-6 text-xs text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2 font-semibold">
            <Wind className="size-4 text-primary" />
            HeatShield AI · Powered by FortyGuard US Hyper-Local API · heatshield-risk-v1
          </span>
          <span className="font-mono">Team Nexio · Hackathon 2026</span>
        </footer>
      </main>
    </div>
  )
}
