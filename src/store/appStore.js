import { create } from 'zustand';

const savedTheme = localStorage.getItem('sms_theme') || 'light';
const savedDensity = localStorage.getItem('sms_density') || 'comfortable';

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.documentElement.setAttribute('data-density', savedDensity);
}

const useAppStore = create((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  theme: savedTheme,
  density: savedDensity,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleCollapse: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  closeSidebar: () => set({ sidebarOpen: false }),
  setTheme: (theme) => {
    localStorage.setItem('sms_theme', theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    set({ theme });
  },
  toggleTheme: () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    localStorage.setItem('sms_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    set({ theme: next });
  },
  setDensity: (density) => {
    localStorage.setItem('sms_density', density);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-density', density);
    }
    set({ density });
  },
  toggleCompact: () => {
    const next = document.documentElement.getAttribute('data-density') === 'compact' ? 'comfortable' : 'compact';
    localStorage.setItem('sms_density', next);
    document.documentElement.setAttribute('data-density', next);
    set({ density: next });
  },
}));

export default useAppStore;
