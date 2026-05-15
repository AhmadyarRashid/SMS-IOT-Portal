import axios from 'axios';

// Support both the new SMS IoT-branded env vars and the legacy OpenRemote names.
const REALM =
  import.meta.env.VITE_SMS_IOT_REALM ||
  import.meta.env.VITE_OPENREMOTE_REALM ||
  'master';

const apiClient = axios.create({
  baseURL: `/api/${REALM}`,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('or_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Single in-flight refresh promise. Concurrent 401s share this — without
 * dedup, every parallel request (useAssets + useAlarms polling at 15s) hits
 * `/token` with the same refresh token; Keycloak rotates on the first success
 * and rejects the rest, which then log the user out. With dedup the refresh
 * runs exactly once per token expiry and every queued request retries with
 * the same new access token.
 */
let refreshInFlight = null;

function startRefresh(refreshToken) {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(refreshToken)
      .then((response) => {
        localStorage.setItem('or_access_token', response.access_token);
        if (response.refresh_token) {
          localStorage.setItem('or_refresh_token', response.refresh_token);
        }
        return response.access_token;
      })
      .finally(() => {
        // Clear the cached promise whether it succeeded or failed so the
        // next expiry can trigger a fresh refresh attempt.
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const config = error.config || {};

    if (status === 401 && !config._retry) {
      // Mark the request so a second 401 on the retry doesn't recurse.
      config._retry = true;
      const refreshToken = localStorage.getItem('or_refresh_token');
      if (refreshToken) {
        try {
          const newAccessToken = await startRefresh(refreshToken);
          config.headers = { ...(config.headers || {}), Authorization: `Bearer ${newAccessToken}` };
          return apiClient(config);
        } catch {
          localStorage.removeItem('or_access_token');
          localStorage.removeItem('or_refresh_token');
          window.location.href = '/login';
        }
      } else {
        localStorage.removeItem('or_access_token');
        window.location.href = '/login';
      }
    }

    // 403 = authenticated but missing role. Tag the error so UI layers can
    // degrade gracefully (show empty state instead of crashing).
    if (status === 403) {
      error.isForbidden = true;
    }

    return Promise.reject(error);
  }
);

async function refreshAccessToken(refreshToken) {
  // NOTE: `client_id` is the Keycloak OAuth2 client name configured on the
  // SMS IoT backend realm — don't rename without coordinating with the
  // identity server.
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: 'openremote',
    refresh_token: refreshToken,
  });
  const { data } = await axios.post(
    `/auth/realms/${REALM}/protocol/openid-connect/token`,
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return data;
}

export { REALM };
export default apiClient;
