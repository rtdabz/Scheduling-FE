import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
  latitude: number;
  longitude: number;
  failed: boolean;
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

/**
 * One approximate sign-in location on OpenStreetMap. A soft radius ring signals that the point
 * is a city-level estimate, and the pin opens a popup with the location details.
 */
export default function SingleLoginMap({ latitude, longitude, failed, details }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const color = failed ? '#DC2626' : '#701522';
    const center: L.LatLngTuple = [latitude, longitude];
    const map = L.map(containerRef.current, { scrollWheelZoom: false, minZoom: 2 }).setView(center, 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 13, // City-level estimate; street-level zoom would imply precision that does not exist.
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());

    L.circle(center, { radius: 5000, color, weight: 1, fillColor: color, fillOpacity: 0.08, interactive: false }).addTo(map);
    const popup = `<div style="min-width:12rem;font-size:12px;line-height:1.45">${details
      .map(([label, value]) => `<div><span style="color:#6b7280">${escapeHtml(label)}:</span> <strong>${escapeHtml(value)}</strong></div>`)
      .join('')}<div style="margin-top:4px;color:#6b7280;font-size:11px">Approximate, based on IP address</div></div>`;
    L.marker(center, { icon: pinIcon(color), keyboard: true, title: 'Approximate sign-in location', alt: 'Approximate sign-in location' })
      .bindPopup(popup)
      .addTo(map);

    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
    };
  }, [latitude, longitude, failed, details]);

  return <div ref={containerRef} className="h-full w-full" role="region" aria-label="Map of the approximate sign-in location" />;
}
