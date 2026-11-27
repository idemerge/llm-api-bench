/** List models from an OpenAI-compatible API without making an inference request. */
export async function discoverModels(endpoint: string, apiKey: string): Promise<string[]> {
  const url = new URL(endpoint.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Endpoint must be an HTTP(S) base URL without credentials, query or fragment');
  }
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = `${path || '/v1'}/models`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Model list request failed (HTTP ${response.status})`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
    throw new Error('Invalid model list response: expected a data array');
  }
  return [
    ...new Set<string>(
      payload.data.flatMap((model: unknown) => {
        if (!model || typeof model !== 'object' || !('id' in model) || typeof model.id !== 'string') return [];
        return model.id.trim() ? [model.id.trim()] : [];
      }),
    ),
  ].sort();
}
