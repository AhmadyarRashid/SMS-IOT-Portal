import apiClient from './client';

export async function getMapSettings() {
  const { data } = await apiClient.get('/map');
  return data;
}

export async function getMapTileUrl() {
  return `${apiClient.defaults.baseURL}/map/tile/{z}/{x}/{y}`;
}
