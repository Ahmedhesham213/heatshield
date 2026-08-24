import { NextResponse } from 'next/server'

// Server-side route to proxy requests to FortyGuard Enterprise API.
// Security: reads FORTYGUARD_API_KEY from server environment (not exposed to browser).

type RequestBody = {
  lat?: number
  lon?: number
  analytic_type?: string
  date?: string
  // Optional GeoJSON polygon coordinates (array of [lon, lat] points)
  polygon?: number[][]
}

const FORTYGUARD_BASE = process.env.FORTYGUARD_BASE_URL ?? 'https://api.fortyguard.com'
const API_KEY = process.env.FORTYGUARD_API_KEY

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function POST(req: Request) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'Server missing FORTYGUARD_API_KEY' }, { status: 500 })
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const lat = body.lat ?? 40.7128
  const lon = body.lon ?? -74.0060
  const analytic_type = body.analytic_type ?? 'tcm'

  // Build a small square polygon (GeoJSON coordinates are [lon, lat]) around the given point if no polygon supplied
  const polygonCoords = body.polygon ?? [
    [lon - 0.02, lat - 0.02],
    [lon + 0.02, lat - 0.02],
    [lon + 0.02, lat + 0.02],
    [lon - 0.02, lat + 0.02],
    [lon - 0.02, lat - 0.02],
  ]

  const payload: any = {
    analytic_type,
    // FortyGuard expects GeoJSON as [lon, lat] — ensure ordering is longitude, latitude
    aoi: {
      type: 'Polygon',
      coordinates: [polygonCoords],
    },
  }

  if (body.date) payload.date = body.date

  // Send POST /v1/heatmap
  const postUrl = `${FORTYGUARD_BASE.replace(/\/$/, '')}/v1/heatmap`
  let postResp: Response
  try {
    postResp = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    return NextResponse.json({ error: 'Network error when contacting FortyGuard', details: String(err) }, { status: 502 })
  }

  if (!postResp.ok) {
    const text = await postResp.text()
    return NextResponse.json({ error: 'FortyGuard POST /v1/heatmap failed', status: postResp.status, body: text }, { status: 502 })
  }

  let postJson: any
  try {
    postJson = await postResp.json()
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON from FortyGuard POST response' }, { status: 502 })
  }

  const activityId = postJson.activity_id ?? postJson.activityId ?? postJson.id
  if (!activityId) {
    // If API returned immediate result instead of activity workflow, return it directly
    const maybeResult = postJson.result ?? postJson
    return NextResponse.json({ source: 'fortyguard', activity_id: null, result: maybeResult })
  }

  // Poll for status
  const statusUrl = (id: string) => `${FORTYGUARD_BASE.replace(/\/$/, '')}/v1/status/${id}`
  const maxAttempts = 30
  let attempt = 0
  let finalJson: any = null

  while (attempt < maxAttempts) {
    attempt += 1
    let statusResp: Response
    try {
      statusResp = await fetch(statusUrl(activityId), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/json',
        },
      })
    } catch (err) {
      return NextResponse.json({ error: 'Network error when polling FortyGuard', details: String(err) }, { status: 502 })
    }

    if (!statusResp.ok) {
      const text = await statusResp.text()
      return NextResponse.json({ error: 'FortyGuard status check failed', status: statusResp.status, body: text }, { status: 502 })
    }

    try {
      finalJson = await statusResp.json()
    } catch (err) {
      return NextResponse.json({ error: 'Invalid JSON from FortyGuard status response' }, { status: 502 })
    }

    const status = (finalJson.status ?? finalJson.state ?? '').toString()
    if (status.toLowerCase() === 'completed' || status.toLowerCase() === 'finished' || finalJson.result) {
      break
    }

    if (status.toLowerCase() === 'failed' || status.toLowerCase() === 'error') {
      return NextResponse.json({ error: 'FortyGuard activity failed', details: finalJson }, { status: 502 })
    }

    // wait and retry
    await sleep(2000)
  }

  if (!finalJson) {
    return NextResponse.json({ error: 'No status response from FortyGuard' }, { status: 502 })
  }

  // Extract the result payload from status response
  const result = finalJson.result ?? finalJson.results ?? finalJson.data ?? finalJson

  // Attempt to collect temperature values from typical FortyGuard shapes
  let temps: number[] = []
  try {
    if (Array.isArray(result.features)) {
      for (const f of result.features) {
        const v = f?.properties?.temperature ?? f?.properties?.value ?? f?.properties?.temp
        if (typeof v === 'number' && !Number.isNaN(v)) temps.push(v)
      }
    } else if (Array.isArray(result)) {
      for (const item of result) {
        const v = item?.temperature ?? item?.value
        if (typeof v === 'number' && !Number.isNaN(v)) temps.push(v)
      }
    }
  } catch (err) {
    // ignore parsing errors
  }

  const stats = {
    count: temps.length,
    average: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    min: temps.length ? Math.min(...temps) : null,
    max: temps.length ? Math.max(...temps) : null,
  }

  const response = {
    source: 'fortyguard',
    activity_id: activityId,
    status: finalJson.status ?? 'Completed',
    stats,
    // include useful metadata for the frontend to render heatmap and other displays
    location: { name: 'Requested location', lat, lon },
    date: finalJson.completed_at ?? finalJson.updated_at ?? finalJson.timestamp ?? null,
    raw: result,
  }

  return NextResponse.json(response)
}
