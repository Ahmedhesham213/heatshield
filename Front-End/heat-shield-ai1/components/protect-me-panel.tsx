'use client'

import { useState, useEffect } from 'react'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Bell,
  BellOff,
  MapPin,
  Thermometer,
  Droplets,
  Snowflake,
  AlertTriangle,
  Loader2,
  Navigation,
  TrendingDown,
  Zap,
} from 'lucide-react'
import { type LiveHeatState } from '@/hooks/use-live-heat-protection'
import { type NearbySaferResponse } from '@/services/api'
import { formatTempUnit, getRiskTheme, type TempUnit } from '@/utils/risk-theme'

type ProtectMePanelProps = {
  protection: LiveHeatState
  tempUnit: TempUnit
}

// ── Pulsing shield indicator ─────────────────────────────────────────
function ProtectShieldIcon({ active, riskScore }: { active: boolean; riskScore: number }) {
  const color = !active
    ? 'var(--text-tertiary)'
    : riskScore >= 60
    ? '#f87171'
    : '#4ade80'
  return (
    <div className="relative flex items-center justify-center" style={{ width: 52, height: 52 }}>
      {active && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: riskScore >= 60 ? 'rgba(248,113,113,0.25)' : 'rgba(74,222,128,0.2)' }}
        />
      )}
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 52,
          height: 52,
          background: active
            ? riskScore >= 60
              ? 'rgba(248,113,113,0.15)'
              : 'rgba(74,222,128,0.12)'
            : 'var(--bg-elevated)',
          border: `2px solid ${color}`,
          transition: 'all 0.4s ease',
        }}
      >
        {active ? (
          riskScore >= 60 ? (
            <ShieldAlert style={{ color, width: 26, height: 26 }} />
          ) : (
            <ShieldCheck style={{ color, width: 26, height: 26 }} />
          )
        ) : (
          <Shield style={{ color, width: 26, height: 26 }} />
        )}
      </div>
    </div>
  )
}

// ── Live status card ─────────────────────────────────────────────────
function LiveStatusCard({
  liveState,
  tempUnit,
}: {
  liveState: LiveHeatState
  tempUnit: TempUnit
}) {
  const { liveData, liveLoading, liveError, currentGpsPos, isOutsideUS } = liveState
  const score = liveData?.current.riskScore ?? 0
  const theme = getRiskTheme(liveData?.current.riskLevel ?? 'unknown')
  const peakHours = liveData?.persistenceDetail.highRiskHours ?? 0

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--accent-cyan)' }}>
          🛡️ Live Heat Status
        </span>
        {liveLoading && <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--text-tertiary)' }} />}
      </div>

      {isOutsideUS && (
        <p className="text-xs font-semibold" style={{ color: '#fb923c' }}>
          ⚠️ FortyGuard covers US only. Move to a US location for live protection.
        </p>
      )}

      {liveError && !isOutsideUS && (
        <p className="text-xs font-semibold" style={{ color: '#f87171' }}>
          {liveError}
        </p>
      )}

      {currentGpsPos && !isOutsideUS && (
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          <MapPin className="size-3.5" style={{ color: 'var(--accent-cyan)' }} />
          <span className="font-mono">
            {currentGpsPos.lat.toFixed(4)}° N · {Math.abs(currentGpsPos.lon).toFixed(4)}° W
          </span>
        </div>
      )}

      {liveData && !isOutsideUS && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Thermometer className="size-3" style={{ color: 'var(--accent-cyan)' }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Temp</span>
              </div>
              <p className="font-mono text-lg font-black" style={{ color: 'var(--text-primary)' }}>
                {formatTempUnit(liveData.current.temperature, tempUnit, 0)}
              </p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Droplets className="size-3" style={{ color: '#38bdf8' }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Feels Like</span>
              </div>
              <p className="font-mono text-lg font-black" style={{ color: 'var(--text-primary)' }}>
                {formatTempUnit(liveData.current.feelsLike, tempUnit, 0)}
              </p>
            </div>
          </div>

          {/* Risk Score */}
          <div
            className="rounded-xl p-4 flex items-center justify-between"
            style={{
              background: `${theme.bgColor}12`,
              border: `1px solid ${theme.borderColor}30`,
            }}
          >
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: theme.color }}>
                {theme.icon} {theme.label}
              </p>
              <p className="font-mono text-2xl font-black" style={{ color: theme.color }}>
                {score}<span className="text-sm font-bold opacity-60"> / 100</span>
              </p>
            </div>
            <div className="text-right">
              {peakHours > 0 && (
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  ⚠️ High heat expected
                  <br />
                  <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>next {peakHours}h</span>
                </p>
              )}
            </div>
          </div>

          {/* Recommendation snippet */}
          {liveData.recommendation && (
            <p className="text-xs font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              💡 {liveData.recommendation.slice(0, 120)}{liveData.recommendation.length > 120 ? '…' : ''}
            </p>
          )}
        </>
      )}

      {!liveData && !liveLoading && !liveError && (
        <p className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
          Waiting for GPS signal…
        </p>
      )}
    </div>
  )
}

// ── Find cooler area result card ──────────────────────────────────────
function CoolerAreaCard({ data }: { data: NearbySaferResponse }) {
  const reduction = data.base_temp_c > 0
    ? Math.round(((data.base_temp_c - data.safer_temp_c) / data.base_temp_c) * 100)
    : 0
  return (
    <div
      className="rounded-2xl p-5 space-y-3"
      style={{
        background: 'rgba(74,222,128,0.06)',
        border: '1px solid rgba(74,222,128,0.25)',
      }}
    >
      <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#4ade80' }}>
        🧊 Cooler Area Found
      </p>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>Current Area</p>
          <p className="font-mono font-bold" style={{ color: '#f87171' }}>{data.base_temp_c.toFixed(1)}°C</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-tertiary)' }}>Recommended</p>
          <p className="font-mono font-bold" style={{ color: '#4ade80' }}>{data.safer_temp_c.toFixed(1)}°C</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="size-4" style={{ color: '#4ade80' }} />
          <span className="text-sm font-bold" style={{ color: '#4ade80' }}>
            {reduction}% heat exposure reduction
          </span>
        </div>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {data.direction} · {Math.round(data.distance_m)}m
        </span>
      </div>
      {data.maps_url && (
        <a
          href={data.maps_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-bold"
          style={{ color: 'var(--accent-cyan)' }}
        >
          <Navigation className="size-3" />
          View on Google Maps
        </a>
      )}
    </div>
  )
}

// ── Notification permission card ─────────────────────────────────────
function NotifPermissionCard({ permission, onRequest }: { permission: NotificationPermission | 'unsupported'; onRequest: () => Promise<boolean> }) {
  const [loading, setLoading] = useState(false)
  if (permission === 'granted' || permission === 'unsupported') return null

  return (
    <div
      className="rounded-2xl p-5 space-y-3"
      style={{
        background: 'rgba(250,204,21,0.06)',
        border: '1px solid rgba(250,204,21,0.2)',
      }}
    >
      <div className="flex items-center gap-2">
        <Bell className="size-4" style={{ color: '#facc15' }} />
        <span className="text-sm font-bold" style={{ color: '#facc15' }}>Enable Heat Alerts</span>
      </div>
      <p className="text-xs font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Allow browser notifications to receive automatic heat warnings when risk reaches dangerous levels.
        <br />
        <span className="mt-1 inline-block text-[10px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
          🔐 Location is used only to determine heat conditions at your position.
        </span>
      </p>
      <button
        onClick={async () => { setLoading(true); await onRequest(); setLoading(false) }}
        disabled={loading || permission === 'denied'}
        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all disabled:opacity-50"
        style={{ background: '#facc15', color: '#0f0f0f' }}
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
        {permission === 'denied' ? 'Blocked by browser — enable in settings' : 'Allow Notifications'}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// PROTECT ME PANEL (main export)
// ═══════════════════════════════════════════════════════════════════
export function ProtectMePanel({ protection, tempUnit }: ProtectMePanelProps) {
  const {
    isProtecting,
    setIsProtecting,
    liveData,
    liveLoading,
    notifPermission,
    requestNotifPermission,
    coolerArea,
    coolerAreaLoading,
    findCoolerArea,
    currentGpsPos,
  } = protection

  const score = liveData?.current.riskScore ?? 0

  const statusLabel = !isProtecting
    ? 'HeatShield protection is off'
    : score >= 60
    ? '🔴 High heat detected — Take precautions'
    : '🟢 HeatShield is protecting you'

  const statusColor = !isProtecting
    ? 'var(--text-tertiary)'
    : score >= 60
    ? '#f87171'
    : '#4ade80'

  return (
    <section
      id="protect-me"
      className="hs-card overflow-hidden"
      style={{ border: isProtecting && score >= 60 ? '1px solid rgba(248,113,113,0.35)' : undefined }}
    >
      {/* Header */}
      <div
        className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: isProtecting
            ? score >= 60
              ? 'linear-gradient(135deg, rgba(248,113,113,0.08) 0%, transparent 60%)'
              : 'linear-gradient(135deg, rgba(74,222,128,0.06) 0%, transparent 60%)'
            : undefined,
        }}
      >
        <div className="flex items-center gap-4">
          <ProtectShieldIcon active={isProtecting} riskScore={score} />
          <div>
            <h2 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              🛡️ Protect Me Mode
            </h2>
            <p className="text-xs font-semibold mt-0.5 transition-colors" style={{ color: statusColor }}>
              {statusLabel}
            </p>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setIsProtecting(!isProtecting)}
          className="relative flex items-center gap-3 rounded-2xl px-5 py-3 font-bold text-sm transition-all"
          style={{
            background: isProtecting
              ? score >= 60
                ? 'rgba(248,113,113,0.18)'
                : 'rgba(74,222,128,0.15)'
              : 'var(--bg-elevated)',
            border: `2px solid ${isProtecting ? (score >= 60 ? '#f87171' : '#4ade80') : 'var(--border-default)'}`,
            color: isProtecting ? (score >= 60 ? '#f87171' : '#4ade80') : 'var(--text-secondary)',
            minWidth: 160,
            boxShadow: isProtecting ? `0 0 20px ${score >= 60 ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.15)'}` : undefined,
          }}
        >
          {isProtecting ? (
            <>
              {liveLoading
                ? <Loader2 className="size-4 animate-spin" />
                : <ShieldCheck className="size-4" />}
              Protection ON
            </>
          ) : (
            <>
              <Shield className="size-4" />
              Enable Protection
            </>
          )}
        </button>
      </div>

      <div className="p-6 space-y-5">
        {/* Not protecting — explainer */}
        {!isProtecting && (
          <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
              When enabled, HeatShield will:
            </p>
            <ul className="space-y-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {[
                { icon: '📍', text: 'Track your GPS location continuously' },
                { icon: '🌡️', text: 'Monitor heat risk at your current position' },
                { icon: '🔔', text: 'Send browser notifications on high risk' },
                { icon: '🧊', text: 'Find cooler areas nearby when needed' },
                { icon: '⚠️', text: 'Alert you before entering dangerous heat zones' },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-2">
                  <span>{item.icon}</span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              🔐 Location data is used only for heat-risk analysis and is never stored.
            </p>
          </div>
        )}

        {/* Active — Live Status Card */}
        {isProtecting && (
          <LiveStatusCard liveState={protection} tempUnit={tempUnit} />
        )}

        {/* Notification Permission */}
        {isProtecting && (
          <NotifPermissionCard
            permission={notifPermission}
            onRequest={requestNotifPermission}
          />
        )}

        {/* Find Cooler Area */}
        {isProtecting && (currentGpsPos || liveData) && (
          <div className="space-y-3">
            <button
              onClick={findCoolerArea}
              disabled={coolerAreaLoading}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-all disabled:opacity-50"
              style={{
                background: 'rgba(56,189,248,0.1)',
                border: '1px solid rgba(56,189,248,0.25)',
                color: 'var(--accent-cyan)',
              }}
            >
              {coolerAreaLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Snowflake className="size-4" />
              )}
              {coolerAreaLoading ? 'Scanning nearby areas…' : '🧊 Find a Cooler Area'}
            </button>
            {coolerArea && (
              coolerArea.is_meaningfully_cooler ? (
                <CoolerAreaCard data={coolerArea} />
              ) : (
                <div
                  className="rounded-2xl p-4 text-xs font-semibold"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  No significantly cooler area found within 500m. Current conditions are relatively uniform nearby.
                </div>
              )
            )}
          </div>
        )}

        {/* Disabled notification notice */}
        {notifPermission === 'granted' && isProtecting && (
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: '#4ade80' }}>
            <Bell className="size-3.5" />
            Browser notifications enabled — you will be alerted on high heat.
          </div>
        )}
      </div>
    </section>
  )
}
