'use client'

import { useMemo } from 'react'
import { type HeatRiskResponse } from '@/services/api'
import { getRiskTheme } from '@/utils/risk-theme'

type SmartInsightBannerProps = {
  heatData: HeatRiskResponse | null
  loading: boolean
}

function getInsight(heatData: HeatRiskResponse): { emoji: string; text: string; color: string } {
  const level = heatData.current.riskLevel
  const score = heatData.current.riskScore
  const isUnusual = heatData.historical.isUnusual
  const diff = heatData.historical.difference
  const forecast = heatData.forecast ?? []
  const peak = heatData.peak

  // Calculate if risk is increasing, stable, or decreasing over next 3 hours
  const now3h = forecast.slice(0, 3)
  const later3h = forecast.slice(3, 6)
  const avgNow = now3h.length ? now3h.reduce((s, h) => s + h.riskScore, 0) / now3h.length : score
  const avgLater = later3h.length ? later3h.reduce((s, h) => s + h.riskScore, 0) / later3h.length : score
  const trendDelta = avgLater - avgNow

  // Find safest hour in forecast
  const safestHour = forecast.length
    ? [...forecast].sort((a, b) => a.riskScore - b.riskScore)[0]
    : null

  // Priority insights
  if (level === 'extreme') {
    return { emoji: '🆘', text: 'Extreme heat — avoid all outdoor exposure immediately.', color: '#ef4444' }
  }

  if (level === 'very_high' && trendDelta > 8) {
    return { emoji: '🔴', text: `Very high risk and rising. Peak expected around ${peak.time}.`, color: '#f87171' }
  }

  if (isUnusual && diff > 0) {
    return {
      emoji: '⚠️',
      text: `Your area is ${Math.abs(diff).toFixed(1)}°C hotter than the historical baseline today.`,
      color: '#fb923c',
    }
  }

  if (trendDelta > 8) {
    return { emoji: '🔥', text: `Heat risk is increasing. Peak approaches around ${peak.time}.`, color: '#fb923c' }
  }

  if (trendDelta < -8) {
    const improvesAt = later3h[0]?.time ?? safestHour?.time ?? '--'
    return { emoji: '🟢', text: `Conditions are improving. Risk drops around ${improvesAt}.`, color: '#4ade80' }
  }

  if (safestHour && (level === 'high' || level === 'very_high')) {
    return {
      emoji: '⏰',
      text: `Safer window available at ${safestHour.time} (${safestHour.label} risk).`,
      color: '#facc15',
    }
  }

  if (level === 'low') {
    return { emoji: '🟢', text: 'Conditions are currently favorable for outdoor activity.', color: '#4ade80' }
  }

  if (level === 'moderate') {
    return { emoji: '🌤️', text: 'Moderate heat — stay hydrated and take breaks when needed.', color: '#facc15' }
  }

  if (peak.time && peak.time !== '--:--') {
    return {
      emoji: '🔥',
      text: `Peak heat expected at ${peak.time}. Plan accordingly.`,
      color: '#fb923c',
    }
  }

  return { emoji: '📍', text: 'HeatShield is monitoring your current location.', color: 'var(--accent-cyan)' }
}

export function SmartInsightBanner({ heatData, loading }: SmartInsightBannerProps) {
  const insight = useMemo(() => {
    if (!heatData) return null
    return getInsight(heatData)
  }, [heatData])

  if (loading || !insight) {
    return (
      <div
        className="rounded-2xl px-4 py-3 flex items-center gap-3 animate-shimmer"
        style={{ height: 44, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      />
    )
  }

  return (
    <div
      className="rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-in"
      style={{
        background: `${insight.color}10`,
        border: `1px solid ${insight.color}30`,
      }}
    >
      <span className="text-base flex-shrink-0" role="img" aria-hidden>{insight.emoji}</span>
      <p className="text-sm font-semibold leading-tight" style={{ color: insight.color }}>
        {insight.text}
      </p>
    </div>
  )
}
