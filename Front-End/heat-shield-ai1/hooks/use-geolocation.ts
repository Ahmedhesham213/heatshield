'use client'

import { useCallback, useEffect, useState } from 'react'

export function useGeolocation(defaultLatitude: number, defaultLongitude: number) {
  const [latitude, setLatitude] = useState(defaultLatitude)
  const [longitude, setLongitude] = useState(defaultLongitude)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updatePosition = useCallback(({ coords }: GeolocationPosition) => {
    setError(null)
    setLatitude(coords.latitude)
    setLongitude(coords.longitude)
  }, [])

  const handleError = useCallback((reason: GeolocationPositionError) => {
    setError(reason.code === 1 ? 'Location permission was denied.' : 'Unable to determine your location.')
  }, [])

  const requestLocation = useCallback((): Promise<{ lat: number; lon: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const msg = 'Geolocation is not supported by this browser.'
        setError(msg)
        reject(new Error(msg))
        return
      }
      setLoading(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLoading(false)
          updatePosition(pos)
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        },
        (err) => {
          setLoading(false)
          handleError(err)
          reject(err)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }, [handleError, updatePosition])

  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(updatePosition, handleError, { enableHighAccuracy: true })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [handleError, updatePosition])

  return { latitude, longitude, loading, error, requestLocation }
}
