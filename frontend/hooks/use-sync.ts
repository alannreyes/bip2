import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { syncApi } from '@/lib/api';

export function useSyncJobs(datasourceId?: string) {
  return useQuery({
    queryKey: ['sync-jobs', datasourceId],
    queryFn: async () => {
      const response = await syncApi.getJobs(datasourceId);
      return response.data;
    },
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}

export function useSyncJob(id: string) {
  return useQuery({
    queryKey: ['sync-jobs', id],
    queryFn: async () => {
      const response = await syncApi.getJob(id);
      return response.data;
    },
    enabled: !!id,
    refetchInterval: (data) => {
      // Stop refetching if job is completed, failed, or cancelled
      if (data?.status === 'completed' || data?.status === 'failed' || data?.status === 'cancelled') {
        return false;
      }
      return 2000; // Refetch every 2 seconds while running
    },
  });
}

export function useTriggerFullSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (datasourceId: string) => {
      const response = await syncApi.triggerFull(datasourceId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['datasources'] });
    },
  });
}

export function useTriggerIncrementalSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (datasourceId: string) => {
      const response = await syncApi.triggerIncremental(datasourceId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['datasources'] });
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await syncApi.cancelJob(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-jobs'] });
    },
  });
}

export function useSyncErrors(jobId: string) {
  return useQuery({
    queryKey: ['sync-errors', jobId],
    queryFn: async () => {
      const response = await syncApi.getErrors(jobId);
      return response.data;
    },
    enabled: !!jobId,
  });
}
