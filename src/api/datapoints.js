import apiClient from './client';

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
  return data;
}

export async function getDatapointPeriod(assetId, attributeName) {
  const { data } = await apiClient.get(
    `/asset/datapoint/${assetId}/${attributeName}/period`
  );
  return data;
}

export async function exportDatapoints(assetId, attributeName, fromTimestamp, toTimestamp) {
  const { data } = await apiClient.get(
    `/asset/datapoint/${assetId}/${attributeName}/export`,
    { params: { fromTimestamp, toTimestamp } }
  );
  return data;
}

export async function getPredictedDatapoints(assetId, attributeName, query = {}) {
  const { data } = await apiClient.post(
    `/asset/predicted/${assetId}/${attributeName}`,
    {
      fromTimestamp: query.fromTimestamp || Date.now(),
      toTimestamp: query.toTimestamp || Date.now() + 24 * 60 * 60 * 1000,
      ...query,
    }
  );
  return data;
}
