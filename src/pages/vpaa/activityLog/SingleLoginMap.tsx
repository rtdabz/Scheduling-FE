import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
  latitude: number;
  longitude: number;
  failed: boolean;
  /** True for a browser (device) fix; false for a city-level IP estimate. */
  precise: boolean;
  /** Device-reported accuracy radius in metres (precise fixes only). */
  accuracyM?: number | null;
  /** Plain-text lines shown in the pin's popup. */
  details: [string, string][];
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Teardrop pin as inline SVG, so no Leaflet marker images need to be bundled. */
const pinIcon = (color: string) => L.divIcon({
  className: '',
  iconSize: [30, 40],
  iconAnchor: [15, 39],
  popupAnchor: [0, -34],
  html: `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))">
    <path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.3 15 39 15 39s14-13.7 14-24.1C29 7.2 22.7 1 15 1z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="15" cy="15" r="5" fill="#fff"/></svg>`,
});

/** City-level ring for IP estimates; GPS rings use the reported accuracy. */
const IP_RADIUS_M = 5000;

/**
 * One sign-in location on OpenStreetMap. The ring is the uncertainty: the device-reported accuracy
 * for a precise fix (solid), or a ~5 km dashed ring for an IP estimate, whose zoom is capped so
 * the map never implies street-level precision it does not have.
 */
export default function SingleLoginMap({ latitude, longitude, failed, precise, accuracyM, details }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const color = failed ? '#DC2626' : '#5A1220';
    const center: L.LatLngTuple = [latitude, longitude];
    const radius = precise ? Math.max(5, accuracyM ?? 0) : IP_RADIUS_M;
    const map = L.map(containerRef.current, { scrollWheelZoom: false, minZoom: 2, zoomControl: true }).setView(center, precise ? 16 : 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: precise ? 19 : 13,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());

    const ring = L.circle(center, {
      radius, color, weight: precise ? 1.5 : 1, dashArray: precise ? undefined : '4 4', fillColor: color, fillOpacity: precise ? 0.12 : 0.06, interactive: false,
    }).addTo(map);
    if (precise) map.fitBounds(ring.getBounds(), { maxZoom: 17, padding: [24, 24] });
    const label = precise ? 'Precise device location' : 'Approximate network location';
    const note = precise ? `Reported by the device browser, accurate to about ${Math.round(radius)} m` : 'Estimated from the IP address, about city level';
    const popup = `<div style="min-width:12rem;font-size:12px;line-height:1.45">${details
      .map(([label, value]) => `<div><span style="color:#6b7280">${escapeHtml(label)}:</span> <strong>${escapeHtml(value)}</strong></div>`)
      .join('')}<div style="margin-top:4px;color:#6b7280;font-size:11px">${escapeHtml(note)}</div></div>`;
    const popupHtml = `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${color};margin-bottom:2px">${label}</div>${popup}`;
    L.marker(center, { icon: pinIcon(color), keyboard: true, title: label, alt: label })
      .bindPopup(popupHtml)
      .addTo(map);

    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
    };
  }, [latitude, longitude, failed, precise, accuracyM, details]);

  return <div ref={containerRef} className="relative z-0 isolate h-full w-full" role="region" aria-label={precise ? 'Map of the device sign-in location' : 'Map of the approximate sign-in location'} />;
}
