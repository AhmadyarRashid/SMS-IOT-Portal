/* ==========================================================================
   Chartable attribute predicates

   Lives in utils/ (not next to AssetHistoryCard.jsx) because eslint's
   react-refresh/only-export-components rule forbids exporting non-component
   values from a component file. Used by AssetHistoryCard to decide which
   attributes are plottable, and by the Control page's HistoryPanel to
   decide which tower children to offer in its asset dropdown.
   ========================================================================== */

const CHARTABLE_TYPES = new Set([
  'number', 'integer', 'positiveInteger', 'negativeInteger',
  'positiveNumber', 'negativeNumber', 'long', 'double', 'float',
  'boolean',
]);

export function isChartableAttr(attr) {
  if (!attr) return false;
  if (typeof attr.type === 'string' && CHARTABLE_TYPES.has(attr.type)) return true;
  const v = attr.value;
  return typeof v === 'number' || typeof v === 'boolean';
}

export function hasChartableAttributes(asset) {
  const attrs = asset?.attributes || {};
  for (const k in attrs) if (isChartableAttr(attrs[k])) return true;
  return false;
}
