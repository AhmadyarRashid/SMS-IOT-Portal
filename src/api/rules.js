import apiClient from './client';

export async function getRules(params = {}) {
  const { data } = await apiClient.get('/rules', { params });
  return data;
}

export async function getRule(ruleId) {
  const { data } = await apiClient.get(`/rules/${ruleId}`);
  return data;
}

export async function createRule(rule) {
  const { data } = await apiClient.post('/rules', rule);
  return data;
}

export async function updateRule(rule) {
  const { data } = await apiClient.put(`/rules/${rule.id}`, rule);
  return data;
}

export async function deleteRule(ruleId) {
  const { data } = await apiClient.delete(`/rules/${ruleId}`);
  return data;
}

export async function toggleRule(ruleId, enabled) {
  const rule = await getRule(ruleId);
  rule.enabled = enabled;
  return updateRule(rule);
}
