import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { datasourcesApi } from '@/lib/api';

export function useDatasources() {
  return useQuery({
    queryKey: ['datasources'],
    queryFn: async () => {
      const response = await datasourcesApi.getAll();
      return response.data;
    },
    refetchInterval: 3000, // Auto-refresh every 3 seconds to show latest sync status
  });
}

export function useDatasource(id: string) {
  return useQuery({
    queryKey: ['datasources', id],
    queryFn: async () => {
      const response = await datasourcesApi.getOne(id);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateDatasource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      const response = await datasourcesApi.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasources'] });
    },
  });
}

export function useUpdateDatasource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await datasourcesApi.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['datasources'] });
      queryClient.invalidateQueries({ queryKey: ['datasources', variables.id] });
    },
  });
}

export function useDeleteDatasource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await datasourcesApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasources'] });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await datasourcesApi.testConnection(id);
      return response.data;
    },
  });
}

export function usePreviewData(id: string, limit: number = 5) {
  return useQuery({
    queryKey: ['datasources', id, 'preview', limit],
    queryFn: async () => {
      const response = await datasourcesApi.preview(id, limit);
      return response.data;
    },
    enabled: !!id,
  });
}
