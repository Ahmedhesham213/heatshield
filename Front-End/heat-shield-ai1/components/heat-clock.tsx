'use client'

import { useMemo } from 'react'
import { type HeatRiskResponse } from '@/services/api'
import { getRiskTheme, formatTempUnit, type TempUnit } from '@/utils/risk-theme'

type HeatClockProps = {
  heatData: HeatRiskResponse | null
  loading: boolean
  tempUnit: TempUnit
}

const RISK_EMOJIS: Record<string, string> = {
  low: '🟢',
  moderate: '🟡',
  high: '🟠',
  very_high: '🔴',
  extreme: '🆘',
  unknown: '—',
}

export function HeatClock({ heatData, loading, tempUnit }: HeatClockProps) {
  const forecast = heatData?.forecast ?? []

  const currentHour = new Date().getHours()

  const analysis = useMemo(() => {
    if (!forecast.length) return null

    const scores = forecast.map(h => h.riskScore)
    const maxScore = Math.max(...scores)
    const minScore = Math.min(...scores)

    const peakHour = forecast.find(h => h.riskScore === maxScore)
    const safestHour = forecast.find(h => h.riskScore === minScore)

    // Find dangerous period (contiguous high/extreme hours)
    const dangerPeriod: typeof forecast = []
    let inDanger = false
    for (const h of forecast) {
      if (h.level === 'very_high' || h.level === 'extreme') {
        dangerPeriod.push(h)
        inDanger = true
      } else if (inDanger) break
    }

    // Find safer period (contiguous low/moderate hours)
    const saferPeriod: typeof forecast = []
    let foundSafe = false
    for (let i = forecast.length - 1; i >= 0; i--) {
      const h = forecast[i]
      if (h.level === 'low' || h.level === 'moderate') {
        saferPeriod.unshift(h)
        foundSafe = true
      } else if (foundSafe) break
    }

    return { peakHour, safestHour, dangerPeriod, saferPeriod }
  }, [forecast])

  return (
    <section id="forecast" className="hs-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>
          12-Hour Timeline
        </p>
        <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          🕐 Heat Clock
        </h2>
        {analysis && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {analysis.peakHour && `Peak at ${analysis.peakHour.time}`}
            {analysis.safestHour && ` · Safest at ${analysis.safestHour.time}`}
          </p>
        )}
      </div>

      <div className="p-4">
        {loading || !forecast.length ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded-xl animate-shimmer" style={{ background: 'var(--border-subtle)' }} />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {forecast.map((hour, idx) => {
              const theme = getRiskTheme(hour.level)
              const emoji = RISK_EMOJIS[hour.level] ?? '—'
              const isPeak = analysis?.peakHour?.time === hour.time
              const isSafest = analysis?.safestHour?.time === hour.time && hour.level !== 'very_high' && hour.level !== 'extreme'

              // Check if this is the current hour
              const [hStr] = hour.time.split(':')
              const hourNum = parseInt(hStr, 10)
              const isNow = !isNaN(hourNum) && hourNum === currentHour

              const barWidth = `${Math.max(4, hour.riskScore)}%`

              return (
                <div
                  key={idx}
                  className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
                  style={{
                    background: isNow
                      ? `${theme.ringColor}12`
                      : isPeak
                      ? `${theme.ringColor}08`
                      : 'var(--bg-elevated)',
                    border: isNow
                      ? `1px solid ${theme.ringColor}40`
                      : '1px solid transparent',
                  }}
                >
                  {/* Time */}
                  <div className="w-12 flex-shrink-0 text-right">
                    <span
                      className="font-mono text-xs font-bold"
                      style={{ color: isNow ? theme.ringColor : 'var(--text-tertiary)' }}
                    >
                      {hour.time}
                    </span>
                  </div>

                  {/* Emoji indicator */}
                  <span className="text-sm flex-shrink-0 w-5 text-center">{emoji}</span>

                  {/* Risk bar */}
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: barWidth,
                        background: `linear-gradient(90deg, ${theme.ringColor}60, ${theme.ringColor})`,
                      }}
                    />
                  </div>

                  {/* Score */}
                  <span className="font-mono text-xs font-bold w-8 text-right" style={{ color: theme.ringColor }}>
                    {hour.riskScore}
                  </span>

                  {/* Label badges */}
                  <div className="w-24 flex-shrink-0">
                    {isNow && (
                      <span
                        className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full"
                        style={{ background: `${theme.ringColor}20`, color: theme.ringColor }}
                      >
                        <span className="size-1.5 rounded-full animate-live-pulse" style={{ background: theme.ringColor }} />
                        NOW
                      </span>
                    )}
                    {!isNow && isPeak && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                        🔥 PEAK
                      </span>
                    )}
                    {!isNow && !isPeak && isSafest && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>
                        🟢 SAFE
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 pt-3 border-t flex flex-wrap gap-3" style={{ borderColor: 'var(--border-subtle)' }}>
          {[
            { emoji: '🟢', label: 'Low' },
            { emoji: '🟡', label: 'Moderate' },
            { emoji: '🟠', label: 'High' },
            { emoji: '🔴', label: 'Very High' },
            { emoji: '🆘', label: 'Extreme' },
          ].map(item => (
            <span key={item.label} className="text-[10px] font-semibold flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
              {item.emoji} {item.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
