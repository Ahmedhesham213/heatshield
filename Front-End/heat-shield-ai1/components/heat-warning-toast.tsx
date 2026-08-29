'use client'

import { useEffect, useState } from 'react'
import { X, AlertTriangle, Thermometer, Droplets, ShieldAlert } from 'lucide-react'
import { formatTempUnit, getRiskTheme, type TempUnit } from '@/utils/risk-theme'
import { type HeatRiskResponse } from '@/services/api'

type HeatWarningToastProps = {
  heatData: HeatRiskResponse | null
  tempUnit: TempUnit
  /** If true, also show warning even at lower thresholds */
  isLiveProtecting?: boolean
}

// Toast appears when risk >= this value
const WARN_THRESHOLD = 60
// Auto-dismiss after this many ms
const AUTO_DISMISS_MS = 10_000
// After dismissing, don't re-show for this many ms
const REDISPLAY_COOLDOWN_MS = 10 * 60 * 1000

export function HeatWarningToast({ heatData, tempUnit, isLiveProtecting = false }: HeatWarningToastProps) {
  const [visible, setVisible] = useState(false)
  const [dismissedAt, setDismissedAt] = useState<number>(0)
  const [autoDismissTimer, setAutoDismissTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const score = heatData?.current.riskScore ?? 0
  const level = heatData?.current.riskLevel ?? 'unknown'
  const temp = heatData?.current.temperature
  const feelsLike = heatData?.current.feelsLike
  const theme = getRiskTheme(level)

  const shouldShow = score >= WARN_THRESHOLD && heatData !== null

  useEffect(() => {
    if (!shouldShow) {
      setVisible(false)
      if (autoDismissTimer) clearTimeout(autoDismissTimer)
      return
    }
    // Respect cooldown after manual dismiss
    if (dismissedAt && Date.now() - dismissedAt < REDISPLAY_COOLDOWN_MS) return

    setVisible(true)

    // Auto-dismiss after 10s
    const timer = setTimeout(() => {
      setVisible(false)
    }, AUTO_DISMISS_MS)
    setAutoDismissTimer(timer)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, shouldShow])

  const handleDismiss = () => {
    setVisible(false)
    setDismissedAt(Date.now())
    if (autoDismissTimer) clearTimeout(autoDismissTimer)
  }

  if (!visible || !heatData) return null

  const isExtreme = score >= 80

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-[calc(4.2rem+env(safe-area-inset-bottom,0px))] md:bottom-6 left-3 right-3 md:left-auto md:right-6 z-[9999] md:w-[380px] animate-slide-up"
    >
      <div
        className="relative rounded-2xl p-3.5 sm:p-4 shadow-2xl backdrop-blur-2xl overflow-hidden"
        style={{
          background: isExtreme
            ? 'linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(10,15,26,0.96) 70%)'
            : 'linear-gradient(135deg, rgba(251,146,60,0.18) 0%, rgba(10,15,26,0.96) 70%)',
          border: `1px solid ${isExtreme ? 'rgba(239,68,68,0.45)' : 'rgba(251,146,60,0.35)'}`,
          boxShadow: isExtreme
            ? '0 12px 36px rgba(239,68,68,0.3), 0 8px 32px rgba(0,0,0,0.6)'
            : '0 12px 32px rgba(251,146,60,0.25), 0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div
              className="flex-shrink-0 flex items-center justify-center rounded-lg"
              style={{
                width: 28,
                height: 28,
                background: isExtreme ? 'rgba(239,68,68,0.25)' : 'rgba(251,146,60,0.2)',
                border: `1px solid ${isExtreme ? 'rgba(239,68,68,0.4)' : 'rgba(251,146,60,0.35)'}`,
              }}
            >
              {isExtreme ? (
                <ShieldAlert style={{ width: 16, height: 16, color: '#ef4444' }} />
              ) : (
                <AlertTriangle style={{ width: 16, height: 16, color: '#fb923c' }} />
              )}
            </div>
            <p className="font-black text-xs leading-tight" style={{ color: '#fff' }}>
              {isExtreme ? '🆘 Extreme Heat Warning' : `⚠️ ${theme.label}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 font-mono font-black text-xs"
              style={{ background: `${theme.bgColor}35`, color: theme.color, border: `1px solid ${theme.borderColor}40` }}
            >
              {score}/100 Risk
            </span>
            <button
              onClick={handleDismiss}
              className="flex items-center justify-center rounded-lg p-1 transition-all hover:bg-white/20"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
              aria-label="Dismiss warning"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Stats & Short Advice */}
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
          <span className="flex items-center gap-1">
            <Thermometer className="size-3" style={{ color: 'var(--accent-cyan)' }} />
            <strong className="font-mono">{formatTempUnit(temp, tempUnit, 0)}</strong>
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Droplets className="size-3" style={{ color: '#38bdf8' }} />
            Feels <strong className="font-mono">{formatTempUnit(feelsLike, tempUnit, 0)}</strong>
          </span>
          <span>·</span>
          <span className="text-[11px] font-normal" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Avoid direct sunlight
          </span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          <button
            onClick={() => {
              handleDismiss()
              const el = document.getElementById('protect-me')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
            className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all"
            style={{ background: 'rgba(255,255,255,0.14)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.22)' }}
          >
            🛡️ Protect Me
          </button>

          <button
            onClick={() => {
              handleDismiss()
              const el = document.getElementById('routes')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
            className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all"
            style={{ background: isExtreme ? '#ef4444' : '#fb923c', color: '#ffffff' }}
          >
            🧊 Cooler Area
          </button>
        </div>

        {/* Auto-dismiss progress bar */}
        <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="h-full rounded-full"
            style={{
              background: isExtreme ? '#ef4444' : '#fb923c',
              animation: `shrinkWidth ${AUTO_DISMISS_MS}ms linear forwards`,
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
}
