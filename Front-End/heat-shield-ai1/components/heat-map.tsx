'use client'

import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type HeatMapProps = { latitude: number; longitude: number; onSelect?: (latitude: number, longitude: number) => void }

function ClickHandler({ onSelect }: { onSelect?: HeatMapProps['onSelect'] }) { useMapEvents({ click: (event) => onSelect?.(event.latlng.lat, event.latlng.lng) }); return null }

function Recenter({ latitude, longitude }: HeatMapProps) {
  const map = useMap()
  useEffect(() => {
    map.setView([latitude, longitude], 13, { animate: true })
  }, [latitude, longitude, map])
  return null
}

export function HeatMap({ latitude, longitude, onSelect }: HeatMapProps) {
  const icon = useMemo(() => L.divIcon({ className: 'heatshield-location-marker', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }), [])
  return <div className="h-[320px] overflow-hidden rounded-xl border border-border/60"><MapContainer center={[latitude, longitude]} zoom={13} scrollWheelZoom className="h-full w-full"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><ClickHandler onSelect={onSelect} /><Marker position={[latitude, longitude]} icon={icon} /><Recenter latitude={latitude} longitude={longitude} /></MapContainer></div>
}
