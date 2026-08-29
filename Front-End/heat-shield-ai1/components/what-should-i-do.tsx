'use client'

import { useState, useMemo } from 'react'
import { BrainCircuit, ChevronDown, ChevronRight } from 'lucide-react'
import { type HeatRiskResponse } from '@/services/api'
import { getRiskTheme, formatTempUnit, type TempUnit } from '@/utils/risk-theme'

type WhatShouldIDoProps = {
  heatData: HeatRiskResponse | null
  loading: boolean
  tempUnit: TempUnit
}

type Recommendation = {
  urgency: 'critical' | 'caution' | 'safe'
  headline: string
  subline: string
  saferTime?: string
  color: string
  bgColor: string
  icon: string
}

function deriveRecommendation(heatData: HeatRiskResponse): Recommendation {
  const level = heatData.current.riskLevel
  const score = heatData.current.riskScore
  const forecast = heatData.forecast ?? []
  const peak = heatData.peak

  // Find first hour with low/moderate risk
  const saferHour = forecast.find(h => h.level === 'low' || h.level === 'moderate')
  const saferTime = saferHour?.time

  if (level === 'extreme') {
    return {
      urgency: 'critical',
      icon: '🆘',
      color: '#ef4444',
      bgColor: 'rgba(239,68,68,0.08)',
      headline: 'Do not go outside right now.',
      subline: peak.windowStart && peak.windowEnd
        ? `Extreme conditions last from ${peak.windowStart} to ${peak.windowEnd}. Seek air-conditioned shelter.`
        : 'Extreme heat detected. Move to a cooled space immediately.',
      saferTime,
    }
  }

  if (level === 'very_high') {
    return {
      urgency: 'critical',
      icon: '🔴',
      color: '#f87171',
      bgColor: 'rgba(248,113,113,0.08)',
      headline: 'Avoid prolonged outdoor exposure right now.',
      subline: peak.time && peak.time !== '--:--'
        ? `Peak heat is expected around ${peak.time}. Limit outdoor time to under 15 minutes.`
        : 'Very high heat risk. Take short trips only, with frequent shaded breaks.',
      saferTime,
    }
  }

  if (level === 'high') {
    return {
      urgency: 'caution',
      icon: '🟠',
      color: '#fb923c',
      bgColor: 'rgba(251,146,60,0.08)',
      headline: 'Proceed with caution outdoors.',
      subline: saferTime
        ? `Current conditions are high-risk. A safer window opens around ${saferTime}.`
        : 'High heat risk. Stay hydrated and limit strenuous activity.',
      saferTime,
    }
  }

  if (level === 'moderate') {
    return {
      urgency: 'caution',
      icon: '🟡',
      color: '#facc15',
      bgColor: 'rgba(250,204,21,0.08)',
      headline: 'Outdoor activity is manageable — stay aware.',
      subline: peak.time && peak.time !== '--:--'
        ? `Avoid peak heat around ${peak.time}. Keep water close and take breaks.`
        : 'Moderate heat. Stay hydrated and monitor how you feel.',
      saferTime,
    }
  }

  return {
    urgency: 'safe',
    icon: '🟢',
    color: '#4ade80',
    bgColor: 'rgba(74,222,128,0.08)',
    headline: 'Good conditions for outdoor activity.',
    subline: 'Heat risk is currently low. Normal precautions apply — stay hydrated.',
  }
}

export function WhatShouldIDo({ heatData, loading, tempUnit }: WhatShouldIDoProps) {
  const [whyOpen, setWhyOpen] = useState(false)
  const theme = getRiskTheme(heatData?.current.riskLevel ?? 'unknown')

  const rec = useMemo(() => {
    if (!heatData) return null
    return deriveRecommendation(heatData)
  }, [heatData])

  const topDrivers = heatData?.explainability?.topDrivers ?? []
  const score = heatData?.current.riskScore ?? 0
  const feelsLike = heatData?.current.feelsLike
  const isUnusual = heatData?.historical.isUnusual ?? false
  const diff = heatData?.historical.difference ?? 0
  const persistHours = heatData?.persistenceDetail.highRiskHours ?? 0

  return (
    <section
      id="what-should-i-do"
      className="rounded-3xl overflow-hidden"
      style={{ border: `1px solid ${rec?.color ?? theme.ringColor}30`, background: 'var(--bg-card)' }}
    >
      {/* Header accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${rec?.color ?? theme.ringColor}, transparent)` }} />

      <div className="p-5 sm:p-6">
        {/* Section label */}
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit className="size-4" style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            AI Decision
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest ml-auto" style={{ color: 'var(--text-tertiary)' }}>
            heatshield-risk-v1
          </span>
        </div>

        {loading || !rec ? (
          <div className="space-y-3">
            <div className="h-7 w-3/4 rounded-xl animate-shimmer" style={{ background: 'var(--border-subtle)' }} />
            <div className="h-4 w-full rounded-lg animate-shimmer" style={{ background: 'var(--border-subtle)' }} />
            <div className="h-4 w-2/3 rounded-lg animate-shimmer" style={{ background: 'var(--border-subtle)' }} />
          </div>
        ) : (
          <>
            {/* Main recommendation */}
            <div
              className="rounded-2xl p-5 mb-4"
              style={{ background: rec.bgColor, border: `1px solid ${rec.color}25` }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0 mt-0.5" role="img" aria-hidden>{rec.icon}</span>
                <div>
                  <h2
                    className="text-lg sm:text-xl font-black leading-tight mb-2"
                    style={{ color: rec.color, letterSpacing: '-0.02em' }}
                  >
                    {rec.headline}
                  </h2>
                  <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {rec.subline}
                  </p>
                  {rec.saferTime && rec.urgency !== 'safe' && (
                    <div
                      className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
                      style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}
                    >
                      🟢 Safer conditions from {rec.saferTime}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Why? toggle */}
            <button
              type="button"
              onClick={() => setWhyOpen(v => !v)}
              className="flex items-center gap-2 text-sm font-bold transition-colors mb-1"
              style={{ color: 'var(--accent-cyan)' }}
              id="why-recommendation-toggle"
            >
              {whyOpen
                ? <ChevronDown className="size-4" />
                : <ChevronRight className="size-4" />}
              Why this recommendation?
            </button>

            {whyOpen && (
              <div
                className="mt-3 rounded-2xl p-4 space-y-3 animate-fade-in"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
              >
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                  Why?
                </p>

                <div className="space-y-2">
                  {feelsLike != null && (
                    <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span className="flex-shrink-0">🌡️</span>
                      <span>
                        Feels like <strong style={{ color: 'var(--text-primary)' }}>{formatTempUnit(feelsLike, tempUnit)}</strong> —{' '}
                        {score >= 60 ? 'high thermal stress on the body' : 'moderate thermal load'}
                      </span>
                    </div>
                  )}

                  {isUnusual && diff > 0 && (
                    <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span className="flex-shrink-0">📈</span>
                      <span>
                        <strong style={{ color: '#fb923c' }}>{Math.abs(diff).toFixed(1)}°C above</strong> the local historical baseline — unusually hot for this location
                      </span>
                    </div>
                  )}

                  {persistHours > 0 && (
                    <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span className="flex-shrink-0">⏳</span>
                      <span>
                        High heat expected for <strong style={{ color: 'var(--text-primary)' }}>{persistHours} more hour{persistHours > 1 ? 's' : ''}</strong> — sustained exposure increases risk
                      </span>
                    </div>
                  )}

                  {topDrivers.slice(0, 2).map((driver, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span className="flex-shrink-0">🔥</span>
                      <span>{driver}</span>
                    </div>
                  ))}

                  <p className="text-[10px] font-medium pt-1 border-t" style={{ color: 'var(--text-tertiary)', borderColor: 'var(--border-subtle)' }}>
                    Analysis by heatshield-risk-v1 · {score}/100 heat risk score · Estimate only, not medical advice.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
