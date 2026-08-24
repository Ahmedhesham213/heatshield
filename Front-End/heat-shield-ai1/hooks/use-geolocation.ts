'use client'

import { useCallback, useEffect, useState } from 'react'

export function useGeolocation(defaultLatitude: number, defaultLongitude: number) {
  const [latitude, setLatitude] = useState(defaultLatitude)
  const [longitude, setLongitude] = useState(defaultLongitude)
  const [error, setError] = useState<string | null>(null)
  const updatePosition = useCallback(({ coords }: GeolocationPosition) => {
    setError(null)
    setLatitude(coords.latitude)
    setLongitude(coords.longitude)
  }, [])
  const handleError = useCallback((reason: GeolocationPositionError) => {
    setError(reason.code === 1 ? 'Location permission was denied.' : 'Unable to determine your location.')
  }, [])
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(updatePosition, handleError, { enableHighAccuracy: true, timeout: 10000 })
  }, [handleError, updatePosition])
  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(updatePosition, handleError, { enableHighAccuracy: true })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [handleError, updatePosition])
  return { latitude, longitude, error, requestLocation }
}
