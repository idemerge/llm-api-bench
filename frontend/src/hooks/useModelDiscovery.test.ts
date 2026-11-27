import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../services/api';
import { useModelDiscovery } from './useModelDiscovery';

vi.mock('../services/api', () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const input = { endpoint: 'https://example.com/v1', apiKey: 'key', format: 'openai' };

describe('useModelDiscovery', () => {
  it('loads the list through the authenticated backend API', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ models: ['a', 'b'] })));
    const { result } = renderHook(() => useModelDiscovery());
    await act(async () => {
      await result.current.discover(input);
    });
    expect(result.current.models).toEqual(['a', 'b']);
    expect(result.current.loaded).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('surfaces server errors without retaining a model list', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Invalid key' }), { status: 502 }));
    const { result } = renderHook(() => useModelDiscovery());
    await act(async () => {
      await result.current.discover(input);
    });
    expect(result.current.error).toBe('Invalid key');
    expect(result.current.models).toEqual([]);
    expect(result.current.loaded).toBe(false);
  });

  it('surfaces thrown network errors', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useModelDiscovery());
    await act(async () => {
      await result.current.discover(input);
    });
    expect(result.current.error).toBe('network');
    expect(result.current.loading).toBe(false);
  });

  it('ignores an obsolete response after the form changes or closes', async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(apiFetch).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result } = renderHook(() => useModelDiscovery());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.discover(input);
    });
    act(() => result.current.reset());
    await act(async () => {
      resolve(new Response(JSON.stringify({ models: ['stale'] })));
      await pending;
    });
    expect(result.current.models).toEqual([]);
    expect(result.current.loaded).toBe(false);
  });
});
