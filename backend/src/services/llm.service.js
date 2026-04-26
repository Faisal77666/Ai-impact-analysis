const axios = require('axios');
const env = require('../config/env');
const { withRetry } = require('../utils/retry');

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 20000);
const LLM_RETRY_COUNT = Number(process.env.LLM_RETRY_COUNT || 2);

const buildClientConfig = () => {
  const provider = String(env.LLM_PROVIDER || 'groq').toLowerCase();

  if (provider === 'groq') {
    return {
      provider,
      baseUrl: `${env.GROQ_API_URL}/chat/completions`,
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    };
  }

  if (provider === 'openai') {
    return {
      provider,
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: env.GROQ_API_KEY,
      model: 'gpt-4o-mini'
    };
  }

  throw new Error(`Unsupported LLM provider: ${provider}. Use 'groq' or 'openai'.`);
};

const callLLM = async (client, prompt, temperature) => {
  const shouldRetryLlm = (error) => {
    const status = error?.response?.status;
    return !status || status >= 500 || status === 429;
  };

  const response = await withRetry(
    async () => {
      return axios.post(
        client.baseUrl,
        {
          model: client.model,
          messages: [{ role: 'user', content: prompt }],
          temperature
        },
        {
          headers: {
            Authorization: `Bearer ${client.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: LLM_TIMEOUT_MS
        }
      );
    },
    { retries: LLM_RETRY_COUNT, baseDelayMs: 300, retryOn: shouldRetryLlm }
  );

  return response.data?.choices?.[0]?.message?.content;
};

const safeJsonParse = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
};

const inferActionFromText = (queryText) => {
  const text = String(queryText || '').toLowerCase();
  if (text.includes('rename')) return 'rename';
  if (text.includes('drop') || text.includes('delete')) return 'drop';
  return 'update';
};

const cleanupEntityToken = (value) => {
  return String(value || '')
    .trim()
    .replace(/[?.!,;:]+$/g, '')
    .replace(/^['"`]+|['"`]+$/g, '');
};

const inferEntityFromText = (queryText) => {
  const text = String(queryText || '').trim();
  if (!text) return '';

  // Column-level requests often contain source table after "from" or "in ... table"
  const inTable = text.match(/\bin\s+(?:the\s+)?([a-zA-Z0-9_.]+)\s+table\b/i);
  if (inTable?.[1]) return cleanupEntityToken(inTable[1]);

  const fromTable = text.match(/\bfrom\s+([a-zA-Z0-9_.]+)\b/i);
  if (fromTable?.[1]) return cleanupEntityToken(fromTable[1]);

  // Table-level requests: "drop table X", "rename table X", "drop X"
  const explicitTable = text.match(/\b(?:drop|rename|delete)\s+table\s+([a-zA-Z0-9_.]+)\b/i);
  if (explicitTable?.[1]) return cleanupEntityToken(explicitTable[1]);

  const genericDropRename = text.match(/\b(?:drop|rename|delete)\s+([a-zA-Z0-9_.]+)\b/i);
  if (genericDropRename?.[1]) {
    const candidate = cleanupEntityToken(genericDropRename[1]);
    if (!['the', 'column'].includes(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // Imperative table-level updates: "update raw_orders", "modify sales.orders"
  const genericUpdate = text.match(/\b(?:update|modify|change|alter)\s+(?:table\s+)?([a-zA-Z0-9_.]+)\b/i);
  if (genericUpdate?.[1]) {
    const candidate = cleanupEntityToken(genericUpdate[1]);
    if (!['the', 'column', 'table'].includes(candidate.toLowerCase())) {
      return candidate;
    }
  }

  const trailingTable = text.match(/\btable\s+([a-zA-Z0-9_.]+)\b/i);
  if (trailingTable?.[1]) return cleanupEntityToken(trailingTable[1]);

  return '';
};

const inferColumnFromText = (queryText) => {
  const text = String(queryText || '').trim();
  if (!text) return '';

  const explicitColumn = text.match(/\b(?:rename|drop|delete|update)\s+column\s+([a-zA-Z0-9_]+)\b/i);
  if (explicitColumn?.[1]) return cleanupEntityToken(explicitColumn[1]);

  const renameInTable = text.match(/\brename\s+([a-zA-Z0-9_]+)\s+in\s+(?:the\s+)?[a-zA-Z0-9_.]+\s+table\b/i);
  if (renameInTable?.[1]) return cleanupEntityToken(renameInTable[1]);

  const dropFrom = text.match(/\b(?:drop|delete)\s+([a-zA-Z0-9_]+)\s+from\s+[a-zA-Z0-9_.]+\b/i);
  if (dropFrom?.[1]) return cleanupEntityToken(dropFrom[1]);

  return '';
};

/**
 * Parse natural language user query into structured intent.
 * @param {string} queryText
 * @returns {Promise<{action: 'drop'|'rename'|'update', entityType: string, tableFQN: string, column?: string, confidence: number}>}
 */
const parseUserQuery = async (queryText) => {
  try {
    const client = buildClientConfig();
    const provider = client.provider;
    if (!client.apiKey) {
      throw new Error(`Missing API key for provider: ${provider}`);
    }

    const prompt = [
      'Extract a concise JSON object from this user request.',
      'Return only JSON with keys: action, entityType, tableFQN, column, confidence.',
      'action must be one of: drop, rename, update.',
      'entityType should be table for table/column changes.',
      'tableFQN should contain the table identifier from user text.',
      'column is optional and should be present only for column-level changes.',
      `Request: ${queryText}`
    ].join('\n');

    const content = (await callLLM(client, prompt, 0.1)) || '{}';
    const parsed = safeJsonParse(content, {});

    const fallbackTable = inferEntityFromText(queryText);
    const fallbackColumn = inferColumnFromText(queryText);
    const parsedTable = cleanupEntityToken(parsed.tableFQN || parsed.entity || '');
    const parsedColumn = cleanupEntityToken(parsed.column || fallbackColumn || '');

    // Guard against LLM returning a column token as tableFQN.
    const tokenParts = parsedTable.split('.').filter(Boolean);
    const looksLikeColumnAsTable = Boolean(
      parsedTable &&
      tokenParts.length === 1 &&
      parsedColumn &&
      parsedTable.toLowerCase() === parsedColumn.toLowerCase()
    );

    const resolvedTable = looksLikeColumnAsTable
      ? fallbackTable
      : (parsedTable || fallbackTable);
    const parsedAction = String(parsed.action || inferActionFromText(queryText)).toLowerCase();

    return {
      action: parsedAction === 'drop' || parsedAction === 'rename' || parsedAction === 'update'
        ? parsedAction
        : inferActionFromText(queryText),
      entityType: parsed.entityType || 'table',
      tableFQN: resolvedTable,
      column: parsedColumn || undefined,
      confidence: Number(parsed.confidence || 0.7),
      rawQuery: queryText
    };
  } catch (error) {
    throw new Error(`Failed to parse user query with LLM: ${error.message}`);
  }
};

/**
 * Generate actionable recommendations from impact report.
 * @param {Object} impactReport
 * @returns {Promise<string[]>}
 */
const generateRecommendations = async (impactReport) => {
  try {
    const client = buildClientConfig();
    const provider = client.provider;
    if (!client.apiKey) {
      throw new Error(`Missing API key for provider: ${provider}`);
    }

    const compactAssets = (impactReport?.affectedAssets || [])
      .slice(0, 30)
      .map((asset) => ({
        name: asset.name,
        type: asset.type || asset.assetType,
        impactType: asset.impactType
      }));

    const compactReasons = (impactReport?.scoreReasons || [])
      .slice(0, 15)
      .map((reason) => ({
        reason: reason.reason,
        points: reason.points,
        asset: reason.asset
      }));

    const compactReport = {
      target: impactReport?.target || '',
      action: impactReport?.action || '',
      riskScore: impactReport?.riskScore ?? impactReport?.risk?.score ?? 0,
      riskLevel: impactReport?.riskLevel ?? impactReport?.risk?.level ?? impactReport?.risk?.label ?? 'LOW',
      affectedAssetsCount: impactReport?.affectedAssets?.length || 0,
      affectedAssetsSample: compactAssets,
      topScoreReasons: compactReasons
    };

    const prompt = [
      'You are a data platform SRE assistant.',
      'Given this impact report, provide 3 to 5 concise actionable recommendations.',
      'Return only a JSON array of strings.',
      JSON.stringify(compactReport)
    ].join('\n');

    const content = (await callLLM(client, prompt, 0.3)) || '[]';
    const parsed = safeJsonParse(content, []);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const status = error.response?.status;

    // Fail-safe: recommendation generation must not fail the full impact flow.
    if (status === 413) {
      return [
        'Recommendation generation payload was too large; review high-impact downstream assets first.',
        'Prioritize updates for HARD_BREAK dependencies before applying the change.',
        'Roll out change with compatibility layer (alias/view) and monitor consumers.'
      ];
    }

    return [
      'Validate downstream dependencies in staging before production rollout.',
      'Communicate change windows and expected impact to asset owners.',
      'Prepare rollback plan for critical pipelines and dashboards.'
    ];
  }
};

module.exports = {
  parseUserQuery,
  generateRecommendations
};
