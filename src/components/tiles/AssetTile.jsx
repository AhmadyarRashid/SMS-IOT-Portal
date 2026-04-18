import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import {
  getCustomAssetType, isAssetActive, isAssetAlarming,
  getPrimaryControlAttr, getStateLabel, nextToggleValue, CONTROLLABLE_TYPES,
  getAssetDisplayName,
} from '../../utils/assetIcons';
import { useWriteAttribute } from '../../hooks/useAssets';
import AssetGlyph from './AssetGlyph';

/**
 * Home Assistant Tile Card — the icon IS the primary action.
 *   • Controllable device (light, plug, fan, lock, alarm):
 *       click icon      → toggle on/off (color + glow change)
 *       click anywhere else → open detail page
 *   • Sensor (temperature, motion, smoke, camera, ...):
 *       click icon or tile → open detail page (icon doesn't toggle)
 */
export default function AssetTile({ asset }) {
  const navigate = useNavigate();
  const customType = getCustomAssetType(asset);
  const active = isAssetActive(asset, customType);
  const alarm = isAssetAlarming(asset, customType);
  const write = useWriteAttribute();

  const controllable = CONTROLLABLE_TYPES.includes(customType);
  const primaryAttr = getPrimaryControlAttr(asset, customType);
  const stateLabel = getStateLabel(asset, customType);
  const displayName = getAssetDisplayName(asset);

  const tone = alarm ? 'alarm' : active ? 'on' : 'off';

  const handleIconClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Controllable types always toggle — even if the attribute value hasn't
    // been set yet, the SMS IoT backend will initialise it on the first write.
    if (controllable && primaryAttr) {
      write.mutate({
        assetId: asset.id,
        attributeName: primaryAttr,
        value: nextToggleValue(asset, primaryAttr),
      });
      return;
    }
    // Sensors: clicking the icon opens the detail view (nothing to toggle).
    navigate(`/a/${asset.id}`);
  };

  return (
    <motion.div whileHover={{ y: -1 }} className={`ha-tile ha-tile-${tone}`}>
      {/* Icon button — the primary action */}
      <motion.button
        onClick={handleIconClick}
        whileTap={{ scale: 0.88 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        className={`ha-tile-icon ha-tile-icon-${tone} ha-tile-icon-btn`}
        aria-label={controllable ? `Toggle ${displayName}` : `Open ${displayName}`}
        aria-pressed={controllable ? active : undefined}
        disabled={write.isPending && write.variables?.assetId === asset.id}
      >
        <motion.div
          key={`${tone}-${active}`}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 24 }}
        >
          <AssetGlyph
            customType={customType}
            on={active}
            alarm={alarm}
            className="w-6 h-6"
            spin={customType === 'FanAsset' && active}
            pulse={alarm}
          />
        </motion.div>
      </motion.button>

      {/* Body opens detail */}
      <Link
        to={`/a/${asset.id}`}
        className="flex-1 min-w-0 flex items-center gap-2 group"
        aria-label={`Open ${displayName}`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--color-ink-0)] truncate leading-tight">
            {displayName}
          </p>
          <p className={`text-[11px] mt-0.5 truncate leading-tight ${
            alarm ? 'text-[var(--color-danger-400)] font-semibold'
              : active ? 'text-[var(--color-accent-400)]'
              : 'text-[var(--color-ink-2)]'
          }`}>
            {stateLabel}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-[var(--color-ink-3)] group-hover:text-[var(--color-ink-1)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.75} />
      </Link>
    </motion.div>
  );
}
