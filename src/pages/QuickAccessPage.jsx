import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, TouchSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Sparkles, Plus, Search, X, Trash2, Info, ChevronRight,
  Pencil, Check, Maximize2, Minimize2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAssets, useWriteAttribute } from '../hooks/useAssets';
import {
  getCustomAssetType, isAssetActive, isAssetAlarming, getStateLabel,
  getPrimaryControlAttr, nextToggleValue, CONTROLLABLE_TYPES, getAssetTypeLabel,
  getAssetDisplayName,
} from '../utils/assetIcons';
import { pickAllDevices, findGatewayForAsset, pickGateways } from '../utils/gateways';
import { getQuickLayout, setQuickLayout } from '../utils/prefs';
import AssetGlyph from '../components/tiles/AssetGlyph';
import { LoadingSpinner, EmptyState, Tip } from '../components/ui';
import './quick-access.css';

export default function QuickAccessPage() {
  const { data: assets = [], isLoading } = useAssets({});
  const navigate = useNavigate();

  const [layout, setLayout] = useState([]);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    getQuickLayout().then((l) => {
      setLayout(l);
      setReady(true);
    });
  }, []);

  // Every recognised device type — not just controllable ones. Sensors and
  // cameras are pinnable too; tapping their icon opens the detail page (same
  // behaviour as AssetTile on /g/:id).
  const pinnableDevices = useMemo(() => pickAllDevices(assets), [assets]);
  const gateways = useMemo(() => pickGateways(assets), [assets]);
  const deviceMap = useMemo(() => {
    const m = new Map();
    for (const d of pinnableDevices) m.set(d.id, d);
    return m;
  }, [pinnableDevices]);

  // Drop items whose asset has disappeared.
  const resolvedLayout = useMemo(
    () => layout.filter((it) => deviceMap.has(it.id)),
    [layout, deviceMap],
  );
  const resolvedIds = useMemo(() => resolvedLayout.map((it) => it.id), [resolvedLayout]);
  const activeItem = resolvedLayout.find((it) => it.id === activeId);

  const persist = async (next) => {
    setLayout(next);
    await setQuickLayout(next);
  };

  const addDevice = async (id) => {
    if (resolvedLayout.some((it) => it.id === id)) return;
    await persist([...resolvedLayout, { id, size: 'small' }]);
    toast.success('Pinned to Quick access');
  };

  const removeDevice = async (id) => {
    await persist(resolvedLayout.filter((it) => it.id !== id));
  };

  const toggleSize = async (id) => {
    await persist(resolvedLayout.map((it) =>
      it.id === id ? { ...it, size: it.size === 'large' ? 'small' : 'large' } : it
    ));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (event) => setActiveId(event.active.id);

  const onDragEnd = async (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = resolvedIds.indexOf(active.id);
    const newIndex = resolvedIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    await persist(arrayMove(resolvedLayout, oldIndex, newIndex));
  };

  const onDragCancel = () => setActiveId(null);

  if (isLoading || !ready) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel p-6 relative overflow-hidden"
        style={{
          background:
            'radial-gradient(60% 90% at 10% 0%, color-mix(in srgb, var(--color-accent-500) 22%, transparent), transparent 60%),' +
            'radial-gradient(70% 90% at 100% 100%, color-mix(in srgb, var(--color-brand-700) 28%, transparent), transparent 60%),' +
            'var(--color-surface-1)',
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))' }}
          >
            <Sparkles className="w-6 h-6 text-white" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <h1 className="text-2xl font-bold text-[var(--color-ink-0)]">Quick access</h1>
            <p className="text-sm text-[var(--color-ink-2)]">
              Your favourite controls — drag to reorder, resize between small and large.
            </p>
          </div>
          <button
            onClick={() => setEditing((v) => !v)}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold border transition-colors ${
              editing
                ? 'text-[var(--color-accent-400)] border-[color-mix(in_srgb,var(--color-accent-500)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-accent-500)_12%,transparent)]'
                : 'text-[var(--color-ink-1)] border-[color-mix(in_srgb,var(--color-ink-0)_14%,transparent)] hover:text-[var(--color-ink-0)]'
            }`}
          >
            {editing ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            {editing ? 'Done' : 'Edit layout'}
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-transform hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))' }}
          >
            <Plus className="w-4 h-4" />
            Add devices
          </button>
        </div>
      </motion.div>

      {resolvedLayout.length === 0 ? (
        <>
          <Tip id="quick-access-intro" title="How this page works">
            Pin devices here, then drag to reorder and resize between small and large.
            Everything is saved privately in your browser.
          </Tip>
          <EmptyState
            icon={Sparkles}
            title="Nothing pinned yet"
            message={
              pinnableDevices.length
                ? 'Pin any device — controllable or read-only — for one-tap access.'
                : 'You do not have any devices yet. Add one on your SMS IoT backend first.'
            }
            action={
              pinnableDevices.length ? (
                <button
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))' }}
                >
                  <Plus className="w-4 h-4" /> Add devices
                </button>
              ) : (
                <Link to="/sites" className="text-sm text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)]">
                  View sites
                </Link>
              )
            }
          />
        </>
      ) : (
        <>
          {editing ? (
            <Tip id="quick-access-edit">
              Drag any tile to reorder. Tap the size button to switch between small and large.
              Tap <strong>Done</strong> when you are finished.
            </Tip>
          ) : (
            <Tip id="quick-access-tap">
              Tap any icon to toggle the device. Hit <strong>Edit layout</strong> to
              rearrange or resize tiles.
            </Tip>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <SortableContext items={resolvedIds} strategy={rectSortingStrategy}>
              <LayoutGroup>
                <motion.div layout className={`qa-grid ${editing ? 'qa-editing' : ''}`}>
                  <AnimatePresence initial={false}>
                    {resolvedLayout.map((item) => {
                      const asset = deviceMap.get(item.id);
                      if (!asset) return null;
                      return (
                        <SortableTile
                          key={item.id}
                          item={item}
                          asset={asset}
                          gateway={findGatewayForAsset(asset, gateways)}
                          editing={editing}
                          ghost={activeId === item.id}
                          onOpen={() => !editing && navigate(`/a/${asset.id}`)}
                          onRemove={() => removeDevice(asset.id)}
                          onToggleSize={() => toggleSize(asset.id)}
                        />
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              </LayoutGroup>
            </SortableContext>

            {/* Floating ghost that follows the cursor — the "silky" drag visual. */}
            <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
              {activeItem ? (
                <TilePresentation
                  asset={deviceMap.get(activeItem.id)}
                  gateway={findGatewayForAsset(deviceMap.get(activeItem.id), gateways)}
                  size={activeItem.size}
                  floating
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      <AnimatePresence>
        {pickerOpen && (
          <DevicePicker
            all={pinnableDevices}
            gateways={gateways}
            pinnedIds={resolvedIds}
            onClose={() => setPickerOpen(false)}
            onToggle={(id, pinned) => (pinned ? removeDevice(id) : addDevice(id))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Sortable wrapper (positioned in grid) ---------------- */

function SortableTile({ item, asset, gateway, editing, ghost, onOpen, onRemove, onToggleSize }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id, disabled: !editing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: item.size === 'large' ? 'span 2' : 'span 1',
    gridRow: 'span 1',
    opacity: isDragging || ghost ? 0 : 1,
  };

  // iPhone-style: whole tile is the drag source in edit mode.
  const dragProps = editing ? { ...attributes, ...listeners } : {};

  return (
    <div ref={setNodeRef} style={style} className="qa-slot">
      <TilePresentation
        asset={asset}
        gateway={gateway}
        size={item.size}
        editing={editing}
        onOpen={onOpen}
        onRemove={onRemove}
        onToggleSize={onToggleSize}
        dragProps={dragProps}
      />
    </div>
  );
}

/* ---------------- Visual tile (pure presentation) ---------------- */

function TilePresentation({
  asset, gateway, size, editing = false, floating = false,
  onOpen, onRemove, onToggleSize, dragProps = {},
}) {
  const customType = getCustomAssetType(asset);
  const active = isAssetActive(asset, customType);
  const alarm = isAssetAlarming(asset, customType);
  const stateLabel = getStateLabel(asset, customType);
  const primaryAttr = getPrimaryControlAttr(asset, customType);
  const controllable = CONTROLLABLE_TYPES.includes(customType);
  const write = useWriteAttribute();

  const large = size === 'large';
  const tone = alarm ? 'alarm' : active ? 'on' : 'off';

  // Controllable types (light/plug/fan/lock/alarm) toggle on icon tap.
  // Everything else (sensors, cameras, panels) opens the detail page — same
  // pattern used by AssetTile on /g/:id.
  const toggle = (e) => {
    e.stopPropagation();
    if (editing || floating) return;
    if (controllable && primaryAttr) {
      write.mutate({
        assetId: asset.id,
        attributeName: primaryAttr,
        value: nextToggleValue(asset, primaryAttr),
      });
      return;
    }
    onOpen?.();
  };

  // Keep icons comfortably inside the tile with room for the glow.
  // Small tile is a 1:1 square; large is 2:1 wide rectangle.
  const iconSizePx = large ? 96 : 64;
  const iconInnerClass = large ? 'w-11 h-11' : 'w-[30px] h-[30px]';

  return (
    <div
      {...dragProps}
      className={`qa-tile panel ${large ? 'qa-tile-large' : 'qa-tile-small'} ${editing && !floating ? 'qa-tile-editing qa-jiggle' : ''} ${floating ? 'qa-tile-floating' : ''}`}
      onClick={editing ? undefined : onOpen}
    >
      {editing && !floating && (
        <div className="qa-tile-chrome">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleSize(); }}
            aria-label={large ? 'Make small' : 'Make large'}
            className="qa-chrome-btn"
            title={large ? 'Shrink' : 'Expand'}
          >
            {large ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label="Remove from quick access"
            className="qa-chrome-btn qa-chrome-danger"
            title="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className={`qa-tile-body ${large ? 'qa-tile-body-large' : 'qa-tile-body-small'}`}>
        <motion.button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggle}
          whileTap={editing || floating ? {} : { scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          disabled={editing || floating}
          className={`ha-hero-icon ha-hero-icon-${tone} ${editing || floating ? '' : 'ha-hero-icon-btn'} flex-shrink-0`}
          style={{ width: iconSizePx, height: iconSizePx }}
          aria-label={`Toggle ${getAssetDisplayName(asset)}`}
          aria-pressed={active}
        >
          <motion.div
            key={`${tone}-${active}`}
            initial={{ scale: 0.75, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 24 }}
            style={{ display: 'flex' }}
          >
            <AssetGlyph
              customType={customType}
              on={active}
              alarm={alarm}
              className={iconInnerClass}
              strokeWidth={1.5}
              spin={customType === 'FanAsset' && active}
              pulse={alarm}
            />
          </motion.div>
        </motion.button>

        <div className={`qa-label ${large ? 'qa-label-large' : 'qa-label-small'}`}>
          <p
            className={`${large ? 'text-[15px]' : 'text-[12.5px]'} font-semibold text-[var(--color-ink-0)] leading-tight`}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: large ? 1 : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {getAssetDisplayName(asset)}
          </p>
          <p className={`${large ? 'text-[13px]' : 'text-[11px]'} mt-1 truncate leading-tight ${
            alarm ? 'text-[var(--color-danger-400)] font-semibold'
              : active ? 'text-[var(--color-accent-400)]'
              : 'text-[var(--color-ink-2)]'
          }`}>
            {stateLabel}
          </p>
          {large && gateway && (
            <p className="text-[11px] text-[var(--color-ink-3)] truncate mt-1">
              {getAssetDisplayName(gateway)}
            </p>
          )}
        </div>

        {large && !editing && !floating && (
          <ChevronRight className="w-4 h-4 text-[var(--color-ink-3)] flex-shrink-0 opacity-60" strokeWidth={1.75} />
        )}
      </div>
    </div>
  );
}

/* ---------------- Device picker (slide-over) ---------------- */

function DevicePicker({ all, gateways, pinnedIds, onClose, onToggle }) {
  const [q, setQ] = useState('');
  const pinned = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = query
      ? all.filter((a) => getAssetDisplayName(a).toLowerCase().includes(query))
      : all;
    const byGateway = new Map();
    for (const a of filtered) {
      const g = findGatewayForAsset(a, gateways);
      const key = g ? g.id : '__unassigned__';
      if (!byGateway.has(key)) {
        byGateway.set(key, { gateway: g, items: [] });
      }
      byGateway.get(key).items.push(a);
    }
    return Array.from(byGateway.values());
  }, [all, gateways, q]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
        className="ml-auto relative w-full sm:w-[420px] h-full flex flex-col"
        style={{ background: 'var(--color-surface-1)' }}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b"
             style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
          <div>
            <h2 className="text-base font-bold text-[var(--color-ink-0)]">Add devices</h2>
            <p className="text-[11px] text-[var(--color-ink-3)]">Pick the controls you use most</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-ink-2)] hover:text-[var(--color-ink-0)] hover:bg-[color-mix(in_srgb,var(--color-ink-0)_6%,transparent)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b"
             style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search devices"
              className="w-full pl-9 pr-3 py-2 rounded-xl text-[13px] text-[var(--color-ink-0)] placeholder:text-[var(--color-ink-3)] outline-none focus:ring-1 focus:ring-[var(--color-accent-500)]"
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid color-mix(in srgb, var(--color-ink-0) 10%, transparent)',
              }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--color-ink-2)]">
              No devices match “{q}”.
            </div>
          ) : groups.map(({ gateway, items }) => (
            <div key={gateway?.id || 'none'} className="py-2">
              <p className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
                {gateway ? gateway.name : 'Unassigned'}
              </p>
              {items.map((asset) => {
                const customType = getCustomAssetType(asset);
                const isPinned = pinned.has(asset.id);
                const active = isAssetActive(asset, customType);
                return (
                  <button
                    key={asset.id}
                    onClick={() => onToggle(asset.id, isPinned)}
                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[color-mix(in_srgb,var(--color-ink-0)_5%,transparent)] transition-colors text-left"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        active ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-ink-2)]'
                      }`}
                      style={{
                        background: active
                          ? 'color-mix(in srgb, var(--color-accent-500) 14%, transparent)'
                          : 'color-mix(in srgb, var(--color-ink-0) 6%, transparent)',
                      }}
                    >
                      <AssetGlyph customType={customType} on={active} className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--color-ink-0)] truncate">{getAssetDisplayName(asset)}</p>
                      <p className="text-[11px] text-[var(--color-ink-3)] truncate">{getAssetTypeLabel(customType)}</p>
                    </div>
                    <div
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                        isPinned
                          ? 'bg-[color-mix(in_srgb,var(--color-accent-500)_18%,transparent)] text-[var(--color-accent-400)]'
                          : 'text-[var(--color-ink-2)] border border-[color-mix(in_srgb,var(--color-ink-0)_14%,transparent)]'
                      }`}
                    >
                      {isPinned ? 'Pinned' : 'Pin'}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t flex items-center gap-2 text-[11px] text-[var(--color-ink-3)]"
             style={{ borderColor: 'color-mix(in srgb, var(--color-ink-0) 8%, transparent)' }}>
          <Info className="w-3.5 h-3.5" />
          <span>Pinned devices appear on the Quick access page in the order you add them.</span>
          <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-0" />
        </div>
      </motion.div>
    </div>
  );
}
