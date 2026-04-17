import apiClient from './client';

export async function getUsers(params = {}) {
  const { data } = await apiClient.get('/user', { params });
  return data;
}

export async function getUser(userId) {
  const { data } = await apiClient.get(`/user/${userId}`);
  return data;
}

export async function getCurrentUser() {
  const { data } = await apiClient.get('/user/current');
  return data;
}

export async function updateUser(user) {
  const { data } = await apiClient.put(`/user/${user.id}`, user);
  return data;
}

export async function getRoles() {
  const { data } = await apiClient.get('/user/role');
  return data;
}

export async function getUserRoles(userId) {
  const { data } = await apiClient.get(`/user/${userId}/role`);
  return data;
}
