import './skeleton.css';

/**
 * Skeleton primitives — animated placeholder shapes used in place of spinners
 * on initial page loads. All variants share a single shimmer keyframe so the
 * whole page animates in lockstep.
 *
 *   <Skeleton.Box h={120} />
 *   <Skeleton.Text lines={2} />
 *   <Skeleton.Circle size={48} />
 *   <Skeleton.Card />          — generic card-shaped placeholder
 *   <Skeleton.Grid cols={3} count={6} />
 */

function Box({ h = 16, w, rounded = 8, className = '', style, ...rest }) {
  return (
    <span
      className={`sk sk-box ${className}`}
      style={{
        height: typeof h === 'number' ? `${h}px` : h,
        width: w == null ? '100%' : (typeof w === 'number' ? `${w}px` : w),
        borderRadius: rounded,
        ...style,
      }}
      {...rest}
    />
  );
}

function Circle({ size = 40, className = '' }) {
  return (
    <span
      className={`sk sk-box ${className}`}
      style={{ width: size, height: size, borderRadius: '50%' }}
    />
  );
}

function Text({ lines = 1, width = '100%', className = '' }) {
  const widths = Array.isArray(width) ? width : Array.from({ length: lines }).map((_, i) =>
    i === lines - 1 && lines > 1 ? '60%' : width
  );
  return (
    <span className={`flex flex-col gap-2 w-full ${className}`}>
      {widths.map((w, i) => (
        <Box key={i} h={12} w={w} rounded={4} />
      ))}
    </span>
  );
}

function Card({ h = 180, className = '' }) {
  return (
    <div className={`sk-card ${className}`} style={{ minHeight: h }}>
      <div className="flex items-start gap-3">
        <Circle size={44} />
        <div className="flex-1 flex flex-col gap-2">
          <Box h={14} w="70%" />
          <Box h={10} w="45%" />
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3">
        <Box h={6} />
        <div className="grid grid-cols-4 gap-2">
          <Box h={40} />
          <Box h={40} />
          <Box h={40} />
          <Box h={40} />
        </div>
      </div>
    </div>
  );
}

function Grid({ cols = 3, count = 6, cardHeight = 180 }) {
  const colsClass =
    cols === 1 ? 'grid-cols-1' :
    cols === 2 ? 'grid-cols-1 md:grid-cols-2' :
    cols === 4 ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' :
    'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
  return (
    <div className={`grid gap-4 ${colsClass}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} h={cardHeight} />
      ))}
    </div>
  );
}

/** Page-shell skeleton for the asset detail hero + tabs area. */
function Hero() {
  return (
    <div className="sk-card" style={{ padding: 24 }}>
      <div className="flex flex-col items-center gap-4">
        <Box h={10} w="120px" rounded={4} />
        <Circle size={128} />
        <Box h={20} w="220px" rounded={6} />
        <Box h={14} w="140px" rounded={4} />
      </div>
    </div>
  );
}

const Skeleton = { Box, Circle, Text, Card, Grid, Hero };
export default Skeleton;
