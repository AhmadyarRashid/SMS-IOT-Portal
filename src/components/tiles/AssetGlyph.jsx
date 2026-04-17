import { createElement } from 'react';
import { getAssetIcon } from '../../utils/assetIcons';

/**
 * Renders the right Lucide outline icon for a given customAssetType.
 * Encapsulates dynamic-icon lookup so pages don't create components mid-render.
 */
export default function AssetGlyph({
  customType,
  on = false,
  alarm = false,
  className = 'w-6 h-6',
  strokeWidth = 1.75,
  spin = false,
  pulse = false,
}) {
  const Cmp = getAssetIcon(customType, { on, alarm });
  const cls = [
    className,
    spin ? 'spin-slow' : '',
    pulse ? 'pulse' : '',
  ].filter(Boolean).join(' ');
  return createElement(Cmp, { className: cls, strokeWidth });
}
