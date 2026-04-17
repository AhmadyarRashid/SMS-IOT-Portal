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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;

    if (status === 401) {
      const refreshToken = localStorage.getItem('or_refresh_token');
      if (refreshToken) {
        try {
          const response = await refreshAccessToken(refreshToken);
          localStorage.setItem('or_access_token', response.access_token);
          if (response.refresh_token) {
            localStorage.setItem('or_refresh_token', response.refresh_token);
          }
          error.config.headers.Authorization = `Bearer ${response.access_token}`;
          return apiClient(error.config);
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
