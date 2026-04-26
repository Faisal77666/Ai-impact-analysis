import { useCallback, useState } from 'react';
import { simulateImpactQuery } from '../services/api';

export const useAnalysis = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const analyze = useCallback(async (query) => {
    setLoading(true);
    setError('');

    try {
      const simulation = await simulateImpactQuery(query);
      const payload = {
        queryText: query,
        simulation
      };
      setResult(payload);
      return payload;
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to run analysis.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError('');
  }, []);

  return {
    analyze,
    result,
    loading,
    error,
    reset
  };
};
