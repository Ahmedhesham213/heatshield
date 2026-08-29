'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { type HeatRiskResponse } from '@/services/api'

type HeatTrendCardProps = {
  heatData: HeatRiskResponse | null
  loading: boolean
}

type Trend = 'increasing' | 'stable' | 'decreasing'

type TrendResult = {
  trend: Trend
  headline: string
  detail: string
  color: string
  bg: string
  icon: React.ReactNode
  trendLabel: string
  trendArrow: string
}

function computeTrend(heatData: HeatRiskResponse): TrendResult {
  const forecast = heatData.forecast
  const currentScore = heatData.current.riskScore

  const next3 = forecast.slice(0, 3)
  const later3 = forecast.slice(3, 6)

  const avgNext3 = next3.length
    ? next3.reduce((s, h) => s + h.riskScore, 0) / next3.length
    : currentScore
  const avgLater3 = later3.length
    ? later3.reduce((s, h) => s + h.riskScore, 0) / later3.length
    : avgNext3

  const delta = avgLater3 - currentScore

  // Find peak and safe points
  const peakHour = forecast.length
    ? [...forecast].sort((a, b) => b.riskScore - a.riskScore)[0]
    : null
  const safeHour = forecast.find(h => h.level === 'low' || h.level === 'moderate')

  if (delta > 8) {
    // Increasing
    const minutesToPeak = peakHour ? (forecast.indexOf(peakHour) + 1) * 60 : null
    return {
      trend: 'increasing',
      trendLabel: 'Increasing',
      trendArrow: '↗️',
      headline: '🔥 Heat risk is increasing.',
      detail: peakHour
        ? `Expected to peak around ${peakHour.time} at ${peakHour.riskScore}/100.`
        : 'Conditions are worsening over the next few hours.',
      color: '#fb923c',
      bg: 'rgba(251,146,60,0.08)',
      icon: <TrendingUp className="size-5" style={{ color: '#fb923c' }} />,
    }
  }

  if (delta < -8) {
    // Decreasing
    return {
      trend: 'decreasing',
      trendLabel: 'Decreasing',
      trendArrow: '↘️',
      headline: '🟢 Heat risk is decreasing.',
      detail: safeHour
        ? `Conditions are improving. Safer period expected from ${safeHour.time}.`
        : 'Temperatures are trending downward.',
      color: '#4ade80',
      bg: 'rgba(74,222,128,0.08)',
      icon: <TrendingDown className="size-5" style={{ color: '#4ade80' }} />,
    }
  }

  // Stable
  return {
    trend: 'stable',
    trendLabel: 'Stable',
    trendArrow: '→',
    headline: '→ Conditions are stable.',
    detail: peakHour
      ? `Risk remains consistent. Peak expected around ${peakHour.time}.`
      : 'No significant change expected in the next few hours.',
    color: '#facc15',
    bg: 'rgba(250,204,21,0.08)',
    icon: <Minus className="size-5" style={{ color: '#facc15' }} />,
  }
}

export function HeatTrendCard({ heatData, loading }: HeatTrendCardProps) {
  const result = useMemo(() => {
    if (!heatData || !heatData.forecast.length) return null
    return computeTrend(heatData)
  }, [heatData])

  if (loading) {
    return (
      <div className="rounded-2xl p-5 animate-shimmer" style={{ background: 'var(--border-subtle)', height: 100 }} />
    )
  }

  if (!result) return null

  return (
    <div
      className="rounded-2xl p-5 flex items-center gap-4"
      style={{ background: result.bg, border: `1px solid ${result.color}25` }}
    >
      <div
        className="size-11 flex-shrink-0 rounded-2xl grid place-items-center"
        style={{ background: `${result.color}15`, border: `1px solid ${result.color}30` }}
      >
        {result.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            Heat Trend
          </span>
          <span
            className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full"
            style={{ background: `${result.color}20`, color: result.color }}
          >
            {result.trendArrow} {result.trendLabel}
          </span>
        </div>
        <p className="text-sm font-black leading-tight" style={{ color: result.color }}>
          {result.headline}
        </p>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {result.detail}
        </p>
      </div>
    </div>
  )
}
