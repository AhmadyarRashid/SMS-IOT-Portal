import apiClient from './client';

export async function getDashboards() {
  const { data } = await apiClient.get('/dashboard/all');
  return data;
}

export async function getDashboard(dashboardId) {
  const { data } = await apiClient.get(`/dashboard/${dashboardId}`);
  return data;
}

export async function createDashboard(dashboard) {
  const { data } = await apiClient.post('/dashboard', dashboard);
  return data;
}

export async function updateDashboard(dashboard) {
  const { data } = await apiClient.put('/dashboard', dashboard);
  return data;
}

export async function deleteDashboard(dashboardId) {
  const { data } = await apiClient.delete(`/dashboard/${dashboardId}`);
  return data;
}
