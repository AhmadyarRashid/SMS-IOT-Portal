/**
 * IoT API — HTTP + translator combined.
 *
 * One file per concern is enough at this stage. The translators (next door
 * in `./translators.js`) absorb wire-shape changes so pages/hooks don't
 * have to know what the backend looks like.
 *
 * Hooks and pages import from here. Never call axios directly elsewhere.
 */

import apiClient from '../client';
import { mapArray } from '../safeGet';
import { toAsset, toAlarm, toAlarmUpdate, toDatapoint } from './translators';

// ---------- assets ----------

export async function queryAssets(query = {}) {
  const { data } = await apiClient.post('/asset/query', query);
  return mapArray(data, toAsset);
}

export async function getAsset(assetId) {
  const { data } = await apiClient.get(`/asset/${assetId}`);
  return toAsset(data);
}

export async function getUserAssets() {
  // /asset/user/current can return full assets OR id strings OR link objects.
  // Translate only the fully-hydrated case; callers handle id-only shapes.
  const { data } = await apiClient.get('/asset/user/current');
  if (!Array.isArray(data) || data.length === 0) return [];
  const first = data[0];
  const isHydrated = typeof first === 'object' && first?.id && first?.type;
  return isHydrated ? mapArray(data, toAsset) : data;
}

export async function createAsset(asset) {
  const { data } = await apiClient.post('/asset', asset);
  return toAsset(data);
}

export async function updateAsset(asset) {
  if (!asset?.id) throw new Error('updateAsset: asset.id is required');
  const { data } = await apiClient.put(`/asset/${asset.id}`, asset);
  return toAsset(data);
}

export async function deleteAssets(assetIds) {
  const { data } = await apiClient.delete('/asset', { data: assetIds });
  return data;
}

export async function writeAttributeValue(assetId, attributeName, value) {
  const { data } = await apiClient.put(
    `/asset/${assetId}/attribute/${attributeName}`,
    JSON.stringify(value),
    { headers: { 'Content-Type': 'application/json' } }
  );
  return data;
}

// ---------- alarms ----------

export async function getAlarms(params = {}) {
  const { data } = await apiClient.get('/alarm', { params });
  return mapArray(data, toAlarm);
}

export async function getAlarm(alarmId) {
  const { data } = await apiClient.get(`/alarm/${alarmId}`);
  return toAlarm(data);
}

export async function getAlarmsByAsset(assetId) {
  const { data } = await apiClient.get('/alarm', { params: { assetId } });
  return mapArray(data, toAlarm);
}

/**
 * Update an alarm. The server's SentAlarm deserialiser is picky — it rejects
 * denormalised fields and server-managed timestamps. `toAlarmUpdate` builds
 * the minimal body before we send.
 */
export async function updateAlarm(alarm) {
  const body = toAlarmUpdate(alarm);
  const { data } = await apiClient.put(`/alarm/${body.id}`, body);
  return toAlarm(data);
}

export async function updateAlarmStatus(alarmId, status) {
  return updateAlarm({ id: alarmId, status });
}

// ---------- datapoints ----------

export async function getDatapoints(assetId, attributeName, query = {}) {
  const { data } = await apiClient.post(
    `/asset/datapoint/${assetId}/${attributeName}`,
    {
      fromTimestamp: query.fromTimestamp || Date.now() - 24 * 60 * 60 * 1000,
      toTimestamp: query.toTimestamp || Date.now(),
      type: query.type || 'LTTB',
      amountOfPoints: query.amountOfPoints || 100,
      ...query,
    }
  );
  return mapArray(data, toDatapoint);
}

export async function exportDatapoints(assetId, attributeName, fromTimestamp, toTimestamp) {
  const { data } = await apiClient.get(
    `/asset/datapoint/${assetId}/${attributeName}/export`,
    { params: { fromTimestamp, toTimestamp } }
  );
  return data;
}

// Translators are re-exported for any consumer that wants to round-trip.
export { toAsset, toAlarm, toAlarmUpdate, toDatapoint } from './translators';
