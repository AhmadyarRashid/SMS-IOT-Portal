import { format, formatDistanceToNow, subHours, subDays, subWeeks } from 'date-fns';

export function formatDate(date) {
  return format(new Date(date), 'MMM dd, yyyy HH:mm');
}

export function formatRelativeTime(date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function getTimeRanges() {
  const now = Date.now();
  return {
    '1h': { fromTimestamp: subHours(now, 1).getTime(), toTimestamp: now },
    '6h': { fromTimestamp: subHours(now, 6).getTime(), toTimestamp: now },
    '24h': { fromTimestamp: subDays(now, 1).getTime(), toTimestamp: now },
    '7d': { fromTimestamp: subWeeks(now, 1).getTime(), toTimestamp: now },
    '30d': { fromTimestamp: subDays(now, 30).getTime(), toTimestamp: now },
  };
}

export function getAssetIcon(type) {
  const icons = {
    ThingAsset: 'Cpu',
    WeatherAsset: 'Cloud',
    ElectricityStorageAsset: 'Battery',
    LightAsset: 'Lightbulb',
    DoorAsset: 'DoorOpen',
    PeopleCounterAsset: 'Users',
    EnvironmentSensorAsset: 'Thermometer',
    ElectricVehicleAsset: 'Car',
    ParkingAsset: 'ParkingSquare',
    BuildingAsset: 'Building2',
    RoomAsset: 'Home',
    CityAsset: 'Building',
    MicrophoneAsset: 'Mic',
    ConsoleAsset: 'Monitor',
    GroupAsset: 'Layers',
  };
  return icons[type] || 'Cpu';
}

/**
 * Filter out console assets and agent/gateway assets from the list.
 */
export function filterVisibleAssets(assets) {
  if (!assets || !Array.isArray(assets)) return [];
  return assets.filter(asset => {
    const type = asset.type || '';
    if (type === 'ConsoleAsset') return false;
    if (type.endsWith('AgentAsset')) return false;
    return true;
  });
}

export function getAlarmSeverityColor(severity) {
  const colors = {
    LOW: { bg: 'bg-brand-500/10', text: 'text-brand-400', border: 'border-brand-500/20' },
    MEDIUM: { bg: 'bg-warning-500/10', text: 'text-warning-400', border: 'border-warning-500/20' },
    HIGH: { bg: 'bg-danger-500/10', text: 'text-danger-400', border: 'border-danger-500/20' },
    CRITICAL: { bg: 'bg-danger-500/20', text: 'text-danger-300', border: 'border-danger-400/30' },
  };
  return colors[severity] || colors.LOW;
}

export function getAlarmStatusColor(status) {
  const colors = {
    OPEN: 'danger',
    ACKNOWLEDGED: 'warning',
    IN_PROGRESS: 'info',
    RESOLVED: 'online',
    CLOSED: 'offline',
  };
  return colors[status] || 'info';
}

export function truncate(str, length = 30) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

export function generateChartColor(index) {
  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
  return colors[index % colors.length];
}
