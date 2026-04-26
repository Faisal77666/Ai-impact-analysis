const analyzeSchema = {
  safeParse(input) {
    const issues = [];
    const value = input && typeof input === 'object' ? input : {};

    if (typeof value.query !== 'string') {
      issues.push({ path: ['query'], message: 'query is required' });
    }

    const trimmedQuery = typeof value.query === 'string' ? value.query.trim() : '';
    if (typeof value.query === 'string' && trimmedQuery.length < 3) {
      issues.push({ path: ['query'], message: 'query must be at least 3 characters' });
    }

    if (typeof value.query === 'string' && trimmedQuery.length > 1000) {
      issues.push({ path: ['query'], message: 'query is too long' });
    }

    if (value.debug !== undefined && typeof value.debug !== 'boolean') {
      issues.push({ path: ['debug'], message: 'debug must be a boolean' });
    }

    if (value.demoMode !== undefined && typeof value.demoMode !== 'boolean') {
      issues.push({ path: ['demoMode'], message: 'demoMode must be a boolean' });
    }

    if (value.lightMode !== undefined && typeof value.lightMode !== 'boolean') {
      issues.push({ path: ['lightMode'], message: 'lightMode must be a boolean' });
    }

    if (issues.length > 0) {
      return {
        success: false,
        error: { issues }
      };
    }

    return {
      success: true,
      data: {
        query: trimmedQuery,
        ...(value.debug !== undefined ? { debug: value.debug } : {}),
        ...(value.demoMode !== undefined ? { demoMode: value.demoMode } : {}),
        ...(value.lightMode !== undefined ? { lightMode: value.lightMode } : {})
      }
    };
  }
};

module.exports = { analyzeSchema };
