import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  queryAssets, getAsset, writeAttributeValue, updateAsset, getUserAssets,
} from '../api/assets';
import { getDatapoints } from '../api/datapoints';
import { getAlarms, updateAlarm } from '../api/alarms';
import { getRules, createRule as apiCreateRule, updateRule as apiUpdateRule, deleteRule as apiDeleteRule } from '../api/rules';
import { pickGateways, pickGatewayChildren } from '../utils/gateways';
import toast from 'react-hot-toast';

/**
 * Fetch all assets visible to the current user. Falls back to
 * `/asset/user/current` if the user is restricted and can't run `/asset/query`
 * directly (returns 403).
 */
async function fetchAssetsWithFallback(query) {
  try {
    return await queryAssets(query);
  } catch (err) {
    if (err.isForbidden || err.response?.status === 403) {
      // Restricted users can still retrieve their own linked assets.
      try {
        const linked = await getUserAssets();
        // Endpoint may return full assets, or just IDs — normalise.
        if (Array.isArray(linked) && linked.length && typeof linked[0] === 'object' && linked[0].id) {
          return linked;
        }
        // If it returned IDs or link objects, re-query for those specific IDs
        // (this shape is accepted even for restricted users).
        const ids = (linked || [])
          .map((l) => (typeof l === 'string' ? l : l.assetId || l.id))
          .filter(Boolean);
        if (ids.length) return await queryAssets({ ids });
        return [];
      } catch {
        return [];
      }
    }
    throw err;
  }
}

export function useAssets(query = {}) {
  return useQuery({
    queryKey: ['assets', query],
    queryFn: () => fetchAssetsWithFallback(query),
    // Re-poll every 15s so state changes coming from the OR manager UI (or any
    // other client) propagate into the React Query cache — which in turn feeds
    // the activity diff-watcher and the /live session feed. Works even when
    // the WebSocket isn't available.
    staleTime: 10000,
    refetchInterval: 15000,
    // CRITICAL: poll even when the tab is hidden. Without this, browser
    // notifications never fire because we don't detect new alarms while the
    // window is minimised / in another tab.
    refetchIntervalInBackground: true,
  });
}

/**
 * All gateways visible to the current user (realm-scoped by backend).
 */
export function useGateways() {
  const { data, ...rest } = useAssets({});
  return { ...rest, data: pickGateways(data) };
}

/**
 * Children of a specific gateway. Re-uses the cached full asset list.
 */
export function useGatewayChildren(gatewayId) {
  const { data, ...rest } = useAssets({});
  return { ...rest, data: pickGatewayChildren(data, gatewayId) };
}

export function useAsset(assetId) {
  return useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => getAsset(assetId),
    enabled: !!assetId,
  });
}

export function useAssetDatapoints(assetId, attributeName, timeRange) {
  return useQuery({
    queryKey: ['datapoints', assetId, attributeName, timeRange],
    queryFn: () => getDatapoints(assetId, attributeName, timeRange),
    enabled: !!assetId && !!attributeName,
    refetchInterval: 60000,
  });
}

export function useAlarms(params = {}) {
  return useQuery({
    queryKey: ['alarms', params],
    queryFn: async () => {
      try { return await getAlarms(params); }
      catch (err) {
        if (err.isForbidden || err.response?.status === 403) return [];
        throw err;
      }
    },
    // Re-poll every 15s so alarms created on the SMS IoT backend surface in
    // the portal (toast + OS notification + /live feed + sidebar badge)
    // without the user having to navigate.
    staleTime: 10000,
    refetchInterval: 15000,
    // CRITICAL: poll even when the tab is hidden. Without this, a user who
    // minimises Chrome would never get an alarm notification — the whole
    // point of OS notifications is to reach the user when they're away.
    refetchIntervalInBackground: true,
  });
}

export function useUpdateAlarmStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alarm, status }) => updateAlarm({ ...alarm, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alarms'] });
      toast.success('Alarm status updated');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update alarm');
    },
  });
}

export function useRules() {
  return useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      try { return await getRules(); }
      catch (err) {
        if (err.isForbidden || err.response?.status === 403) return [];
        throw err;
      }
    },
    staleTime: 30000,
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rule) => apiCreateRule(rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      toast.success('Rule created successfully');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to create rule');
    },
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rule) => apiUpdateRule(rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      toast.success('Rule updated');
    },
    onError: () => toast.error('Failed to update rule'),
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId) => apiDeleteRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      toast.success('Rule deleted');
    },
    onError: () => toast.error('Failed to delete rule'),
  });
}

/**
 * Write a single attribute and optimistically update the React Query caches so
 * every icon / switch / state label reflects the new value *instantly* — no
 * waiting for a server round-trip. If the write fails, the caches are rolled
 * back and the UI returns to its previous state.
 */
export function useWriteAttribute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, attributeName, value }) =>
      writeAttributeValue(assetId, attributeName, value),

    onMutate: async ({ assetId, attributeName, value }) => {
      // Pause any in-flight fetches so they don't overwrite our optimistic data.
      await queryClient.cancelQueries({ queryKey: ['asset', assetId] });
      await queryClient.cancelQueries({ queryKey: ['assets'] });

      // Snapshot current cache so we can roll back on error.
      const prevAsset = queryClient.getQueryData(['asset', assetId]);
      const prevLists = queryClient.getQueriesData({ queryKey: ['assets'] });

      const patchAsset = (a) => {
        if (!a || a.id !== assetId) return a;
        const existing = a.attributes?.[attributeName] || { name: attributeName };
        return {
          ...a,
          attributes: {
            ...a.attributes,
            [attributeName]: { ...existing, value },
          },
        };
      };

      if (prevAsset) {
        queryClient.setQueryData(['asset', assetId], patchAsset(prevAsset));
      }

      for (const [key, data] of prevLists) {
        if (Array.isArray(data)) {
          queryClient.setQueryData(key, data.map(patchAsset));
        }
      }

      return { prevAsset, prevLists };
    },

    onError: (err, _vars, ctx) => {
      // Roll back.
      if (ctx?.prevAsset) {
        queryClient.setQueryData(['asset', ctx.prevAsset.id], ctx.prevAsset);
      }
      if (ctx?.prevLists) {
        for (const [key, data] of ctx.prevLists) queryClient.setQueryData(key, data);
      }
      if (err.isForbidden || err.response?.status === 403) {
        toast.error('You do not have permission to control this device.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to update attribute');
      }
    },

    onSettled: (_data, _err, vars) => {
      // Reconcile with authoritative server state (covers cases where the
      // server coerces types or the optimistic guess was slightly off).
      queryClient.invalidateQueries({ queryKey: ['asset', vars.assetId] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useUpdateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (asset) => updateAsset(asset),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['asset'] });
      toast.success('Asset updated');
    },
    onError: () => toast.error('Failed to update asset'),
  });
}
