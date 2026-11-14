import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LocationGroup } from './loginActivityModel';

const PHILIPPINES: L.LatLngTuple = [12.88, 121.77];
const COLORS = { ok: '#701522', mixed: '#D97706', failed: '#DC2626' };

const pinColor = (group: LocationGroup) =>
  group.failed === 0 ? COLORS.ok : group.failed === group.entries.length ? COLORS.failed : COLORS.mixed;

type Props = {
  groups: LocationGroup[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

/**
 * OpenStreetMap + Leaflet map with one circle pin per approximate location. Circle markers avoid
 * Leaflet's bundled marker images, and pin size grows with the number of sign-ins there.
 */
export default function LoginMap({ groups, selectedKey, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { worldCopyJump: true, minZoom: 2, scrollWheelZoom: false }).setView(PHILIPPINES, 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12, // City-level data; deeper zoom would suggest precision that does not exist.
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Fit to the pins whenever the result set changes (not when a pin is merely selected).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (groups.length === 0) map.setView(PHILIPPINES, 5);
    else map.fitBounds(L.latLngBounds(groups.map(group => [group.latitude, group.longitude] as L.LatLngTuple)), { padding: [40, 40], maxZoom: 9 });
  }, [groups]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const group of groups) {
      const selected = group.key === selectedKey;
      const color = pinColor(group);
      const count = group.entries.length;
      L.circleMarker([group.latitude, group.longitude], {
        radius: Math.min(20, 7 + Math.sqrt(count) * 2.2),
        color: selected ? '#111827' : '#ffffff',
        weight: selected ? 3 : 2,
        fillColor: color,
        fillOpacity: selected ? 0.95 : 0.8,
        bubblingMouseEvents: false,
      })
        .bindTooltip(`<strong>${escapeHtml(group.label)}</strong><br>${count} sign-in${count === 1 ? '' : 's'}${group.failed ? ` · ${group.failed} failed` : ''}`, { direction: 'top', offset: [0, -6] })
        .on('click', () => onSelectRef.current(group.key))
        .addTo(layer);
    }
  }, [groups, selectedKey]);

  return (
    <div className="relative h-full min-h-[22rem]">
      <div ref={containerRef} className="absolute inset-0 z-0" role="region" aria-label="Map of approximate sign-in locations" />
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm ring-1 ring-gray-200">
        <Legend color={COLORS.ok} label="Successful" />
        <Legend color={COLORS.mixed} label="Mixed" />
        <Legend color={COLORS.failed} label="Failed only" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
