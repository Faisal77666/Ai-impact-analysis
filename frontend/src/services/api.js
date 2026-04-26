import axios from 'axios';

const apiTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS || 90000);

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  timeout: Number.isFinite(apiTimeoutMs) && apiTimeoutMs > 0 ? apiTimeoutMs : 90000
});

export const analyzeQuery = async (queryText) => {
  const response = await api.post('/api/analyze', { query: queryText });
  return response.data;
};

export const simulateImpactQuery = async (queryText) => {
  const response = await api.post('/api/analyze/simulate', { query: queryText });
  return response.data;
};

export const getHistory = async (limit = 20, skip = 0) => {
  const response = await api.get('/api/history', {
    params: { limit, skip }
  });
  return response.data;
};

export const getHistoryFiltered = async ({ limit = 20, skip = 0, risk = '', from = '', to = '' } = {}) => {
  const params = { limit, skip };
  if (risk) params.risk = risk;
  if (from) params.from = from;
  if (to) params.to = to;

  const response = await api.get('/api/history', {
    params
  });
  return response.data;
};

export const deleteHistoryItem = async (id) => {
  const response = await api.delete(`/api/history/${encodeURIComponent(id)}`);
  return response.data;
};

export const bulkDeleteHistory = async (ids = []) => {
  const response = await api.delete('/api/history', {
    data: { ids }
  });
  return response.data;
};

export const getMetadata = async (entityType, fqn) => {
  const response = await api.get(`/api/metadata/${encodeURIComponent(entityType)}/${encodeURIComponent(fqn)}`);
  return response.data;
};

export default api;
