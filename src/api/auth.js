import axios from 'axios';
import { REALM } from './client';

const AUTH_PATH = `/auth/realms/${REALM}/protocol/openid-connect`;

/**
 * Decode a JWT's payload without verifying its signature. The access token
 * already contains the user profile claims we need (preferred_username, email,
 * name, sub), so we can skip a round-trip to /userinfo entirely — and avoid a
 * 403 if the Keycloak client isn't configured to expose userinfo.
 */
function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1];
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    // Decode UTF-8 properly (handles non-ASCII names).
    const utf8 = decodeURIComponent(
      json.split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
    return JSON.parse(utf8);
  } catch {
    return null;
  }
}

export async function login(username, password) {
  // `client_id` is the Keycloak OAuth2 client configured on the SMS IoT
  // identity realm. It's a server-side name — don't change unless the realm
  // has been reconfigured to accept a different client id.
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: 'openremote',
    username,
    password,
  });

  const { data } = await axios.post(`${AUTH_PATH}/token`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  localStorage.setItem('or_access_token', data.access_token);
  if (data.refresh_token) {
    localStorage.setItem('or_refresh_token', data.refresh_token);
  }

  return data;
}

export async function loginWithClientCredentials(clientId, clientSecret) {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const { data } = await axios.post(`${AUTH_PATH}/token`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  localStorage.setItem('or_access_token', data.access_token);
  return data;
}

/**
 * Return user profile info. Prefers decoding the access token (which already
 * carries Keycloak profile claims) — falls back to /userinfo only if decoding
 * somehow fails. Never throws on 403: returns a minimal fallback instead so
 * login can still complete.
 */
export async function getUserInfo() {
  const token = localStorage.getItem('or_access_token');
  if (!token) return null;

  const claims = decodeJwt(token);
  if (claims && (claims.preferred_username || claims.email || claims.sub)) {
    return {
      sub: claims.sub,
      name: claims.name || claims.preferred_username,
      preferred_username: claims.preferred_username,
      email: claims.email,
      email_verified: claims.email_verified,
      realm_access: claims.realm_access,
      resource_access: claims.resource_access,
    };
  }

  // Last-resort network fallback — quietly degrade if the endpoint 403s.
  try {
    const { data } = await axios.get(`${AUTH_PATH}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  } catch {
    return { preferred_username: 'user' };
  }
}

export function logout() {
  localStorage.removeItem('or_access_token');
  localStorage.removeItem('or_refresh_token');
  localStorage.removeItem('or_user');
}

export function isAuthenticated() {
  return !!localStorage.getItem('or_access_token');
}

export function getToken() {
  return localStorage.getItem('or_access_token');
}
