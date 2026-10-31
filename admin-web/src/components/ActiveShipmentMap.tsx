import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface ActiveShipmentMapProps {
  shipments: any[]
  height?: string
}

export function ActiveShipmentMap({ shipments, height = '350px' }: ActiveShipmentMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current) return

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([6.5244, 3.3792], 11)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(mapInstanceRef.current)
    }

    const map = mapInstanceRef.current

    map.eachLayer((layer) => {
      if (!(layer instanceof L.TileLayer)) {
        map.removeLayer(layer)
      }
    })

    const markers: L.LatLng[] = []

    shipments.forEach((s, idx) => {
      const lat = s.last_verified_location?.latitude ?? (6.5244 + (idx * 0.04) - 0.1)
      const lng = s.last_verified_location?.longitude ?? (3.3792 + (idx * 0.04) - 0.1)

      const latLng = L.latLng(lat, lng)
      markers.push(latLng)

      const status = s.current_status || 'active'
      const ref = s.pulse_shipment_id || s.id || `SHP-${idx}`

      const marker = L.circleMarker(latLng, {
        radius: 9,
        fillColor: status === 'delivered' ? '#10b981' : status === 'failed' ? '#ef4444' : '#14958e',
        color: '#ffffff',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.95,
      }).addTo(map)

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; color: #122238;">
          <strong>${ref}</strong><br/>
          <span style="text-transform: capitalize;">Status: <strong>${status.replace(/_/g, ' ')}</strong></span><br/>
          <a href="/app/shipments/${s.id ?? ''}" style="color: #14958e; font-weight: 600; text-decoration: underline; margin-top: 4px; display: inline-block;">Open passport →</a>
        </div>
      `)
    })

    // Also draw route polyline if multiple points or start/end
    if (markers.length >= 2) {
      L.polyline(markers, { color: '#14958e', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(map)
    }

    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
    }

    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 150)

    return () => {
      clearTimeout(timer)
    }
  }, [shipments])

  return (
    <div style={{ width: '100%', height, borderRadius: 'var(--r-lg)', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', zIndex: 1 }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
