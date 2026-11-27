import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const fns = vi.hoisted(() => ({
  getAll: vi.fn(),
  get: vi.fn(),
  getDecryptedApiKey: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  toResponse: vi.fn(),
  testProviderConnection: vi.fn(),
  discoverModels: vi.fn(),
  removeTarget: vi.fn(),
  renameTarget: vi.fn(),
  removeTargetsByProvider: vi.fn(),
}));

vi.mock('../services/providerStore', () => ({
  providerStore: {
    getAll: fns.getAll,
    get: fns.get,
    getDecryptedApiKey: fns.getDecryptedApiKey,
    create: fns.create,
    update: fns.update,
    delete: fns.delete,
    toResponse: fns.toResponse,
  },
}));

vi.mock('../services/monitorConfigStore', () => ({
  monitorConfigStore: {
    removeTarget: fns.removeTarget,
    renameTarget: fns.renameTarget,
    removeTargetsByProvider: fns.removeTargetsByProvider,
  },
}));

vi.mock('../providers/adapter', () => ({ testProviderConnection: fns.testProviderConnection }));
vi.mock('../providers/modelDiscovery', () => ({ discoverModels: fns.discoverModels }));

import providersRouter from './providers';

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/providers', providersRouter);
  return app;
}

const baseModel = {
  id: 'm1',
  name: 'gpt-4',
  displayName: 'GPT-4',
  contextSize: 8192,
  supportsVision: false,
  supportsTools: false,
  supportsStreaming: true,
  isActive: true,
};

const mockProvider = {
  id: 'p1',
  name: 'OpenAI',
  endpoint: 'https://api.example.com/v1',
  apiKey: 'enc-key',
  format: 'openai' as const,
  models: [baseModel],
  createdAt: '2026-05-15T00:00:00Z',
  updatedAt: '2026-05-15T00:00:00Z',
};
const maskedResp = { ...mockProvider, apiKeyMasked: 'sk-****' };
delete (maskedResp as Record<string, unknown>).apiKey;

beforeEach(() => {
  vi.clearAllMocks();
  fns.toResponse.mockImplementation((p) => ({ ...p, apiKeyMasked: 'sk-****' }));
});

describe('POST /api/providers/discover-models', () => {
  it('lists models before a provider is saved', async () => {
    fns.discoverModels.mockResolvedValueOnce(['model-a']);
    const res = await request(makeApp())
      .post('/api/providers/discover-models')
      .send({ endpoint: 'https://example.com/v1', apiKey: ' key ', format: 'openai' });
    expect(res.status).toBe(200);
    expect(res.body.models).toEqual(['model-a']);
    expect(fns.discoverModels).toHaveBeenCalledWith('https://example.com/v1', 'key');
    expect(fns.create).not.toHaveBeenCalled();
  });

  it('reuses a saved key without returning it', async () => {
    fns.get.mockReturnValueOnce(mockProvider);
    fns.getDecryptedApiKey.mockReturnValueOnce('secret-key');
    fns.discoverModels.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .post('/api/providers/discover-models')
      .send({ endpoint: mockProvider.endpoint, providerId: 'p1', format: 'custom' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ models: [] });
    expect(fns.discoverModels).toHaveBeenCalledWith(mockProvider.endpoint, 'secret-key');
  });

  it('rejects a missing key and unsupported format', async () => {
    const res = await request(makeApp())
      .post('/api/providers/discover-models')
      .send({ endpoint: 'https://example.com', format: 'gemini' });
    expect(res.status).toBe(400);
    expect(fns.discoverModels).not.toHaveBeenCalled();
  });

  it('does not send a stored key to a changed endpoint', async () => {
    fns.get.mockReturnValueOnce(mockProvider);
    const res = await request(makeApp())
      .post('/api/providers/discover-models')
      .send({ endpoint: 'https://other.example.com', providerId: 'p1', format: 'openai' });
    expect(res.status).toBe(400);
    expect(fns.discoverModels).not.toHaveBeenCalled();
  });

  it('surfaces upstream failure without leaking key details', async () => {
    fns.discoverModels.mockRejectedValueOnce(new Error('secret-key'));
    const res = await request(makeApp())
      .post('/api/providers/discover-models')
      .send({ endpoint: 'https://example.com', apiKey: 'secret-key', format: 'openai' });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('secret-key');
  });
});

describe('GET /api/providers', () => {
  it('returns list with toResponse-mapped entries', async () => {
    fns.getAll.mockReturnValueOnce([mockProvider]);
    const res = await request(makeApp()).get('/api/providers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].apiKeyMasked).toBe('sk-****');
  });

  it('returns empty array when no providers', async () => {
    fns.getAll.mockReturnValueOnce([]);
    const res = await request(makeApp()).get('/api/providers');
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/providers/:id', () => {
  it('returns 200 with provider', async () => {
    fns.get.mockReturnValueOnce(mockProvider);
    const res = await request(makeApp()).get('/api/providers/p1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('p1');
  });

  it('returns 404 for unknown id', async () => {
    fns.get.mockReturnValueOnce(undefined);
    const res = await request(makeApp()).get('/api/providers/missing');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Provider not found');
  });
});

describe('POST /api/providers — create', () => {
  it('saves all discovered models including colon-delimited variants', async () => {
    const names = ['big-pickle', 'inclusionai/ling-3.2-flash:free', 'combo:smart-free'];
    fns.create.mockReturnValueOnce(mockProvider);
    const res = await request(makeApp())
      .post('/api/providers')
      .send({
        name: 'OurFreeModels',
        endpoint: 'http://127.0.0.1:18900/v1',
        apiKey: 'test-key',
        format: 'openai',
        models: names.map((name) => ({ ...baseModel, name, displayName: '' })),
      });
    expect(res.status).toBe(201);
    expect(fns.create.mock.calls[0][0].models.map((model: { name: string }) => model.name)).toEqual(names);
  });

  it.each([undefined, '', '   '])(
    'accepts optional displayName=%j when creating imported models',
    async (displayName) => {
      fns.create.mockReturnValueOnce(mockProvider);
      const res = await request(makeApp())
        .post('/api/providers')
        .send({
          name: 'OurFreeModels',
          endpoint: 'http://127.0.0.1:18900/v1',
          apiKey: 'test-key',
          format: 'openai',
          models: [{ ...baseModel, name: 'big-pickle', displayName }],
        });
      expect(res.status).toBe(201);
      expect(fns.create.mock.calls[0][0].models[0].displayName).toBeUndefined();
    },
  );

  it('still rejects invalid non-empty display names without creating a provider', async () => {
    const res = await request(makeApp())
      .post('/api/providers')
      .send({
        name: 'OurFreeModels',
        endpoint: 'http://127.0.0.1:18900/v1',
        apiKey: 'test-key',
        format: 'openai',
        models: [{ ...baseModel, displayName: 'invalid@name' }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Display name');
    expect(fns.create).not.toHaveBeenCalled();
  });

  it('201 on valid payload, strips trailing slashes from endpoint', async () => {
    fns.create.mockReturnValueOnce(mockProvider);
    const res = await request(makeApp())
      .post('/api/providers')
      .send({
        name: 'OpenAI',
        endpoint: 'https://api.example.com/v1/////',
        apiKey: 'sk-test',
        format: 'openai',
        models: [{ name: 'gpt-4', contextSize: 8192, supportsVision: false, supportsTools: false }],
      });
    expect(res.status).toBe(201);
    expect(fns.create).toHaveBeenCalledOnce();
    const input = fns.create.mock.calls[0][0];
    expect(input.name).toBe('OpenAI');
    expect(input.endpoint).toBe('https://api.example.com/v1'); // trailing slashes stripped
    expect(input.apiKey).toBe('sk-test');
  });

  it('400 when name missing (validation)', async () => {
    const res = await request(makeApp())
      .post('/api/providers')
      .send({
        endpoint: 'https://x',
        apiKey: 'k',
        format: 'openai',
        models: [{ name: 'gpt-4', contextSize: 8192, supportsVision: false, supportsTools: false }],
      });
    expect(res.status).toBe(400);
  });

  it('400 when models array is empty', async () => {
    const res = await request(makeApp())
      .post('/api/providers')
      .send({ name: 'X', endpoint: 'https://x', apiKey: 'k', format: 'openai', models: [] });
    expect(res.status).toBe(400);
  });

  it('400 when format is invalid', async () => {
    const res = await request(makeApp())
      .post('/api/providers')
      .send({
        name: 'X',
        endpoint: 'https://x',
        apiKey: 'k',
        format: 'not-a-format',
        models: [{ name: 'm', contextSize: 8192, supportsVision: false, supportsTools: false }],
      });
    expect(res.status).toBe(400);
  });

  it('assigns default supportsStreaming=true and isActive=true', async () => {
    fns.create.mockReturnValueOnce(mockProvider);
    await request(makeApp())
      .post('/api/providers')
      .send({
        name: 'X',
        endpoint: 'https://x',
        apiKey: 'k',
        format: 'openai',
        models: [{ name: 'm', contextSize: 8192, supportsVision: false, supportsTools: false }],
      });
    const input = fns.create.mock.calls[0][0];
    expect(input.models[0].supportsStreaming).toBe(true);
    expect(input.models[0].isActive).toBe(true);
  });

  it('preserves explicit isActive=false', async () => {
    fns.create.mockReturnValueOnce(mockProvider);
    await request(makeApp())
      .post('/api/providers')
      .send({
        name: 'X',
        endpoint: 'https://x',
        apiKey: 'k',
        format: 'openai',
        models: [{ name: 'm', contextSize: 8192, supportsVision: false, supportsTools: false, isActive: false }],
      });
    expect(fns.create.mock.calls[0][0].models[0].isActive).toBe(false);
  });
});

describe('PUT /api/providers/:id — update', () => {
  it.each(['', '   ', '  Big Pickle  '])('accepts and normalizes displayName=%j when editing', async (displayName) => {
    fns.get.mockReturnValueOnce(mockProvider);
    fns.update.mockReturnValueOnce(mockProvider);
    const res = await request(makeApp())
      .put('/api/providers/p1')
      .send({ models: [{ ...baseModel, displayName }] });
    expect(res.status).toBe(200);
    expect(fns.update.mock.calls[0][1].models[0].displayName).toBe(displayName.trim() || undefined);
  });

  it('200 on success and only updates provided fields', async () => {
    fns.get.mockReturnValue(mockProvider);
    fns.update.mockReturnValueOnce({ ...mockProvider, name: 'renamed' });
    const res = await request(makeApp()).put('/api/providers/p1').send({ name: 'renamed' });
    expect(res.status).toBe(200);
    const input = fns.update.mock.calls[0][1];
    expect(input.name).toBe('renamed');
    expect(input.endpoint).toBeUndefined();
  });

  it('404 when provider missing', async () => {
    fns.get.mockReturnValueOnce(undefined);
    const res = await request(makeApp()).put('/api/providers/absent').send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('renames monitor target when model name changes (id stable)', async () => {
    fns.get.mockReturnValue(mockProvider); // old: gpt-4
    fns.update.mockReturnValueOnce({
      ...mockProvider,
      models: [{ ...baseModel, name: 'gpt-4-renamed' }],
    });
    await request(makeApp())
      .put('/api/providers/p1')
      .send({
        models: [{ id: 'm1', name: 'gpt-4-renamed', contextSize: 8192, supportsVision: false, supportsTools: false }],
      });
    expect(fns.renameTarget).toHaveBeenCalledWith('p1', 'gpt-4', 'gpt-4-renamed');
  });

  it('removes monitor target when model is deleted', async () => {
    fns.get.mockReturnValue(mockProvider); // old: m1/gpt-4
    fns.update.mockReturnValueOnce({ ...mockProvider, models: [] }); // m1 gone
    await request(makeApp())
      .put('/api/providers/p1')
      .send({
        models: [{ id: 'm2', name: 'gpt-3', contextSize: 8192, supportsVision: false, supportsTools: false }],
      });
    expect(fns.removeTarget).toHaveBeenCalledWith('p1', 'gpt-4');
  });

  it('500 when store.update returns undefined unexpectedly', async () => {
    fns.get.mockReturnValue(mockProvider);
    fns.update.mockReturnValueOnce(undefined);
    const res = await request(makeApp()).put('/api/providers/p1').send({ name: 'x' });
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/providers/:id', () => {
  it('200 on success and removes monitor targets for the provider', async () => {
    fns.delete.mockReturnValueOnce(true);
    const res = await request(makeApp()).delete('/api/providers/p1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fns.removeTargetsByProvider).toHaveBeenCalledWith('p1');
  });

  it('404 when provider does not exist', async () => {
    fns.delete.mockReturnValueOnce(false);
    const res = await request(makeApp()).delete('/api/providers/absent');
    expect(res.status).toBe(404);
    expect(fns.removeTargetsByProvider).not.toHaveBeenCalled();
  });
});

describe('POST /api/providers/test-connection — unsaved', () => {
  it('200 with the test result', async () => {
    fns.testProviderConnection.mockResolvedValueOnce({
      success: true,
      latencyMs: 100,
      ttftMs: 50,
      outputTokens: 10,
      responseText: 'ok',
    });
    const res = await request(makeApp())
      .post('/api/providers/test-connection')
      .send({ endpoint: 'https://x  ', apiKey: ' k ', format: 'openai', modelName: 'gpt-4' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Trimming applied
    const args = fns.testProviderConnection.mock.calls[0][0];
    expect(args.endpoint).toBe('https://x');
    expect(args.apiKey).toBe('k');
  });

  it('400 when modelName invalid (validation)', async () => {
    const res = await request(makeApp())
      .post('/api/providers/test-connection')
      .send({ endpoint: 'https://x', apiKey: 'k', format: 'openai' }); // missing modelName
    expect(res.status).toBe(400);
  });

  it('502 when testProviderConnection throws', async () => {
    fns.testProviderConnection.mockRejectedValueOnce(new Error('network'));
    const res = await request(makeApp())
      .post('/api/providers/test-connection')
      .send({ endpoint: 'https://x', apiKey: 'k', format: 'openai', modelName: 'gpt-4' });
    expect(res.status).toBe(502);
    expect(res.body.details).toContain('network');
  });
});

describe('POST /api/providers/:id/test — saved', () => {
  it('200 with test result for saved provider', async () => {
    fns.get.mockReturnValueOnce(mockProvider);
    fns.getDecryptedApiKey.mockReturnValueOnce('sk-decrypted');
    fns.testProviderConnection.mockResolvedValueOnce({
      success: true,
      latencyMs: 200,
      ttftMs: 50,
      outputTokens: 10,
      responseText: 'pong',
    });
    const res = await request(makeApp()).post('/api/providers/p1/test').send({ modelName: 'gpt-4' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('uses first active model when modelName not provided', async () => {
    fns.get.mockReturnValueOnce({
      ...mockProvider,
      models: [
        { ...baseModel, name: 'inactive-one', isActive: false },
        { ...baseModel, id: 'm-active', name: 'active-one', isActive: true },
      ],
    });
    fns.getDecryptedApiKey.mockReturnValueOnce('sk-decrypted');
    fns.testProviderConnection.mockResolvedValueOnce({
      success: true,
      latencyMs: 50,
      ttftMs: 10,
      outputTokens: 1,
      responseText: '',
    });
    await request(makeApp()).post('/api/providers/p1/test').send({});
    expect(fns.testProviderConnection.mock.calls[0][0].modelName).toBe('active-one');
  });

  it('404 when provider not found', async () => {
    fns.get.mockReturnValueOnce(undefined);
    const res = await request(makeApp()).post('/api/providers/absent/test').send({});
    expect(res.status).toBe(404);
  });

  it('400 when no active models and no modelName provided', async () => {
    fns.get.mockReturnValueOnce({ ...mockProvider, models: [{ ...baseModel, isActive: false }] });
    const res = await request(makeApp()).post('/api/providers/p1/test').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No model specified/);
  });

  it('500 when api key cannot be decrypted', async () => {
    fns.get.mockReturnValueOnce(mockProvider);
    fns.getDecryptedApiKey.mockReturnValueOnce(undefined);
    const res = await request(makeApp()).post('/api/providers/p1/test').send({ modelName: 'gpt-4' });
    expect(res.status).toBe(500);
  });

  it('502 when testProviderConnection throws', async () => {
    fns.get.mockReturnValueOnce(mockProvider);
    fns.getDecryptedApiKey.mockReturnValueOnce('k');
    fns.testProviderConnection.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(makeApp()).post('/api/providers/p1/test').send({ modelName: 'gpt-4' });
    expect(res.status).toBe(502);
  });
});
