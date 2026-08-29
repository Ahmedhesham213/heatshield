'use client'

import React, { useState } from 'react'
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Flame,
  Info,
  ShieldAlert,
  X,
} from 'lucide-react'
import { HeatRiskResponse } from '@/services/api'
import { getRiskTheme } from '@/utils/risk-theme'

type HeatAlertsCenterProps = {
  heatData: HeatRiskResponse | null
  notificationsEnabled: boolean
  setNotificationsEnabled: (enabled: boolean) => void
  onRequestNotificationPermission: () => Promise<boolean>
}

export function HeatAlertsCenter({
  heatData,
  notificationsEnabled,
  setNotificationsEnabled,
  onRequestNotificationPermission,
}: HeatAlertsCenterProps) {
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, boolean>>({})

  const riskScore = heatData?.current.riskScore ?? 0
  const peakTime = heatData?.peak.time ?? '--:--'
  const windowStart = heatData?.peak.windowStart ?? '--:--'

  // Generate dynamic system alerts based on backend risk snapshot
  const alerts = [
    {
      id: 'peak-alert',
      type: 'warning',
      icon: Flame,
      title: 'Peak Heat Window Advisory',
      time: `Expected ${windowStart !== '--:--' ? windowStart : peakTime}`,
      message: `Peak temperature of ${heatData?.peak.temperature ?? 0}°C will be reached at ${peakTime}. Limit sun exposure.`,
      color: '#fb923c',
      showIf: riskScore >= 50,
    },
    {
      id: 'risk-trend',
      type: 'alert',
      icon: AlertTriangle,
      title: 'Thermal Severity Alert',
      time: 'Current Snapshot',
      message: `Thermal severity score is ${heatData?.riskFactors.temperature ?? 0}/100. Hydration interval set to 20 minutes.`,
      color: '#f87171',
      showIf: riskScore >= 65,
    },
    {
      id: 'safe-window',
      type: 'success',
      icon: CheckCircle2,
      title: 'Safer Outdoor Window',
      time: 'Evening / Early Morning',
      message: 'Lower thermal risk conditions expected after 6:00 PM.',
      color: '#4ade80',
      showIf: true,
    },
  ].filter((a) => a.showIf && !dismissedAlerts[a.id])

  const handleToggleNotifications = async () => {
    if (!notificationsEnabled) {
      const ok = await onRequestNotificationPermission()
      if (ok) setNotificationsEnabled(true)
    } else {
      setNotificationsEnabled(false)
    }
  }

  return (
    <section id="alerts" className="hs-card p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bell className="size-4" style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Smart Alert Center
            </span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Real-Time Heat Alerts & Push Notifications
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Stay informed about approaching heat thresholds and optimal outdoor windows
          </p>
        </div>

        <button
          onClick={handleToggleNotifications}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border"
          style={{
            background: notificationsEnabled ? 'rgba(56,189,248,0.12)' : 'var(--bg-elevated)',
            borderColor: notificationsEnabled ? 'var(--accent-cyan)' : 'var(--border-subtle)',
            color: notificationsEnabled ? 'var(--accent-cyan)' : 'var(--text-secondary)',
          }}
        >
          {notificationsEnabled ? (
            <>
              <Bell className="size-3.5" />
              Notifications Active
            </>
          ) : (
            <>
              <BellOff className="size-3.5" />
              Enable Browser Alerts
            </>
          )}
        </button>
      </div>

      {/* Alert Cards Stack */}
      <div className="space-y-3">
        {alerts.length > 0 ? (
          alerts.map((alert) => {
            const Icon = alert.icon
            return (
              <div
                key={alert.id}
                className="flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all"
                style={{
                  background: `${alert.color}08`,
                  borderColor: `${alert.color}25`,
                }}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className="grid size-9 place-items-center rounded-xl flex-shrink-0 mt-0.5"
                    style={{ background: `${alert.color}18` }}
                  >
                    <Icon className="size-4" style={{ color: alert.color }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: alert.color }}>
                        {alert.title}
                      </span>
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                        • {alert.time}
                      </span>
                    </div>
                    <p className="text-xs font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {alert.message}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setDismissedAlerts((prev) => ({ ...prev, [alert.id]: true }))}
                  className="text-tertiary hover:text-primary transition-colors p-1"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )
          })
        ) : (
          <div className="p-6 text-center text-xs text-tertiary rounded-2xl" style={{ background: 'var(--bg-elevated)' }}>
            No active high-risk alerts for your current location. Conditions are stable.
          </div>
        )}
      </div>
    </section>
  )
}
