import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Server } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useAssets } from '../hooks/useAssets';
import { pickGateways, pickGatewayChildren, summariseGateway, extractLocation } from '../utils/gateways';
import { getAssetDisplayName } from '../utils/assetIcons';
import useAppStore from '../store/appStore';
import { LoadingSpinner, EmptyState } from '../components/ui';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const DEFAULT_CENTER = [30.3753, 69.3451]; // Pakistan centroid
const DEFAULT_ZOOM = 5;

/**
 * Fits the map to every marker the first time they appear. Re-fits only if
 * the set of positions changes (not on every render).
 */
function FitBoundsOnce({ positions }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current || positions.length === 0) return;
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 14 });
    fittedRef.current = true;
  }, [positions, map]);
  return null;
}

/**
 * When a gateway is selected from the sidebar, pan/zoom the map to it and
 * open its popup. Each selection is a fresh object (keyed by click timestamp)
 * so the effect re-runs even when the user clicks the already-selected site —
 * essential for "I panned the map away, now re-centre me" behaviour.
 */
function FocusSelected({ selection, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    if (!selection) return;
    map.flyTo(selection.pos, Math.max(map.getZoom(), 15), { duration: 0.8 });
    const t = setTimeout(() => {
      const ref = markerRefs.current.get(selection.id);
      if (ref) ref.openPopup();
    }, 350);
    return () => clearTimeout(t);
  }, [selection, map, markerRefs]);
  return null;
}

export default function MapPage() {
  const { data: assets = [], isLoading } = useAssets({});
  const { theme } = useAppStore();
  const [searchParams] = useSearchParams();
  // `selection` carries an `at` timestamp so identity changes on every click
  // — that re-triggers the focus effect even when the same site is clicked
  // twice in a row (e.g. after the user panned away).
  const [selection, setSelection] = useState(null);
  const markerRefs = useRef(new Map());

  const gateways = useMemo(() => pickGateways(assets), [assets]);
  const pins = useMemo(
    () => gateways
      .map((g) => ({ gateway: g, pos: extractLocation(g) }))
      .filter((x) => x.pos),
    [gateways]
  );
  const positions = useMemo(() => pins.map((p) => p.pos), [pins]);

  const selectGateway = (id) => {
    const p = pins.find((x) => x.gateway.id === id);
    if (!p) return;
    // Always create a fresh object so `selection` has a new identity even when
    // the same id is clicked twice — that re-triggers FocusSelected's effect
    // (re-centres the map after the user panned away).
    setSelection({ id: p.gateway.id, pos: p.pos });
  };

  // Honour ?focus=<gatewayId> so links from other pages (e.g. the Alarms
  // "Open map" button) can deep-link to a specific site. Runs once the pins
  // are available; deferred via rAF so setState fires outside the effect
  // body (React 19's set-state-in-effect lint).
  const focusId = searchParams.get('focus');
  useEffect(() => {
    if (!focusId || pins.length === 0) return undefined;
    const p = pins.find((x) => x.gateway.id === focusId);
    if (!p) return undefined;
    const raf = requestAnimationFrame(() => {
      setSelection({ id: p.gateway.id, pos: p.pos });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusId, pins]);

  const tileUrl = useMemo(
    () => (theme === 'light'
      ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'),
    [theme]
  );

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-ink-0)]">Map</h1>
        <p className="text-sm text-[var(--color-ink-2)] mt-1">
          Geolocations of your sites. Click a site in the list to focus it on the map.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 panel p-2 overflow-hidden" style={{ isolation: 'isolate' }}>
          <div
            style={{ height: 560, isolation: 'isolate', position: 'relative', zIndex: 0 }}
            className="rounded-xl overflow-hidden"
          >
            <MapContainer
              center={positions[0] || DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                url={tileUrl}
                attribution='&copy; OpenStreetMap contributors, &copy; CARTO'
              />
              <FitBoundsOnce positions={positions} />
              <FocusSelected selection={selection} markerRefs={markerRefs} />

              {pins.map(({ gateway, pos }) => {
                const children = pickGatewayChildren(assets, gateway.id);
                const s = summariseGateway(children);
                return (
                  <Marker
                    key={gateway.id}
                    position={pos}
                    ref={(el) => {
                      if (el) markerRefs.current.set(gateway.id, el);
                      else markerRefs.current.delete(gateway.id);
                    }}
                    eventHandlers={{
                      click: () => selectGateway(gateway.id),
                    }}
                  >
                    <Popup>
                      <div className="min-w-[200px]">
                        <p className="font-semibold text-sm mb-1">{getAssetDisplayName(gateway)}</p>
                        <p className="text-xs text-slate-500 mb-2">Site</p>
                        <div className="grid grid-cols-3 gap-2 text-center mb-2">
                          <div><p className="text-[10px] text-slate-500">Devices</p><p className="text-sm font-semibold">{s.total}</p></div>
                          <div><p className="text-[10px] text-slate-500">Online</p><p className="text-sm font-semibold text-emerald-600">{s.online}</p></div>
                          <div><p className="text-[10px] text-slate-500">Alarms</p><p className="text-sm font-semibold text-red-600">{s.alarming}</p></div>
                        </div>
                        <Link to={`/g/${gateway.id}`} className="text-xs font-semibold text-cyan-600 hover:underline">
                          Open site →
                        </Link>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--color-ink-0)] px-1">Sites ({gateways.length})</h3>
          {gateways.length === 0 ? (
            <EmptyState icon={Server} title="No sites" message="Gateways appear here once registered." />
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {gateways.map((g, i) => {
                const pos = extractLocation(g);
                const locatable = !!pos;
                const isSelected = g.id === selection?.id;
                return (
                  <motion.div
                    key={g.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <button
                      type="button"
                      onClick={() => locatable && selectGateway(g.id)}
                      disabled={!locatable}
                      className={`w-full text-left tile p-3 transition-colors ${!locatable ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                      style={isSelected ? {
                        background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent-500) 16%, var(--color-surface-1)) 0%, var(--color-surface-1) 100%)',
                        borderColor: 'color-mix(in srgb, var(--color-accent-500) 45%, transparent)',
                        boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent-500) 25%, transparent)',
                      } : {}}
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-start gap-2.5">
                        <MapPin
                          className={`w-4 h-4 mt-0.5 ${
                            isSelected
                              ? 'text-[var(--color-accent-400)]'
                              : locatable
                                ? 'text-[var(--color-ink-1)]'
                                : 'text-[var(--color-ink-3)]'
                          }`}
                          strokeWidth={1.75}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold truncate ${isSelected ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-ink-0)]'}`}>
                            {getAssetDisplayName(g)}
                          </p>
                          <p className="text-[10px] text-[var(--color-ink-2)] truncate">
                            {locatable ? `${pos[0].toFixed(3)}, ${pos[1].toFixed(3)}` : 'No location set'}
                          </p>
                        </div>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
