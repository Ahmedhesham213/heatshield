'use client'

import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { getRiskTheme } from '@/utils/risk-theme'

type HeatMapProps = {
  latitude: number
  longitude: number
  currentTemp?: number
  saferTemp?: number
  riskLevel?: string
  onSelect?: (latitude: number, longitude: number) => void
}

function ClickHandler({ onSelect }: { onSelect?: HeatMapProps['onSelect'] }) {
  useMapEvents({
    click: (event) => onSelect?.(event.latlng.lat, event.latlng.lng),
  })
  return null
}

function Recenter({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([latitude, longitude], 14, { animate: true, duration: 0.6 })
  }, [latitude, longitude, map])
  return null
}

export function HeatMap({ latitude, longitude, currentTemp = 32, saferTemp = 28, riskLevel = 'unknown', onSelect }: HeatMapProps) {
  const theme = getRiskTheme(riskLevel)

  // Custom "YOU ARE HERE" marker — risk-colored pulse ring
  const userMarkerIcon = useMemo(
    () =>
      L.divIcon({
        className: 'user-location-pin',
        html: `<div style="position:relative; display:flex; flex-direction:column; align-items:center; gap:4px;">
          <div style="
            position:relative;
            width:16px;
            height:16px;
            border-radius:50%;
            background:${theme.ringColor};
            border:3px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.35);
            z-index:2;
          ">
            <div style="
              position:absolute;
              top:-6px; left:-6px;
              width:28px; height:28px;
              border-radius:50%;
              background:${theme.ringColor}30;
              animation:heat-pulse 2.2s ease-out infinite;
            "></div>
          </div>
          <div style="
            background:${theme.ringColor};
            color:white;
            padding:3px 8px;
            border-radius:999px;
            font-weight:800;
            font-size:10px;
            border:2px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
            white-space:nowrap;
          ">📍 YOU ARE HERE</div>
        </div>`,
        iconSize: [100, 52],
        iconAnchor: [50, 10],
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [riskLevel, theme.ringColor]
  )

  // Estimated thermal micro-zone circles (hard-coded offsets around selected point)
  // IMPORTANT: These are ESTIMATED / REPRESENTATIVE visualizations.
  // They are NOT actual measured FortyGuard spatial data.
  const tempZones = useMemo(() => {
    const offsets = [
      { dLat: 0.002, dLon: 0.002, label: 'Park Shade Zone (est.)', tempDelta: -2.8, color: '#3b82f6' },
      { dLat: -0.002, dLon: -0.003, label: 'Waterbody Micro-zone (est.)', tempDelta: -3.5, color: '#10b981' },
      { dLat: 0.003, dLon: -0.001, label: 'Urban Canopy Zone (est.)', tempDelta: -1.2, color: '#eab308' },
      { dLat: -0.003, dLon: 0.002, label: 'Asphalt & Main Street (est.)', tempDelta: 2.1, color: '#f97316' },
      { dLat: 0.001, dLon: -0.004, label: 'High Density Concrete (est.)', tempDelta: 3.4, color: '#dc2626' },
    ]

    return offsets.map((offset) => ({
      lat: latitude + offset.dLat,
      lon: longitude + offset.dLon,
      temp: Math.round((currentTemp + offset.tempDelta) * 10) / 10,
      label: offset.label,
      color: offset.color,
    }))
  }, [latitude, longitude, currentTemp])

  return (
    <div className="relative h-full w-full min-h-[320px] overflow-hidden rounded-2xl border border-border/60">
      <MapContainer
        center={[latitude, longitude]}
        zoom={14}
        scrollWheelZoom
        className="h-full w-full z-10"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onSelect={onSelect} />
        <Recenter latitude={latitude} longitude={longitude} />

        {/* Thermal halo — risk-level colored glow around selected point */}
        <Circle
          center={[latitude, longitude]}
          radius={180}
          pathOptions={{
            color: theme.ringColor,
            fillColor: theme.ringColor,
            fillOpacity: 0.12,
            weight: 2,
            dashArray: '4 4',
          }}
        />
        <Circle
          center={[latitude, longitude]}
          radius={90}
          pathOptions={{
            color: theme.ringColor,
            fillColor: theme.ringColor,
            fillOpacity: 0.18,
            weight: 0,
          }}
        />

        {/* User Location Marker */}
        <Marker position={[latitude, longitude]} icon={userMarkerIcon}>
          <Popup>
            <div className="p-1 font-sans">
              <p className="font-bold text-xs text-foreground">📍 YOU ARE HERE</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                {latitude.toFixed(4)}, {longitude.toFixed(4)}
              </p>
              <p className="text-xs font-bold mt-1" style={{ color: theme.ringColor }}>
                Current: {currentTemp}°C
              </p>
            </div>
          </Popup>
        </Marker>

        {/* Estimated thermal micro-zone overlays */}
        {tempZones.map((zone, idx) => (
          <Circle
            key={idx}
            center={[zone.lat, zone.lon]}
            radius={200}
            pathOptions={{
              color: zone.color,
              fillColor: zone.color,
              fillOpacity: 0.28,
              weight: 1.5,
            }}
          >
            <Popup>
              <div className="p-1 font-sans">
                <p className="font-bold text-xs">{zone.label}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 italic">Representative estimate</p>
                <p className="text-xs font-extrabold mt-0.5" style={{ color: zone.color }}>
                  Est. Temp: {zone.temp}°C
                </p>
              </div>
            </Popup>
          </Circle>
        ))}
      </MapContainer>

      {/* Map Legend — clearly labeled as estimated */}
      <div className="absolute bottom-3 left-3 z-20 rounded-xl border border-border/80 bg-background/95 p-2.5 shadow-xl backdrop-blur-md text-[10px] font-bold max-w-[200px]">
        <p className="text-muted-foreground uppercase tracking-wider text-[9px] mb-1.5 border-b border-border/60 pb-1">
          Estimated Thermal Visualization
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-blue-500" /> Cool (&lt;28°C)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" /> Comfort
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-yellow-500" /> Warm
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-orange-500" /> Hot
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-red-600" /> Very Hot
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[11px]">📍</span> You
          </span>
        </div>
        <p className="mt-1.5 text-[8px] text-muted-foreground/70 italic leading-tight">
          Zones are representative estimates, not measured FortyGuard data.
        </p>
      </div>
    </div>
  )
}
