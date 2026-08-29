'use client'

import { useEffect, useRef, useState } from 'react'
import { type HeatRiskResponse } from '@/services/api'
import { getRiskTheme, type TempUnit } from '@/utils/risk-theme'
import { getActivityProfile } from '@/utils/risk-theme'

type HeatExposureMeterProps = {
  heatData: HeatRiskResponse | null
  loading: boolean
  selectedActivity: string
}

type ExposureLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY HIGH'

function getExposureLevel(score: number, minutesOutside: number, multiplier: number): ExposureLevel {
  // Exposure compounds over time and with activity
  const timeWeight = Math.min(1, minutesOutside / 60) // 0 to 1 over 60 minutes
  const exposureScore = score * multiplier * (0.6 + 0.4 * timeWeight)

  if (exposureScore >= 72) return 'VERY HIGH'
  if (exposureScore >= 50) return 'HIGH'
  if (exposureScore >= 30) return 'MODERATE'
  return 'LOW'
}

function getWarningMinutes(score: number, multiplier: number): number {
  // Rough estimate of when exposure becomes HIGH
  const adjustedScore = score * multiplier
  if (adjustedScore >= 80) return 10
  if (adjustedScore >= 60) return 20
  if (adjustedScore >= 40) return 35
  return 60
}

const LEVEL_CONFIG: Record<ExposureLevel, { color: string; bg: string; icon: string }> = {
  LOW: { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', icon: '🟢' },
  MODERATE: { color: '#facc15', bg: 'rgba(250,204,21,0.10)', icon: '🟡' },
  HIGH: { color: '#fb923c', bg: 'rgba(251,146,60,0.10)', icon: '🟠' },
  'VERY HIGH': { color: '#f87171', bg: 'rgba(248,113,113,0.10)', icon: '🔴' },
}

export function HeatExposureMeter({ heatData, loading, selectedActivity }: HeatExposureMeterProps) {
  const [minutesElapsed, setMinutesElapsed] = useState(0)
  const startRef = useRef<number>(Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const score = heatData?.current.riskScore ?? 0
  const profile = getActivityProfile(selectedActivity)
  const exposureLevel = getExposureLevel(score, minutesElapsed, profile.riskMultiplier)
  const warningAt = getWarningMinutes(score, profile.riskMultiplier)
  const cfg = LEVEL_CONFIG[exposureLevel]

  useEffect(() => {
    // Reset timer when heatData changes (new location fetch)
    startRef.current = Date.now()
    setMinutesElapsed(0)

    intervalRef.current = setInterval(() => {
      setMinutesElapsed(Math.floor((Date.now() - startRef.current) / 60000))
    }, 10000) // update every 10s

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [heatData?.location.lat, heatData?.location.lon])

  if (loading || !heatData || score < 20) return null // Don't show for low risk

  const remaining = Math.max(0, warningAt - minutesElapsed)
  const pct = Math.min(100, (minutesElapsed / Math.max(warningAt, 1)) * 100)

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}
    >
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>
              🥵 Heat Exposure — Estimate
            </p>
            <div className="flex items-center gap-2">
              <span className="text-lg">{cfg.icon}</span>
              <span className="text-xl font-black" style={{ color: cfg.color }}>
                {exposureLevel}
              </span>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Time tracked
            </p>
            <p className="font-mono text-xl font-black" style={{ color: 'var(--text-primary)' }}>
              {minutesElapsed}
              <span className="text-sm font-medium ml-1" style={{ color: 'var(--text-tertiary)' }}>min</span>
            </p>
          </div>
        </div>

        {/* Exposure bar */}
        <div className="mb-3">
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${pct}%`,
                background: `linear-gradient(90deg, #4ade80, ${cfg.color})`,
              }}
            />
          </div>
        </div>

        {/* Warning message */}
        {remaining > 0 && exposureLevel !== 'VERY HIGH' ? (
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            ⚠️ Continuing for another <strong style={{ color: cfg.color }}>{remaining} min</strong> may significantly increase exposure.
          </p>
        ) : exposureLevel === 'VERY HIGH' ? (
          <p className="text-xs font-bold" style={{ color: '#f87171' }}>
            🔴 Extended exposure at this heat level is not recommended.
          </p>
        ) : null}

        <p className="text-[10px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
          Estimate only · Based on risk score {score}/100 · {profile.icon} {profile.title} · Not medical advice
        </p>
      </div>
    </section>
  )
}
