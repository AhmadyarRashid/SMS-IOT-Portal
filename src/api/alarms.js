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

/**
 * Update an alarm. OpenRemote's AlarmResource maps this to
 *   PUT /alarm/{alarmId}   body: SentAlarm
 *
 * IMPORTANT: the alarm objects returned by `GET /alarm` carry denormalised
 * fields (`sourceName`, `assetId`) and server-managed timestamps
 * (`createdOn`, `lastModified`, `acknowledgedOn`, `acknowledgedBy`) that the
 * server-side SentAlarm deserializer rejects — or worse, blows up with a
 * 500 — when sent back. We explicitly build a minimal body with only the
 * core editable fields and let the server manage everything else.
 */
export async function updateAlarm(alarm) {
  if (!alarm?.id) throw new Error('updateAlarm: alarm.id is required');
  const body = {
    id: alarm.id,
    realm: alarm.realm,
    title: alarm.title,
    content: alarm.content ?? '',
    severity: alarm.severity,
    source: alarm.source,
    sourceId: alarm.sourceId,
    status: alarm.status,
    // Only include assigneeId if present — passing undefined is fine, but
    // passing a stale server-filled string could step on concurrent edits.
    ...(alarm.assigneeId ? { assigneeId: alarm.assigneeId } : {}),
  };
  const { data } = await apiClient.put(`/alarm/${alarm.id}`, body);
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
