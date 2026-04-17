import { create } from 'zustand';
import { login as apiLogin, logout as apiLogout, getUserInfo } from '../api/auth';

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('or_user') || 'null'),
  token: localStorage.getItem('or_access_token'),
  isAuthenticated: !!localStorage.getItem('or_access_token'),
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const tokenData = await apiLogin(username, password);
      // Profile fetch is best-effort — never blocks login. getUserInfo()
      // already falls back to JWT claims / a minimal stub if the network
      // call fails, so this should always return something usable.
      let userInfo;
      try {
        userInfo = await getUserInfo();
      } catch {
        userInfo = { preferred_username: username };
      }
      localStorage.setItem('or_user', JSON.stringify(userInfo));
      set({
        user: userInfo,
        token: tokenData.access_token,
        isAuthenticated: true,
        isLoading: false,
      });
      return true;
    } catch (error) {
      const status = error.response?.status;
      const message =
        status === 401
          ? 'Invalid username or password'
          : status === 403
            ? 'Your account is not allowed to sign in to this portal.'
            : error.response?.data?.error_description ||
              'Login failed. Check your connection.';
      set({ error: message, isLoading: false });
      return false;
    }
  },

  logout: () => {
    apiLogout();
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
