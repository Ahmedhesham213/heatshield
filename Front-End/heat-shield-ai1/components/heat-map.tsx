'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { formatTempUnit, getRiskTheme, TempUnit } from '@/utils/risk-theme'
import { getHeatRisk, getNearbySafer, isUSLocation, type HeatRiskResponse, type NearbySaferResponse } from '@/services/api'
import { Loader2, Snowflake, Navigation } from 'lucide-react'

export type MapLayerMode = 'risk' | 'temp' | 'feels_like' | 'forecast'

type ClickedSpot = {
  lat: number
  lon: number
  data: HeatRiskResponse | null
  loading: boolean
  error: string | null
}

type HeatMapProps = {
  latitude: number
  longitude: number
  currentTemp?: number
  feelsLikeTemp?: number
  saferTemp?: number
  riskLevel?: string
  riskScore?: number
  tempUnit?: TempUnit
  onSelect?: (latitude: number, longitude: number) => void
}

// ── Map sub-components ────────────────────────────────────────────────
function Recenter({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([latitude, longitude], 14, { animate: true, duration: 0.6 })
  }, [latitude, longitude, map])
  return null
}

function ClickPopupHandler({
  onSelect,
  tempUnit,
  onSpotData,
}: {
  onSelect?: HeatMapProps['onSelect']
  tempUnit: TempUnit
  onSpotData: (spot: ClickedSpot) => void
}) {
  useMapEvents({
    click: async (event) => {
      const { lat, lng } = event.latlng
      onSelect?.(lat, lng)
      if (!isUSLocation(lat, lng)) {
        onSpotData({ lat, lon: lng, data: null, loading: false, error: 'FortyGuard only covers US locations.' })
        return
      }
      onSpotData({ lat, lon: lng, data: null, loading: true, error: null })
      try {
        const data = await getHeatRisk(lat, lng)
        onSpotData({ lat, lon: lng, data, loading: false, error: null })
      } catch {
        onSpotData({ lat, lon: lng, data: null, loading: false, error: 'Failed to fetch data for this location.' })
      }
    },
  })
  return null
}

function ClickedSpotMarker({ spot, tempUnit }: { spot: ClickedSpot; tempUnit: TempUnit }) {
  const [markerRef, setMarkerRef] = useState<L.Marker | null>(null)

  useEffect(() => {
    markerRef?.openPopup()
  }, [spot, markerRef])

  const theme = getRiskTheme(spot.data?.current.riskLevel ?? 'unknown')

  const icon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#38bdf8;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    []
  )

  return (
    <Marker position={[spot.lat, spot.lon]} icon={icon} ref={(ref) => setMarkerRef(ref)}>
      <Popup autoPan>
        <div style={{ fontFamily: 'sans-serif', minWidth: 180, padding: '4px 2px' }}>
          <p style={{ fontWeight: 800, fontSize: 11, color: '#0f172a', marginBottom: 4 }}>
            📍 {spot.lat.toFixed(4)}° N · {Math.abs(spot.lon).toFixed(4)}° W
          </p>

          {spot.loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 11 }}>
              ⏳ Fetching heat data…
            </div>
          )}

          {spot.error && (
            <p style={{ color: '#ef4444', fontSize: 11 }}>{spot.error}</p>
          )}

          {spot.data && !spot.loading && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 2 }}>Temperature</p>
                  <p style={{ fontWeight: 800, fontSize: 15, fontFamily: 'monospace', color: '#0f172a' }}>
                    {formatTempUnit(spot.data.current.temperature, tempUnit, 1)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 2 }}>Feels Like</p>
                  <p style={{ fontWeight: 800, fontSize: 15, fontFamily: 'monospace', color: '#0f172a' }}>
                    {formatTempUnit(spot.data.current.feelsLike, tempUnit, 1)}
                  </p>
                </div>
              </div>

              <div style={{ padding: '6px 8px', borderRadius: 8, background: `${theme.bgColor}18`, border: `1px solid ${theme.borderColor}40`, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: 12, color: theme.color }}>
                    {theme.icon} {theme.label}
                  </span>
                  <span style={{ fontWeight: 900, fontSize: 13, fontFamily: 'monospace', color: theme.color }}>
                    {spot.data.current.riskScore}/100
                  </span>
                </div>
              </div>

              {spot.data.peak.time && spot.data.peak.time !== '--:--' && (
                <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>
                  ⏰ Peak: {spot.data.peak.time}
                </p>
              )}
            </>
          )}
        </div>
      </Popup>
    </Marker>
  )
}

// ── Main HeatMap ──────────────────────────────────────────────────────
export function HeatMap({
  latitude,
  longitude,
  currentTemp = 32,
  feelsLikeTemp = 36,
  saferTemp = 28,
  riskLevel = 'unknown',
  riskScore = 55,
  tempUnit = 'C',
  onSelect,
}: HeatMapProps) {
  const [layerMode, setLayerMode] = useState<MapLayerMode>('risk')
  const [clickedSpot, setClickedSpot] = useState<ClickedSpot | null>(null)
  const [coolerArea, setCoolerArea] = useState<NearbySaferResponse | null>(null)
  const [coolerLoading, setCoolerLoading] = useState(false)
  const theme = getRiskTheme(riskLevel)

  const handleFindCooler = useCallback(async () => {
    if (!isUSLocation(latitude, longitude)) return
    setCoolerLoading(true)
    setCoolerArea(null)
    try {
      const data = await getNearbySafer(latitude, longitude, 500)
      setCoolerArea(data)
    } catch {
      // silently fail
    } finally {
      setCoolerLoading(false)
    }
  }, [latitude, longitude])

  const userMarkerIcon = useMemo(
    () =>
      L.divIcon({
        className: 'user-location-pin',
        html: `<div style="position:relative; display:flex; flex-direction:column; align-items:center; gap:4px;">
          <div style="position:relative;width:18px;height:18px;border-radius:50%;background:${theme.ringColor};border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.4);z-index:2;">
            <div style="position:absolute;top:-7px;left:-7px;width:32px;height:32px;border-radius:50%;background:${theme.ringColor}35;animation:heat-pulse 2s ease-out infinite;"></div>
          </div>
          <div style="background:${theme.ringColor};color:white;padding:3px 10px;border-radius:999px;font-weight:800;font-size:10px;border:2px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3);white-space:nowrap;">📍 YOU ARE HERE</div>
        </div>`,
        iconSize: [110, 56],
        iconAnchor: [55, 12],
      }),
    [riskLevel, theme.ringColor]
  )

  const hotspots = useMemo(() => [
    {
      id: 'hotspot-1',
      lat: latitude + 0.0035,
      lon: longitude + 0.002,
      name: 'Downtown Commercial Corridor',
      tempC: currentTemp + 3.2,
      risk: Math.min(100, riskScore + 18),
      level: 'very_high',
      type: 'Asphalt & High Dense Concrete',
    },
    {
      id: 'hotspot-2',
      lat: latitude - 0.003,
      lon: longitude - 0.0025,
      name: 'Riverfront Oasis & Canopy',
      tempC: Math.max(18, currentTemp - 3.8),
      risk: Math.max(10, riskScore - 25),
      level: 'low',
      type: 'Cooling Micro-zone (Water & Trees)',
    },
    {
      id: 'hotspot-3',
      lat: latitude + 0.0015,
      lon: longitude - 0.004,
      name: 'Industrial Park Micro-zone',
      tempC: currentTemp + 2.1,
      risk: Math.min(100, riskScore + 12),
      level: 'high',
      type: 'Roof Surface Radiation Area',
    },
  ], [latitude, longitude, currentTemp, riskScore])

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-border/60" style={{ height: '440px', minHeight: '440px' }}>
      {/* Responsive Top Control Bar */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-[1000] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pointer-events-none">
        {/* Layer Switcher */}
        <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto max-w-full rounded-xl p-1 shadow-2xl backdrop-blur-md" style={{ background: 'rgba(15,23,42,0.88)', border: '1px solid rgba(255,255,255,0.15)' }}>
          {[
            { id: 'risk', label: 'Heat Risk 🔥' },
            { id: 'temp', label: 'Temp 🌡️' },
            { id: 'feels_like', label: 'Feels 💧' },
            { id: 'forecast', label: 'Peak 📈' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setLayerMode(m.id as MapLayerMode)}
              className="rounded-lg px-2.5 py-1 text-[10px] sm:text-[11px] font-extrabold transition-all whitespace-nowrap"
              style={{
                background: layerMode === m.id ? 'var(--accent-cyan)' : 'transparent',
                color: layerMode === m.id ? '#080b10' : '#94a3b8',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Find Cooler Area */}
        <div className="pointer-events-auto flex flex-col items-end gap-1.5 self-end sm:self-auto">
          <button
            onClick={handleFindCooler}
            disabled={coolerLoading}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] sm:text-[11px] font-bold shadow-2xl backdrop-blur-md transition-all disabled:opacity-60"
            style={{ background: 'rgba(15,23,42,0.88)', border: '1px solid rgba(56,189,248,0.35)', color: '#38bdf8' }}
          >
            {coolerLoading ? <Loader2 className="size-3 animate-spin" /> : <Snowflake className="size-3" />}
            🧊 Find Cooler
          </button>

          {coolerArea && (
            <div
              className="rounded-xl p-2.5 text-[10px] sm:text-[11px] font-semibold shadow-2xl backdrop-blur-md max-w-[200px]"
              style={{ background: 'rgba(15,23,42,0.92)', border: '1px solid rgba(74,222,128,0.35)', color: '#f0fdf4' }}
            >
              {coolerArea.is_meaningfully_cooler ? (
                <>
                  <p className="font-black text-xs mb-1" style={{ color: '#4ade80' }}>🧊 Cooler Area Found</p>
                  <p>Current: <span className="font-mono font-bold">{coolerArea.base_temp_c.toFixed(1)}°C</span></p>
                  <p>Nearby: <span className="font-mono font-bold" style={{ color: '#4ade80' }}>{coolerArea.safer_temp_c.toFixed(1)}°C</span></p>
                  <p className="mt-0.5" style={{ color: '#94a3b8' }}>{coolerArea.direction} · {Math.round(coolerArea.distance_m)}m</p>
                  {coolerArea.maps_url && (
                    <a href={coolerArea.maps_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 mt-1 font-bold" style={{ color: '#38bdf8' }}>
                      <Navigation className="size-2.5" /> View on Maps
                    </a>
                  )}
                </>
              ) : (
                <p style={{ color: '#94a3b8' }}>No cooler area found within 500m.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <MapContainer
        center={[latitude, longitude]}
        zoom={14}
        scrollWheelZoom
        className="z-10"
        style={{ height: '100%', width: '100%', minHeight: '440px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickPopupHandler onSelect={onSelect} tempUnit={tempUnit} onSpotData={setClickedSpot} />
        <Recenter latitude={latitude} longitude={longitude} />

        <Circle
          center={[latitude, longitude]}
          radius={280}
          pathOptions={{
            color: theme.ringColor,
            fillColor: theme.ringColor,
            fillOpacity: layerMode === 'risk' ? 0.22 : 0.12,
            weight: 2,
            dashArray: '4 4',
          }}
        />

        <Marker position={[latitude, longitude]} icon={userMarkerIcon}>
          <Popup>
            <div style={{ fontFamily: 'sans-serif', minWidth: 160, padding: '4px 2px' }}>
              <p style={{ fontWeight: 800, fontSize: 11, color: '#0f172a', marginBottom: 4 }}>📍 YOU ARE HERE</p>
              <p style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', marginBottom: 8 }}>
                {latitude.toFixed(4)}°N · {Math.abs(longitude).toFixed(4)}°W
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800 }}>
                <span style={{ color: theme.ringColor }}>{formatTempUnit(currentTemp, tempUnit)}</span>
                <span style={{ color: '#64748b' }}>Risk {riskScore}/100</span>
              </div>
            </div>
          </Popup>
        </Marker>

        {clickedSpot && <ClickedSpotMarker spot={clickedSpot} tempUnit={tempUnit} />}

        {hotspots.map((spot) => {
          const spotTheme = getRiskTheme(spot.level)
          return (
            <React.Fragment key={spot.id}>
              <Circle
                center={[spot.lat, spot.lon]}
                radius={220}
                pathOptions={{
                  color: spotTheme.ringColor,
                  fillColor: spotTheme.ringColor,
                  fillOpacity: 0.25,
                  weight: 1.5,
                }}
              >
                <Popup>
                  <div style={{ fontFamily: 'sans-serif', minWidth: 150, padding: '4px 2px' }}>
                    <p style={{ fontWeight: 800, fontSize: 11, color: '#0f172a' }}>{spot.name}</p>
                    <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, marginBottom: 6 }}>{spot.type}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800 }}>
                      <span style={{ color: spotTheme.ringColor }}>{formatTempUnit(spot.tempC, tempUnit)}</span>
                      <span>Risk {spot.risk}/100</span>
                    </div>
                  </div>
                </Popup>
              </Circle>
            </React.Fragment>
          )
        })}
      </MapContainer>

      {/* Heat Risk Legend */}
      <div
        className="absolute bottom-3 left-3 z-[1000] rounded-xl p-3 shadow-2xl backdrop-blur-md hidden sm:block"
        style={{ background: 'rgba(10,17,35,0.90)', border: '1px solid rgba(255,255,255,0.12)', minWidth: 160 }}
      >
        <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>Heat Risk Legend</p>
        <div className="space-y-1.5">
          {[
            { color: '#4ade80', label: 'Low', range: '0–19' },
            { color: '#facc15', label: 'Moderate', range: '20–39' },
            { color: '#fb923c', label: 'High', range: '40–59' },
            { color: '#f87171', label: 'Very High', range: '60–79' },
            { color: '#ef4444', label: 'Extreme', range: '80–100' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="block rounded-full flex-shrink-0" style={{ width: 8, height: 8, background: item.color }} />
                <span className="text-[10px] font-bold" style={{ color: '#e2e8f0' }}>{item.label}</span>
              </div>
              <span className="font-mono text-[9px]" style={{ color: '#64748b' }}>{item.range}</span>
            </div>
          ))}
        </div>
        <p className="text-[9px] mt-2 pt-2 border-t" style={{ color: '#475569', borderColor: 'rgba(255,255,255,0.08)' }}>
          Click anywhere on map to view real heat data
        </p>
      </div>

      {/* Mobile Bottom-Sheet Modal for Clicked Spot */}
      {clickedSpot && (
        <div
          className="absolute bottom-2 left-2 right-2 z-[1000] p-4 rounded-2xl shadow-2xl backdrop-blur-xl border animate-slide-up sm:hidden"
          style={{ background: 'rgba(14,20,32,0.95)', borderColor: 'rgba(56,189,248,0.3)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">
              📍 Spot Analysis ({clickedSpot.lat.toFixed(3)}°, {clickedSpot.lon.toFixed(3)}°)
            </span>
            <button
              onClick={() => setClickedSpot(null)}
              className="text-xs font-bold text-slate-400 px-2 py-0.5"
            >
              ✕ Close
            </button>
          </div>

          {clickedSpot.loading ? (
            <div className="flex items-center gap-2 text-xs text-sky-400 py-2">
              <Loader2 className="size-4 animate-spin" /> Fetching hyper-local thermal data…
            </div>
          ) : clickedSpot.error ? (
            <p className="text-xs text-red-400 py-1 font-semibold">{clickedSpot.error}</p>
          ) : clickedSpot.data ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-2xl font-black text-slate-100">
                    {formatTempUnit(clickedSpot.data.current.temperature, tempUnit)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Feels like {formatTempUnit(clickedSpot.data.current.feelsLike, tempUnit)}
                  </p>
                </div>

                <div className="text-right">
                  <span
                    className="inline-block px-3 py-1 rounded-full text-xs font-black"
                    style={{
                      background: `${getRiskTheme(clickedSpot.data.current.riskLevel).ringColor}20`,
                      color: getRiskTheme(clickedSpot.data.current.riskLevel).ringColor,
                      border: `1px solid ${getRiskTheme(clickedSpot.data.current.riskLevel).ringColor}40`,
                    }}
                  >
                    {clickedSpot.data.current.riskLabel} · {clickedSpot.data.current.riskScore}/100
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                <span className="text-slate-400">Peak Heat: <strong className="text-amber-400">{clickedSpot.data.peak.time}</strong></span>
                <button
                  onClick={() => {
                    const el = document.getElementById('routes')
                    if (el) el.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="text-sky-400 font-bold text-xs"
                >
                  Navigate Here →
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
