import apiClient from './client';

export async function getNotifications(params = {}) {
  const { data } = await apiClient.get('/notification', { params });
  return data;
}

export async function sendNotification(notification) {
  const { data } = await apiClient.post('/notification', notification);
  return data;
}

export async function deleteNotification(notificationId) {
  const { data } = await apiClient.delete(`/notification/${notificationId}`);
  return data;
}

export async function getNotificationTargets() {
  const { data } = await apiClient.get('/notification/target');
  return data;
}
