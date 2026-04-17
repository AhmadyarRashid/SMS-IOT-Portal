import apiClient from './client';

export async function getAlarms(params = {}) {
  const { data } = await apiClient.get('/alarm', { params });
  return data;
}

export async function getAlarm(alarmId) {
  const { data } = await apiClient.get(`/alarm/${alarmId}`);
  return data;
}

export async function createAlarm(alarm) {
  const { data } = await apiClient.post('/alarm', alarm);
  return data;
}

export async function updateAlarm(alarm) {
  const { data } = await apiClient.put('/alarm', alarm);
  return data;
}

export async function deleteAlarm(alarmId) {
  const { data } = await apiClient.delete(`/alarm/${alarmId}`);
  return data;
}

export async function getAlarmsByAsset(assetId) {
  const { data } = await apiClient.get(`/alarm`, {
    params: { assetId },
  });
  return data;
}

export async function updateAlarmStatus(alarmId, status) {
  const { data } = await apiClient.put(`/alarm/${alarmId}`, { status });
  return data;
}

export async function getAlarmSeverities() {
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
}

export async function getAlarmStatuses() {
  return ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
}
