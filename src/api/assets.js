import apiClient from './client';

export async function queryAssets(query = {}) {
  const { data } = await apiClient.post('/asset/query', query);
  return data;
}

export async function getAsset(assetId) {
  const { data } = await apiClient.get(`/asset/${assetId}`);
  return data;
}

export async function createAsset(asset) {
  const { data } = await apiClient.post('/asset', asset);
  return data;
}

export async function updateAsset(asset) {
  if (!asset?.id) throw new Error('updateAsset: asset.id is required');
  // OpenRemote's AssetResource expects PUT /asset/{assetId} with the full
  // Asset body. Without the id in the path the request silently no-ops.
  const { data } = await apiClient.put(`/asset/${asset.id}`, asset);
  return data;
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

export async function getAssetTree(query = {}) {
  const { data } = await apiClient.post('/asset/tree', query);
  return data;
}

export async function getUserAssets() {
  const { data } = await apiClient.get('/asset/user/current');
  return data;
}

export async function getAssetModel() {
  const { data } = await apiClient.get('/model/asset/descriptor');
  return data;
}

export async function getAssetTypeInfo() {
  const { data } = await apiClient.get('/model/asset/typeInfo');
  return data;
}
