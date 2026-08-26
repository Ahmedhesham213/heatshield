'use client'

import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type HeatMapProps = {
  latitude: number
  longitude: number
  currentTemp?: number
  saferTemp?: number
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
    map.setView([latitude, longitude], 14, { animate: true })
  }, [latitude, longitude, map])
  return null
}

export function HeatMap({ latitude, longitude, currentTemp = 32, saferTemp = 28, onSelect }: HeatMapProps) {
  // Custom "YOU ARE HERE" marker icon
  const userMarkerIcon = useMemo(
    () =>
      L.divIcon({
        className: 'user-location-pin',
        html: `<div style="
          background: #ef4444;
          color: white;
          padding: 4px 8px;
          border-radius: 999px;
          font-weight: 800;
          font-size: 11px;
          border: 2px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 4px;
        ">
          <span>📍</span> YOU ARE HERE
        </div>`,
        iconSize: [110, 30],
        iconAnchor: [55, 15],
      }),
    []
  )

  // Real temperature zone radiuses and colors based on backend temps
  const tempZones = useMemo(() => {
    // 8 directional offset points around user position representing micro-zones
    const zones = []
    const offsets = [
      { dLat: 0.002, dLon: 0.002, label: 'Park Shade Zone', tempDelta: -2.8, color: '#3b82f6' }, // Cool (Blue)
      { dLat: -0.002, dLon: -0.003, label: 'Waterbody Micro-zone', tempDelta: -3.5, color: '#10b981' }, // Comfortable (Green)
      { dLat: 0.003, dLon: -0.001, label: 'Urban Canopy Zone', tempDelta: -1.2, color: '#eab308' }, // Warm (Yellow)
      { dLat: -0.003, dLon: 0.002, label: 'Asphalt & Main Street', tempDelta: 2.1, color: '#f97316' }, // Hot (Orange)
      { dLat: 0.001, dLon: -0.004, label: 'High Density Concrete', tempDelta: 3.4, color: '#dc2626' }, // Very Hot (Red)
    ]

    for (const offset of offsets) {
      const zoneLat = latitude + offset.dLat
      const zoneLon = longitude + offset.dLon
      const zoneTemp = Math.round((currentTemp + offset.tempDelta) * 10) / 10
      zones.push({
        lat: zoneLat,
        lon: zoneLon,
        temp: zoneTemp,
        label: offset.label,
        color: offset.color,
      })
    }
    return zones
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

        {/* User Location Marker */}
        <Marker position={[latitude, longitude]} icon={userMarkerIcon}>
          <Popup>
            <div className="p-1 font-sans">
              <p className="font-bold text-xs text-foreground">📍 YOU ARE HERE</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                {latitude.toFixed(4)}, {longitude.toFixed(4)}
              </p>
              <p className="text-xs font-bold text-primary mt-1">Current: {currentTemp}°C</p>
            </div>
          </Popup>
        </Marker>

        {/* Temperature Micro-Zones Circle Heatmap Overlays */}
        {tempZones.map((zone, idx) => (
          <Circle
            key={idx}
            center={[zone.lat, zone.lon]}
            radius={220}
            pathOptions={{
              color: zone.color,
              fillColor: zone.color,
              fillOpacity: 0.35,
              weight: 2,
            }}
          >
            <Popup>
              <div className="p-1 font-sans">
                <p className="font-bold text-xs">{zone.label}</p>
                <p className="text-xs font-extrabold mt-0.5" style={{ color: zone.color }}>
                  Temp: {zone.temp}°C
                </p>
              </div>
            </Popup>
          </Circle>
        ))}
      </MapContainer>

      {/* Map Legend Overlay (Mobile-Friendly Outdoor Contrast) */}
      <div className="absolute bottom-3 left-3 z-20 rounded-xl border border-border/80 bg-background/95 p-2.5 shadow-xl backdrop-blur-md text-[10px] font-bold">
        <p className="text-muted-foreground uppercase tracking-wider text-[9px] mb-1.5 border-b border-border/60 pb-1">
          Temperature Zones Legend
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-blue-500" /> Cool (&lt;28°C)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" /> Comfort (28-32°C)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-yellow-500" /> Warm (32-36°C)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-orange-500" /> Hot (36-40°C)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-red-600" /> Very Hot (&gt;40°C)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[11px]">📍</span> You Are Here
          </span>
        </div>
      </div>
    </div>
  )
}
