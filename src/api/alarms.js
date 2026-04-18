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
  if (!alarm?.id) throw new Error('updateAlarm: alarm.id is required');
  // OpenRemote's AlarmResource expects PUT /alarm/{alarmId} with the full
  // SentAlarm body. Without the id in the path, the request silently no-ops.
  const { data } = await apiClient.put(`/alarm/${alarm.id}`, alarm);
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
  // Prefer updateAlarm() which sends the full body — the OR API wants the
  // complete SentAlarm, not a partial { status }.
  return updateAlarm({ id: alarmId, status });
}

export async function getAlarmSeverities() {
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
}

export async function getAlarmStatuses() {
  return ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
}
