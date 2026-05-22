import { useMemo, useState } from 'react';
import { LineChart as LineIcon } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { format } from 'date-fns';
import { useAssetDatapoints } from '../../hooks/useAssets';
import { getCustomAssetType, getPrimaryReadingAttr } from '../../utils/assetIcons';
import { getTimeRanges } from '../../utils/helpers';
import { isChartableAttr } from '../../utils/chartable';
import { LoadingSpinner, EmptyState } from '../ui';

/* ==========================================================================
   AssetHistoryCard

   Shared history chart for a single asset — Recharts AreaChart driven by the
   OR datapoints endpoint via `useAssetDatapoints`. Picks chartable attributes
   (numeric / boolean) automatically, defaults to the asset's primary reading
   attribute. Booleans plot as 0/1 step lines; numbers as a smooth area.

   Used by:
     • AssetPage History tab — single fixed asset.
     • SecureOps Control page — the asset is chosen by an outer dropdown.

   Self-contained: owns its `attr` + `range` state. The component does NOT
   reset its internal state when the asset changes — parents that swap
   assets must pass `key={asset.id}` to force a fresh mount (React's
   recommended pattern, avoids the setState-in-effect anti-pattern).
   ========================================================================== */

const RANGE_KEYS = ['1h', '6h', '24h', '7d', '30d'];

export default function AssetHistoryCard({ asset, className = 'panel p-5' }) {
  const chartableNames = useMemo(
    () => Object.entries(asset?.attributes || {})
      .filter(([, v]) => isChartableAttr(v))
      .map(([n]) => n),
    [asset],
  );

  const customType = getCustomAssetType(asset);
  const preferred = getPrimaryReadingAttr(asset, customType);
  const defaultAttr = (preferred && chartableNames.includes(preferred))
    ? preferred
    : chartableNames[0] || null;

  const [attr, setAttr] = useState(defaultAttr);
  const [range, setRange] = useState('24h');

  // CRITICAL: stable per `range`. getTimeRanges() reads Date.now(), so a
  // fresh object every render would change the React Query key on every
  // tick and put the hook in an infinite refetch loop.
  const timeRange = useMemo(() => getTimeRanges()[range], [range]);
  const { data: points, isLoading } = useAssetDatapoints(asset?.id, attr, timeRange);

  if (chartableNames.length === 0) {
    return (
      <div className={className}>
        <EmptyState
          title="No chartable data"
          message="This device has no numeric or boolean attributes with datapoints."
          icon={LineIcon}
        />
      </div>
    );
  }

  const selectedMeta = attr ? asset?.attributes?.[attr] : null;
  const isBoolean = selectedMeta?.type === 'boolean' || typeof selectedMeta?.value === 'boolean';

  // The backend can return points as {x, y} objects, {timestamp, value}
  // objects, or [ts, v] tuples depending on server version — accept all
  // three. Booleans are coerced to 0/1 so Recharts can plot them.
  const series = Array.isArray(points)
    ? points.map((p) => {
        let t, raw;
        if (Array.isArray(p)) { t = p[0]; raw = p[1]; }
        else { t = p.x ?? p.timestamp; raw = p.y ?? p.value; }
        const v = typeof raw === 'boolean' ? (raw ? 1 : 0) : Number(raw);
        return { t, v };
      }).filter((p) => p.t != null && Number.isFinite(p.v))
    : [];

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 flex-wrap">
          {chartableNames.map((n) => (
            <Chip key={n} label={prettyName(n)} active={attr === n} onClick={() => setAttr(n)} />
          ))}
        </div>
        <div className="flex items-center gap-1">
          {RANGE_KEYS.map((r) => (
            <Chip key={r} label={r} active={range === r} onClick={() => setRange(r)} compact />
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center"><LoadingSpinner /></div>
      ) : series.length === 0 ? (
        <EmptyState
          title="No data in this range"
          message="Try a wider time window — this attribute may not have any stored datapoints yet."
          icon={LineIcon}
        />
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="assetHistoryAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, currentColor 8%, transparent)" />
              <XAxis
                dataKey="t"
                tickFormatter={(t) => format(new Date(t), 'HH:mm')}
                tick={{ fontSize: 10, fill: 'var(--color-ink-2)' }}
                stroke="var(--color-ink-3)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--color-ink-2)' }}
                stroke="var(--color-ink-3)"
                domain={isBoolean ? [0, 1] : ['auto', 'auto']}
                ticks={isBoolean ? [0, 1] : undefined}
                tickFormatter={isBoolean ? (v) => (v ? 'On' : 'Off') : undefined}
                width={isBoolean ? 40 : 30}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-surface-3)',
                  borderRadius: 12,
                  color: 'var(--color-ink-0)',
                }}
                labelFormatter={(t) => format(new Date(t), 'PPp')}
                formatter={isBoolean ? (v) => [v ? 'On' : 'Off', prettyName(attr)] : undefined}
              />
              <Area
                type={isBoolean ? 'stepAfter' : 'monotone'}
                dataKey="v"
                stroke="var(--color-accent-500)"
                strokeWidth={2}
                fill="url(#assetHistoryAreaFill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick, compact }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium rounded-lg transition-colors ${compact ? 'px-2.5 py-1' : 'px-3 py-1.5'} ${
        active ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)]'
      }`}
      style={active ? { background: 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)' } : {}}
    >
      {label}
    </button>
  );
}

function prettyName(name) {
  if (!name) return '';
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}
