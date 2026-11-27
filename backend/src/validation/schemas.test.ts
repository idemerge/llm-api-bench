import { describe, expect, it } from 'vitest';
import { MonitorTargetSchema, PlaygroundRunSchema, TestConnectionSchema } from './schemas';

describe('colon-delimited model IDs', () => {
  it.each(['inclusionai/ling-3.2-flash:free', 'combo:smart-free'])(
    'accepts %s for inference, connection tests and monitoring',
    (modelName) => {
      expect(
        TestConnectionSchema.safeParse({
          endpoint: 'http://localhost:18900/v1',
          apiKey: 'test-key',
          format: 'openai',
          modelName,
        }).success,
      ).toBe(true);
      expect(
        PlaygroundRunSchema.safeParse({ providerId: 'p1', modelName, prompt: 'Hello', maxTokens: 10 }).success,
      ).toBe(true);
      expect(
        MonitorTargetSchema.safeParse({
          providerId: 'p1',
          providerName: 'OurFreeModels',
          modelName,
          intervalMinutes: 5,
        }).success,
      ).toBe(true);
    },
  );
});
