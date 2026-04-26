const axios = require('axios');
const env = require('../config/env');
const { withRetry } = require('../utils/retry');
const { TTLCache } = require('../utils/cache');

const OM_TIMEOUT_MS = Number(process.env.OPENMETADATA_TIMEOUT_MS || 30000);
const OM_RETRY_COUNT = Number(process.env.OPENMETADATA_RETRY_COUNT || 2);
const TABLE_CACHE_TTL_MS = Number(process.env.OM_TABLE_CACHE_TTL_MS || 60_000);
const LINEAGE_CACHE_TTL_MS = Number(process.env.OM_LINEAGE_CACHE_TTL_MS || 30_000);

const omClient = axios.create({
  baseURL: env.OPENMETADATA_BASE_URL,
  timeout: OM_TIMEOUT_MS
});

let sessionToken = '';
let sessionTokenExpiresAt = 0;

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_TABLES = 5000;
const cache = new TTLCache(60_000, 1000);

const shouldRetryOm = (error) => {
  const status = error?.response?.status;
  return !status || status >= 500 || status === 429;
};

const decodeJwtExpiryMs = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return 0;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    if (!payload?.exp) return 0;
    return Number(payload.exp) * 1000;
  } catch (error) {
    return 0;
  }
};

const loginWithAdminCredentials = async () => {
  const encodedPassword = Buffer.from(env.OPENMETADATA_ADMIN_PASSWORD || '').toString('base64');
  const response = await omClient.post('/api/v1/users/login', {
    email: env.OPENMETADATA_ADMIN_EMAIL,
    password: encodedPassword
  });

  const token = response.data?.accessToken;
  if (!token) {
    throw new Error('OpenMetadata login succeeded but accessToken was not returned.');
  }

  const tokenExpiryMs = decodeJwtExpiryMs(token);
  sessionToken = token;
  sessionTokenExpiresAt = tokenExpiryMs || Date.now() + 10 * 60 * 1000;
  return sessionToken;
};

const getOpenMetadataToken = async (forceRefresh = false) => {
  const staticToken = String(env.OPENMETADATA_TOKEN || '').trim();
  if (staticToken && !forceRefresh) {
    return staticToken;
  }

  const hasSessionToken = sessionToken && Date.now() < (sessionTokenExpiresAt - 30_000);
  if (!forceRefresh && hasSessionToken) {
    return sessionToken;
  }

  return loginWithAdminCredentials();
};

const requestWithAuth = async (config) => {
  const token = await getOpenMetadataToken(false);
  const authConfig = {
    ...config,
    headers: {
      ...(config?.headers || {}),
      Authorization: `Bearer ${token}`
    }
  };

  try {
    return await omClient.request(authConfig);
  } catch (error) {
    if (error?.response?.status !== 401) {
      throw error;
    }

    const refreshedToken = await getOpenMetadataToken(true);
    return omClient.request({
      ...config,
      headers: {
        ...(config?.headers || {}),
        Authorization: `Bearer ${refreshedToken}`
      }
    });
  }
};

const getWithRetry = async (url) => {
  return withRetry(
    async () => {
      const response = await requestWithAuth({ method: 'get', url });
      return response;
    },
    { retries: OM_RETRY_COUNT, baseDelayMs: 250, retryOn: shouldRetryOm }
  );
};

const fetchTablesPage = async ({ limit = DEFAULT_PAGE_SIZE, after = '' } = {}) => {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('include', 'all');
  if (after) params.set('after', String(after));

  const response = await getWithRetry(`/api/v1/tables?${params.toString()}`);
  return {
    data: response.data?.data || [],
    after: response.data?.paging?.after || ''
  };
};

/**
 * Get table by FQN
 */
const getTableByFQN = async (fqn) => {
  const cacheKey = `table:fqn:${fqn}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const encodedFqn = encodeURIComponent(fqn);
  const response = await getWithRetry(`/api/v1/tables/name/${encodedFqn}`);
  cache.set(cacheKey, response.data, TABLE_CACHE_TTL_MS);
  return response.data;
};

/**
 * Get all tables and filter by name match
 */
const searchEntities = async (query) => {
  try {
    const tables = await getAllTables(DEFAULT_MAX_TABLES);
    const term = String(query || '').toLowerCase();

    if (!term) return tables;

    return tables.filter(t =>
      t.name?.toLowerCase().includes(term) ||
      t.fullyQualifiedName?.toLowerCase().includes(term) ||
      t.description?.toLowerCase().includes(term)
    );
  } catch (error) {
    throw new Error(`Unable to search entities for query "${query}": ${error.message}`);
  }
};

/**
 * Get lineage for entity
 */
const getLineage = async (entityType, entityId, upstreamDepth = 3, downstreamDepth = 3) => {
  try {
    const cacheKey = `lineage:${entityType}:${entityId}:${upstreamDepth}:${downstreamDepth}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const response = await getWithRetry(
      `/api/v1/lineage/${entityType}/${entityId}?upstreamDepth=${upstreamDepth}&downstreamDepth=${downstreamDepth}`
    );
    cache.set(cacheKey, response.data, LINEAGE_CACHE_TTL_MS);
    return response.data;
  } catch (error) {
    throw new Error(`Unable to fetch lineage: ${error.message}`);
  }
};

/**
 * Get all tables
 */
const getAllTables = async (limit = 200) => {
  const maxTables = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_MAX_TABLES;
  const pageSize = Math.min(DEFAULT_PAGE_SIZE, maxTables);

  const results = [];
  let after = '';

  while (results.length < maxTables) {
    const remaining = maxTables - results.length;
    const { data, after: nextAfter } = await fetchTablesPage({
      limit: Math.min(pageSize, remaining),
      after
    });

    if (!data.length) break;
    results.push(...data);
    if (!nextAfter) break;
    after = nextAfter;
  }

  return results;
};

/**
 * Search catalog entities via OpenMetadata search endpoint.
 */
const searchCatalog = async (query) => {
  try {
    const q = encodeURIComponent(String(query || ''));
    const response = await getWithRetry(`/api/v1/search/query?q=${q}&index=dataAsset&from=0&size=25`);
    const hits = response.data?.hits?.hits || [];
    return hits.map((item) => item._source || item.source || {}).filter(Boolean);
  } catch (error) {
    return [];
  }
};

/**
 * Get dashboards
 */
const getDashboards = async () => {
  try {
    const response = await getWithRetry('/api/v1/dashboards?limit=50');
    return response.data?.data || [];
  } catch (error) {
    return [];
  }
};

/**
 * Get pipelines
 */
const getPipelines = async () => {
  try {
    const response = await getWithRetry('/api/v1/pipelines?limit=50');
    return response.data?.data || [];
  } catch (error) {
    return [];
  }
};

/**
 * Get ML models
 */
const getMlModels = async () => {
  try {
    const response = await getWithRetry('/api/v1/mlmodels?limit=50');
    return response.data?.data || [];
  } catch (error) {
    return [];
  }
};

module.exports = {
  getTableByFQN,
  searchEntities,
  searchCatalog,
  getLineage,
  getAllTables,
  getDashboards,
  getPipelines,
  getMlModels
};
