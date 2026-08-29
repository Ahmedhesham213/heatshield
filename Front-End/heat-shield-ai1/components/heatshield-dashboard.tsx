'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BrainCircuit,
  ChevronDown,
  Clock,
  Crosshair,
  Droplets,
  Flame,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  Thermometer,
  TrendingUp,
  Activity,
} from 'lucide-react'
import { GamificationBadge } from '@/components/gamification-badge'
import { HeatAlertsCenter } from '@/components/heat-alerts-center'
import { HeatWarningToast } from '@/components/heat-warning-toast'
import { LocationCompare } from '@/components/location-compare'
import { Navbar, US_PRESET_CITIES } from '@/components/navbar'
import { OutdoorPlanner } from '@/components/outdoor-planner'
import { ProtectMePanel } from '@/components/protect-me-panel'
import { SettingsModal } from '@/components/settings-modal'
import { SmartInsightBanner } from '@/components/smart-insight-banner'
import { WhatShouldIDo } from '@/components/what-should-i-do'
import { HeatMission } from '@/components/heat-mission'
import { HeatClock } from '@/components/heat-clock'
import { HeatExposureMeter } from '@/components/heat-exposure-meter'
import { HeatTrendCard } from '@/components/heat-trend-card'
import { BeforeYouGo } from '@/components/before-you-go'
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
  { id: 0, delay: 0, label: 'Scanning local thermal conditions…' },
  { id: 1, delay: 420, label: 'Reading current temperature…' },
  { id: 2, delay: 800, label: 'Detecting historical anomaly…' },
  { id: 3, delay: 1100, label: 'Analyzing 12-hour forecast window…' },
  { id: 4, delay: 1380, label: 'Computing AI risk score…' },
  { id: 5, delay: 1680, label: 'ANALYSIS COMPLETE' },
] as const

function formatDiff(diff: number): string {
  return diff >= 0 ? `+${diff.toFixed(1)}°C` : `${diff.toFixed(1)}°C`
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
      <div
        className="absolute inset-0 rounded-full transition-all duration-300"
        style={{
          background: `conic-gradient(${theme.ringColor} 0 ${ringPct}%, var(--border-subtle) ${ringPct}% 100%)`,
          boxShadow: animated && score > 25 ? theme.glow : 'none',
        }}
      />
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
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none rounded-full blur-3xl opacity-30"
        style={{
          width: '80vw', maxWidth: 400, height: '80vw', maxHeight: 400,
          background: 'radial-gradient(circle, rgba(56,189,248,0.3) 0%, rgba(249,115,22,0.1) 60%, transparent 100%)',
        }}
      />
      <div
        className="relative z-10 flex flex-col items-center max-w-xs sm:max-w-sm w-full p-6 sm:p-8 rounded-3xl text-center border shadow-2xl backdrop-blur-2xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="grid size-11 place-items-center rounded-2xl shadow-md" style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)' }}>
            <ShieldCheck className="size-6 text-sky-400" />
          </div>
          <div className="text-left">
            <p className="text-lg font-black tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>HeatShield AI</p>
            <p className="text-[9px] font-extrabold uppercase tracking-widest text-sky-400">Heat Safety Copilot</p>
          </div>
        </div>
        <div
          className="mb-5 px-3.5 py-1.5 rounded-full border text-[11px] font-mono font-semibold flex items-center gap-2 max-w-full truncate"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <Loader2 className="size-3.5 text-sky-400 animate-spin flex-shrink-0" />
          <span className="truncate">{currentStepLabel}</span>
        </div>
        <div
          className="w-full h-32 flex flex-col items-center justify-center rounded-2xl border p-4 transition-all duration-300"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          {phase < 1 || temp === undefined ? (
            <div className="flex flex-col items-center space-y-2">
              <div className="size-6 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
              <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Reading Thermal Sensors…</p>
            </div>
          ) : (
            <div className="space-y-1.5 animate-fade-in w-full">
              <p className="text-[9px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Current Temperature</p>
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
                    style={{ color: theme.ringColor, background: `${theme.ringColor}20`, border: `1px solid ${theme.ringColor}40` }}
                  >
                    {level} · {score}/100 Risk
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-6 w-full space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono font-bold" style={{ color: 'var(--text-tertiary)' }}>
            <span>ANALYZING</span><span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #38bdf8 0%, #fb923c 100%)' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Skel({ className = '' }: { className?: string }) {
  return <div className={`rounded-lg animate-shimmer ${className}`} style={{ background: 'var(--border-subtle)' }} />
}

// ═══════════════════════════════════════════════════════════════════
// HERO SECTION — Mobile-first, 5-second UX
// ═══════════════════════════════════════════════════════════════════
function HeroSection({
  heatData, loading, riskLevel, riskScore, riskLabel,
  selectedLocation, elapsedDisplay, bootComplete, tempUnit, selectedActivity,
  onScrollTo,
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
  onScrollTo: (id: string) => void
}) {
  const theme = getRiskTheme(riskLevel)
  const temp = heatData?.current.temperature
  const feelsLike = heatData?.current.feelsLike
  const diff = heatData?.historical.difference ?? 0
  const activityProfile = getActivityProfile(selectedActivity)

  return (
    <section
      id="dashboard"
      className="hero-thermal animate-section-reveal"
      style={{ borderRadius: 24, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}
    >
      <div style={{ height: 4, background: `linear-gradient(90deg, transparent, ${theme.ringColor}, transparent)` }} />
      <div className="relative z-10 p-4 sm:p-6">
        {/* Location row */}
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

        {/* Core data: temp + ring */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 items-center">
          {/* Temperature */}
          <div className="sm:col-span-1 flex flex-row sm:flex-col items-center sm:items-start gap-4 sm:gap-0">
            {loading ? (
              <Skel className="h-16 w-32 sm:h-20 sm:w-48" />
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

          {/* Risk Ring */}
          <div className="sm:col-span-1 flex flex-col items-center gap-3">
            {loading ? (
              <div className="size-36 sm:size-44 rounded-full animate-shimmer" style={{ background: 'var(--border-subtle)' }} />
            ) : (
              <RiskRing score={riskScore} level={riskLevel} animated={bootComplete} />
            )}
            {!loading && heatData && <RiskBadge level={riskLevel} label={riskLabel} />}
          </div>

          {/* Desktop right col — activity + safety */}
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

        {/* Mobile: peak pill */}
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

        {/* 3 primary quick-actions */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {[
            {
              label: '🛡️ Protect Me',
              target: 'protect-me',
              style: { background: 'rgba(56,189,248,0.12)', borderColor: 'rgba(56,189,248,0.3)', color: 'var(--accent-cyan)' },
            },
            {
              label: '🧊 Cooler Area',
              target: 'routes',
              style: { background: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.25)', color: '#4ade80' },
            },
            {
              label: '🗺️ Heat Radar',
              target: 'map',
              style: { background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' },
            },
          ].map(({ label, target, style }) => (
            <button
              key={target}
              type="button"
              onClick={() => onScrollTo(target)}
              className="flex items-center justify-center gap-1.5 rounded-2xl border font-bold text-xs transition-all active:scale-95 hover:scale-[1.02]"
              style={{ ...style, minHeight: 52, padding: '10px 6px' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
// AI EXPLANATION PANEL (collapsible "Why this score?")
// ═══════════════════════════════════════════════════════════════════
function AIExplanationPanel({ heatData, loading, tempUnit }: { heatData: HeatRiskResponse | null; loading: boolean; tempUnit: TempUnit }) {
  const { ref, inView } = useInView()
  const [expanded, setExpanded] = useState(false)
  const theme = getRiskTheme(heatData?.current.riskLevel ?? 'unknown')
  const score = heatData?.current.riskScore ?? 0
  const factors = heatData?.riskFactors

  const breakdown = [
    { name: '🌡️ Thermal Severity', score: factors?.temperature ?? 0, weight: '40%', desc: 'Current apparent temperature vs heat stress threshold.' },
    { name: '📊 Historical Anomaly', score: factors?.historicalGap ?? 0, weight: '20%', desc: 'Deviation from the local 30-year historical baseline.' },
    { name: '⏳ Heat Duration', score: factors?.heatDuration ?? 0, weight: '20%', desc: 'Consecutive hours of elevated heat risk in forecast.' },
    { name: '🔥 Forecast Peak', score: Math.min(100, Math.round((heatData?.peak.temperature ?? 0) * 2)), weight: '10%', desc: 'Max predicted temperature over next 12 hours.' },
    { name: '☀️ Solar Load', score: Math.min(100, Math.round((heatData?.current.feelsLike ?? 0) * 1.8)), weight: '10%', desc: 'Apparent heat index factoring solar radiation.' },
  ]

  return (
    <section ref={ref} className={`section-hidden ${inView ? 'section-visible' : ''}`} style={{ transitionDelay: '100ms' }}>
      <div className="hs-card p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl flex-shrink-0" style={{ background: `${theme.ringColor}18`, border: `1px solid ${theme.ringColor}30` }}>
              <BrainCircuit className="size-5" style={{ color: theme.ringColor }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Why this risk score? ({score}/100)
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                heatshield-risk-v1 · 5-Signal Explainable AI
              </p>
            </div>
          </div>
          <ChevronDown
            className="size-4 flex-shrink-0 transition-transform duration-300"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--text-tertiary)' }}
          />
        </button>

        {expanded && (
          <div className="mt-5 space-y-3 animate-fade-in">
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skel key={i} className="h-12 w-full" />)}</div>
            ) : (
              breakdown.map(sig => (
                <div key={sig.name} className="p-4 rounded-2xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{sig.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>{sig.weight}</span>
                    </div>
                    <span className="font-mono text-sm font-bold" style={{ color: theme.ringColor }}>{Math.min(100, sig.score)}/100</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--border-subtle)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, sig.score)}%`, background: `linear-gradient(90deg, ${theme.ringColor}60, ${theme.ringColor})` }} />
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{sig.desc}</p>
                </div>
              ))
            )}
            <p className="text-[10px] text-center pt-2" style={{ color: 'var(--text-tertiary)' }}>
              Analysis by heatshield-risk-v1 · Not medical or meteorological advice
            </p>
          </div>
        )}
      </div>
    </section>
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

  // Settings State
  const [tempUnit, setTempUnit] = useState<TempUnit>('C')
  const [selectedActivity, setSelectedActivity] = useState<string>('walking')
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false)
  const [alertThreshold, setAlertThreshold] = useState<number>(60)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Boot animation
  const [bootPhase, setBootPhase] = useState<number>(-1)
  const [bootComplete, setBootComplete] = useState(false)
  const hasBooted = useRef(false)

  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  const [elapsedDisplay, setElapsedDisplay] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setElapsedDisplay(Math.round((Date.now() - lastUpdateTime) / 1000)), 1000)
    return () => clearInterval(id)
  }, [lastUpdateTime])

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

  const scrollTo = (id: string) => {
    if (id === 'map' || id === 'routes' || id === 'compare') setActiveMobileTab('radar')
    else if (id === 'planner' || id === 'forecast' || id === 'mission' || id === 'clock' || id === 'heat-clock') setActiveMobileTab('mission')
    else if (id === 'protect-me' || id === 'alerts' || id === 'safety') setActiveMobileTab('protect')
    else setActiveMobileTab('copilot')

    setTimeout(() => {
      const el = document.getElementById(id) || document.getElementById('forecast') || document.getElementById('heat-clock')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const riskLevel = heatData?.current.riskLevel ?? 'unknown'
  const riskLabel = heatData?.current.riskLabel ?? 'Analyzing…'
  const riskScore = heatData?.current.riskScore ?? 0

  if (!bootComplete) {
    return <BootOverlay phase={bootPhase} heatData={loading ? null : heatData} />
  }

  const displayData = protection.isProtecting && protection.liveData ? protection.liveData : heatData
  const displayLoading = protection.isProtecting && protection.liveLoading ? true : loading

  return (
    <div className="min-h-screen pb-24 md:pb-12" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', transition: 'background-color 0.25s ease' }}>
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

      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 space-y-5">
        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-slide-up">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest" style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80' }}>
                🇺🇸 US Coverage
              </span>
              {heatData && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest" style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: 'var(--accent-cyan)' }}>
                  {heatData.dataSource === 'MOCK_DETERMINISTIC' ? '⚙ Demo' : '📡 Live'}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
              HeatShield AI
            </h1>
            <p className="text-sm mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
              Your heat safety copilot · Powered by FortyGuard
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRequestGpsLocation}
              disabled={geo.loading}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all border disabled:opacity-50"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--accent-cyan)' }}
            >
              <Crosshair className={`size-3.5 ${geo.loading ? 'animate-spin' : ''}`} />
              {geo.loading ? 'Locating…' : 'Use GPS'}
            </button>
            <button
              onClick={fetchHeatData}
              disabled={loading}
              className="grid size-10 place-items-center rounded-xl transition-all disabled:opacity-50 border"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-2xl p-4 border" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', color: '#f87171' }}>
            <p className="text-sm font-bold">⚠️ {error}</p>
          </div>
        )}

        {/* ── SECTION 0: Smart Insight Banner ── */}
        <SmartInsightBanner heatData={displayData} loading={displayLoading} />

        {/* ── SECTION 1: Hero ── */}
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
          onScrollTo={scrollTo}
        />

        {/* ── SECTION 2: What Should I Do? (THE centerpiece) ── */}
        <WhatShouldIDo heatData={displayData} loading={displayLoading} tempUnit={tempUnit} />

        {/* ── SECTION 3: Heat Trend + Exposure side by side on desktop ── */}
        <div className="grid grid-cols-1 gap-4">
          <HeatTrendCard heatData={displayData} loading={displayLoading} />
          <HeatExposureMeter heatData={displayData} loading={displayLoading} selectedActivity={selectedActivity} />
        </div>

        {/* ── SECTION 4: Before You Go ── */}
        {!displayLoading && displayData && (
          <BeforeYouGo
            heatData={displayData}
            tempUnit={tempUnit}
            selectedLocation={selectedLocation}
            onActivateProtection={() => protection.setIsProtecting(true)}
          />
        )}

        {/* ── SECTION 5: Protect Me Mode ── */}
        <ProtectMePanel protection={protection} tempUnit={tempUnit} />

        {/* ── SECTION 6: Heat Mission ── */}
        <HeatMission heatData={heatData} tempUnit={tempUnit} />

        {/* ── SECTION 7: Heat Clock ── */}
        <HeatClock heatData={displayData} loading={displayLoading} tempUnit={tempUnit} />

        {/* ── SECTION 8: Heat Radar (Map) ── */}
        <section id="map" className="hs-card overflow-hidden">
          <div className="p-5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>
              Live Thermal Intelligence
            </p>
            <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              🔥 Heat Radar
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Your location surrounded by heat-risk zones — tap to explore
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
              onSelect={(lat, lon) => setSelectedLocation({ lat, lon, name: `Custom (${lat.toFixed(2)}, ${lon.toFixed(2)})` })}
            />
          </div>
        </section>

        {/* ── SECTION 9: AI Explanation (collapsible) ── */}
        <AIExplanationPanel heatData={displayData} loading={displayLoading} tempUnit={tempUnit} />

        {/* ── SECTION 10: Location Compare ── */}
        <LocationCompare
          currentCityName={selectedLocation.name}
          currentLat={selectedLocation.lat}
          currentLon={selectedLocation.lon}
          tempUnit={tempUnit}
        />

        {/* ── SECTION 11: Smart Alerts ── */}
        <HeatAlertsCenter
          heatData={heatData}
          notificationsEnabled={notificationsEnabled}
          setNotificationsEnabled={setNotificationsEnabled}
          onRequestNotificationPermission={handleRequestNotificationPermission}
        />

        {/* ── SECTION 12: Gamification (subtle, at bottom) ── */}
        <GamificationBadge />

        {/* Footer */}
        <footer className="space-y-3 py-8 text-xs border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
          <div className="flex flex-col sm:flex-row justify-between gap-3 font-semibold">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4" style={{ color: 'var(--accent-cyan)' }} />
              HeatShield AI · Powered by FortyGuard · heatshield-risk-v1
            </span>
            <span className="font-mono">Team Nexio · FortyGuard Hackathon 2026</span>
          </div>
          <p className="text-[10px] leading-relaxed max-w-3xl">
            Disclaimer: HeatShield provides heat-risk decision support and does not replace official weather warnings, occupational safety guidance, or medical advice.
          </p>
        </footer>
      </main>

      <HeatWarningToast
        heatData={displayData}
        tempUnit={tempUnit}
        isLiveProtecting={protection.isProtecting}
      />

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
