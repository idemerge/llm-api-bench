import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverModels } from './modelDiscovery';

afterEach(() => vi.unstubAllGlobals());

describe('discoverModels', () => {
  it.each([
    ['https://example.com', 'https://example.com/v1/models'],
    ['https://example.com/v1///', 'https://example.com/v1/models'],
    ['https://example.com/proxy/v1', 'https://example.com/proxy/v1/models'],
  ])('normalizes %s and sends authentication', async (endpoint, expected) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, {}, { id: '' }] })),
      );
    vi.stubGlobal('fetch', fetchMock);
    expect(await discoverModels(endpoint, ' key ')).toEqual(['a', 'b']);
    expect(String(fetchMock.mock.calls[0][0])).toBe(expected);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer key' }, redirect: 'error' });
  });

  it('surfaces upstream HTTP errors without echoing response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret', { status: 401 })));
    await expect(discoverModels('https://example.com/v1', 'key')).rejects.toThrow('HTTP 401');
  });

  it('rejects malformed response data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"models":[]}')));
    await expect(discoverModels('https://example.com', 'key')).rejects.toThrow('expected a data array');
  });

  it('propagates network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await expect(discoverModels('https://example.com', 'key')).rejects.toThrow('network');
  });

  it.each(['file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com?key=secret'])(
    'rejects unsafe base URL %s',
    async (url) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(discoverModels(url, 'key')).rejects.toThrow('HTTP(S)');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
