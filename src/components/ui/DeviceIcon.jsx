import {
  Lightbulb, SlidersHorizontal, Plug, DoorOpen, DoorClosed,
  BatteryCharging, Battery, CloudSun, Thermometer, Car, Cpu,
  Building2, Home, Building, Mic, Layers, Users, ParkingSquare,
  Monitor, Radio, Gauge, Flame, Droplets, Wind, Sun, Waves
} from 'lucide-react';

const ASSET_CONFIG = {
  LightAsset:               { icon: Lightbulb,          onColor: 'text-yellow-400',  offColor: 'text-slate-400', onBg: 'bg-yellow-50 border-yellow-200', glow: true },
  DimmerAsset:              { icon: SlidersHorizontal,   onColor: 'text-amber-500',   offColor: 'text-slate-400', onBg: 'bg-amber-50 border-amber-200', glow: true },
  PlugAsset:                { icon: Plug,                onColor: 'text-green-500',   offColor: 'text-slate-400', onBg: 'bg-green-50 border-green-200', glow: true },
  DoorAsset:                { iconOn: DoorOpen,  iconOff: DoorClosed, onColor: 'text-blue-500',   offColor: 'text-slate-500', onBg: 'bg-blue-50 border-blue-200' },
  ElectricityStorageAsset:  { iconOn: BatteryCharging, iconOff: Battery, onColor: 'text-green-500', offColor: 'text-red-500', onBg: 'bg-green-50 border-green-200' },
  WeatherAsset:             { icon: CloudSun,            onColor: 'text-cyan-500',    offColor: 'text-slate-400', onBg: 'bg-cyan-50 border-cyan-200' },
  EnvironmentSensorAsset:   { icon: Thermometer,         onColor: 'text-orange-500',  offColor: 'text-slate-400', onBg: 'bg-orange-50 border-orange-200' },
  ElectricVehicleAsset:     { icon: Car,                 onColor: 'text-purple-500',  offColor: 'text-slate-400', onBg: 'bg-purple-50 border-purple-200' },
  BuildingAsset:            { icon: Building2,           onColor: 'text-indigo-500',  offColor: 'text-slate-400', onBg: 'bg-indigo-50 border-indigo-200' },
  RoomAsset:                { icon: Home,                onColor: 'text-teal-500',    offColor: 'text-slate-400', onBg: 'bg-teal-50 border-teal-200' },
  CityAsset:                { icon: Building,            onColor: 'text-sky-500',     offColor: 'text-slate-400', onBg: 'bg-sky-50 border-sky-200' },
  MicrophoneAsset:          { icon: Mic,                 onColor: 'text-pink-500',    offColor: 'text-slate-400', onBg: 'bg-pink-50 border-pink-200' },
  GroupAsset:               { icon: Layers,              onColor: 'text-violet-500',  offColor: 'text-slate-400', onBg: 'bg-violet-50 border-violet-200' },
  PeopleCounterAsset:       { icon: Users,               onColor: 'text-emerald-500', offColor: 'text-slate-400', onBg: 'bg-emerald-50 border-emerald-200' },
  ParkingAsset:             { icon: ParkingSquare,       onColor: 'text-blue-500',    offColor: 'text-slate-400', onBg: 'bg-blue-50 border-blue-200' },
  ConsoleAsset:             { icon: Monitor,             onColor: 'text-slate-500',   offColor: 'text-slate-400', onBg: 'bg-slate-100 border-slate-200' },
  ThingAsset:               { icon: Cpu,                 onColor: 'text-brand-500',   offColor: 'text-slate-400', onBg: 'bg-brand-50 border-brand-200' },
};

const DEFAULT_CONFIG = { icon: Cpu, onColor: 'text-brand-500', offColor: 'text-slate-400', onBg: 'bg-brand-50 border-brand-200' };

const SIZES = {
  sm: { icon: 'w-3.5 h-3.5', wrapper: 'p-1.5 rounded-lg' },
  md: { icon: 'w-5 h-5',     wrapper: 'p-2.5 rounded-xl' },
  lg: { icon: 'w-7 h-7',     wrapper: 'p-3 rounded-xl' },
};

export default function DeviceIcon({ type, status = 'online', size = 'md', withBackground = true, className = '' }) {
  const config = ASSET_CONFIG[type] || DEFAULT_CONFIG;
  const isOn = status === 'online' || status === 'warning';
  const sizeConfig = SIZES[size] || SIZES.md;

  // Resolve icon – some asset types swap icons based on state
  const IconComponent = config.iconOn
    ? (isOn ? config.iconOn : config.iconOff)
    : config.icon;

  const colorClass = isOn ? config.onColor : config.offColor;
  const glowClass = config.glow && isOn ? 'device-icon-glow' : '';

  if (!withBackground) {
    return <IconComponent className={`${sizeConfig.icon} ${colorClass} ${glowClass} ${className}`} />;
  }

  const bgClass = isOn
    ? config.onBg
    : 'bg-slate-100 border-slate-200';

  return (
    <div className={`${sizeConfig.wrapper} border ${bgClass} ${glowClass} ${className}`}>
      <IconComponent className={`${sizeConfig.icon} ${colorClass}`} />
    </div>
  );
}
