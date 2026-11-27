import { useRef, useState } from 'react';
import { apiFetch } from '../services/api';

export function useModelDiscovery() {
  const requestId = useRef(0);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reset = () => {
    requestId.current++;
    setModels([]);
    setError(null);
    setLoading(false);
    setLoaded(false);
  };

  const discover = async (input: { endpoint: string; apiKey?: string; providerId?: string; format: string }) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setLoaded(false);
    setModels([]);
    try {
      const response = await apiFetch('/api/providers/discover-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch models');
      if (id !== requestId.current) return;
      setModels(data.models);
      setLoaded(true);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  return { models, loading, error, loaded, discover, reset };
}
