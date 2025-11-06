import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Datasources API
export const datasourcesApi = {
  getAll: () => api.get('/datasources'),
  getOne: (id: string) => api.get(`/datasources/${id}`),
  create: (data: any) => api.post('/datasources', data),
  update: (id: string, data: any) => api.put(`/datasources/${id}`, data),
  delete: (id: string) => api.delete(`/datasources/${id}`),
  testConnection: (id: string) => api.post(`/datasources/${id}/test`),
  testConnectionConfig: (data: any) => api.post('/datasources/test-connection', data),
  preview: (id: string, limit: number = 5) => api.get(`/datasources/${id}/preview?limit=${limit}`),
  validateQuery: (id: string, query?: string) => api.post(`/datasources/${id}/validate-query`, { query }),
  regenerateWebhookSecret: (id: string) => api.post(`/datasources/${id}/regenerate-webhook-secret`),
};

// Collections API
export const collectionsApi = {
  getAll: () => api.get('/collections'),
  getOne: (name: string) => api.get(`/collections/${name}`),
  getInfo: (name: string) => api.get(`/collections/${name}/info`),
  create: (data: any) => api.post('/collections', data),
  delete: (name: string) => api.delete(`/collections/${name}`),
};

// Sync API
export const syncApi = {
  triggerFull: (datasourceId: string) => api.post(`/sync/full/${datasourceId}`),
  triggerIncremental: (datasourceId: string) => api.post(`/sync/incremental/${datasourceId}`),
  getJobs: (datasourceId?: string) => {
    const params = datasourceId ? `?datasourceId=${datasourceId}` : '';
    return api.get(`/sync/jobs${params}`);
  },
  getJob: (id: string) => api.get(`/sync/jobs/${id}`),
  cancelJob: (id: string) => api.post(`/sync/jobs/${id}/cancel`),
  getErrors: (jobId: string) => api.get(`/sync/errors/${jobId}`),
  retryErrors: (jobId: string) => api.post(`/sync/errors/${jobId}/retry`),
};

// Search API
export const searchApi = {
  searchByText: (params: { query: string; collections: string[]; limit?: number; marca?: string; cliente?: string; includeInternetSearch?: boolean; useLLMFilter?: boolean }) =>
    api.post('/search/text', params),
  searchByImage: (file: File, collection: string, limit: number = 10) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/search/image?collection=${collection}&limit=${limit}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  recommend: (collection: string, positiveIds: string[], negativeIds: string[] = [], limit: number = 10) =>
    api.post('/search/recommend', {
      collection,
      positiveIds,
      negativeIds,
      limit,
    }),
};

// Health API
export const healthApi = {
  check: () => api.get('/health'),
  checkDatabase: () => api.get('/health/database'),
  checkQdrant: () => api.get('/health/qdrant'),
  checkRedis: () => api.get('/health/redis'),
};

// Duplicates API
export const duplicatesApi = {
  detect: (
    collection: string,
    similarityThreshold?: number,
    limit?: number,
    useAiClassification?: boolean,
    filters?: Record<string, string | string[]>,
  ) =>
    api.post('/duplicates/detect', {
      collection,
      similarityThreshold,
      limit,
      useAiClassification,
      filters,
    }),
  analyzeProduct: (collection: string, productId: string, similarityThreshold?: number) =>
    api.post('/duplicates/analyze-product', {
      collection,
      productId,
      similarityThreshold,
    }),
  getReport: (collection: string) => api.get(`/duplicates/report?collection=${collection}`),
  getFilterValues: (collection: string) => api.get(`/duplicates/filter-values?collection=${collection}`),
  validateExists: (
    collection: string,
    descripcion: string,
    marca?: string,
    modelo?: string,
    similarityThreshold?: number,
  ) =>
    api.post('/duplicates/validate-exists', {
      collection,
      descripcion,
      marca,
      modelo,
      similarityThreshold,
    }),

  // Rules API
  getRules: (collection: string) => api.get(`/duplicates/rules/${collection}`),
  updateRules: (collection: string, rules: any) => api.put(`/duplicates/rules/${collection}`, rules),
  deleteRules: (collection: string) => api.delete(`/duplicates/rules/${collection}`),
  exportRules: (collection: string) => api.get(`/duplicates/rules/${collection}/export`),
  importRules: (collection: string, rules: any) => api.post(`/duplicates/rules/${collection}/import`, rules),
  testRules: (data: { collection: string; productId1: string; productId2: string; rules?: any }) =>
    api.post('/duplicates/rules/test', data),
};

export default api;
