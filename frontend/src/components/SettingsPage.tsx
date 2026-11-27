import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ProviderConfigResponse, ProviderFormat } from '../types';
import { useProviders } from '../hooks/useProviders';
import { useModelDiscovery } from '../hooks/useModelDiscovery';
import { Button, Input, InputNumber, Select, Checkbox, Popconfirm, Alert, Tag, Modal } from '../antdImports';
import { PlusOutlined, ApiOutlined } from '@ant-design/icons';
import { APP_VERSION } from '../constants';
import { validateProviderName, validateModelId, validateDisplayName } from '../utils/validation';

interface ModelFormData {
  name: string;
  displayName: string;
  contextSize: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  isActive: boolean;
}

interface ProviderFormData {
  name: string;
  endpoint: string;
  apiKey: string;
  format: ProviderFormat;
  models: ModelFormData[];
}

const EMPTY_MODEL: ModelFormData = {
  name: '',
  displayName: '',
  contextSize: 4096,
  supportsVision: false,
  supportsTools: false,
  supportsStreaming: true,
  isActive: true,
};

const EMPTY_FORM: ProviderFormData = {
  name: '',
  endpoint: '',
  apiKey: '',
  format: 'openai',
  models: [{ ...EMPTY_MODEL }],
};

export function SettingsPage() {
  const { t } = useTranslation();
  const {
    providers,
    loading,
    error: providerError,
    fetchProviders,
    createProvider,
    updateProvider,
    deleteProvider,
    testConnection,
    testRawConnection: _testRawConnection,
  } = useProviders();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderFormData>({ ...EMPTY_FORM });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    latencyMs: number;
    error?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const discovery = useModelDiscovery();
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const resetDiscovery = () => {
    discovery.reset();
    setSelectedModels([]);
  };

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const openCreateForm = () => {
    resetDiscovery();
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (provider: ProviderConfigResponse) => {
    resetDiscovery();
    setForm({
      name: provider.name,
      endpoint: provider.endpoint,
      apiKey: '',
      format: provider.format,
      models: provider.models.map((m) => ({
        name: m.name,
        displayName: m.displayName || '',
        contextSize: m.contextSize,
        supportsVision: m.supportsVision,
        supportsTools: m.supportsTools,
        supportsStreaming: m.supportsStreaming ?? true,
        isActive: m.isActive ?? true,
      })),
    });
    setEditingId(provider.id);
    setShowForm(true);
  };

  const closeForm = () => {
    resetDiscovery();
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (editingId) {
        const input: any = {
          name: form.name,
          endpoint: form.endpoint,
          format: form.format,
          models: form.models,
        };
        if (form.apiKey.trim()) input.apiKey = form.apiKey;
        await updateProvider(editingId, input);
      } else {
        await createProvider({
          name: form.name,
          endpoint: form.endpoint,
          apiKey: form.apiKey,
          format: form.format,
          models: form.models as any,
        });
      }
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    const result = await testConnection(id);
    if (result) {
      setTestResult({ id, ...result });
    }
    setTestingId(null);
  };

  const addModel = () => {
    setForm((prev) => ({ ...prev, models: [...prev.models, { ...EMPTY_MODEL }] }));
  };

  const importModels = () => {
    setForm((prev) => {
      const existing = new Set(prev.models.map((model) => model.name.trim()));
      const added = selectedModels.filter((name) => !existing.has(name)).map((name) => ({ ...EMPTY_MODEL, name }));
      return {
        ...prev,
        models: [
          ...prev.models.filter((model) =>
            Object.entries(EMPTY_MODEL).some(([key, value]) => model[key as keyof ModelFormData] !== value),
          ),
          ...added,
        ],
      };
    });
    setSelectedModels([]);
  };

  const removeModel = (index: number) => {
    setForm((prev) => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index),
    }));
  };

  const updateModel = (index: number, field: keyof ModelFormData, value: any) => {
    setForm((prev) => ({
      ...prev,
      models: prev.models.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
    }));
  };

  const providerNameError = validateProviderName(form.name.trim());
  const modelErrors = form.models.map((m) => ({
    name: validateModelId(m.name.trim()),
    displayName: validateDisplayName(m.displayName.trim()),
  }));

  const isFormValid =
    !providerNameError &&
    form.endpoint.trim() &&
    (editingId || form.apiKey.trim()) &&
    form.models.length > 0 &&
    modelErrors.every((e) => !e.name && !e.displayName);

  const isNameDuplicate =
    form.name.trim() &&
    providers.some((p) => p.name.trim().toLowerCase() === form.name.trim().toLowerCase() && p.id !== editingId);

  return (
    <div className="w-full space-y-6">
      {/* Provider Configurations */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="section-title !mb-0">{t('settings.title')}</div>
            <p className="text-[12px] text-text-secondary mt-1">{t('settings.description')}</p>
          </div>
          <Button type="primary" ghost icon={<PlusOutlined />} onClick={openCreateForm}>
            {t('settings.addProvider')}
          </Button>
        </div>

        {providerError && <Alert type="error" title={providerError} showIcon closable />}

        {loading && providers.length === 0 && (
          <div className="text-center py-8 text-text-tertiary text-[13px]">{t('settings.loadingProviders')}</div>
        )}

        {!loading && providers.length === 0 && !showForm && (
          <div className="text-center py-10 border border-dashed border-border rounded-md">
            <div className="text-text-tertiary text-[13px] mb-2">{t('settings.noProviders')}</div>
            <Button type="link" size="small" onClick={openCreateForm}>
              {t('settings.addFirstProvider')}
            </Button>
          </div>
        )}

        {/* Provider Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 !mt-6">
          {providers.map((provider) => {
            const activeModels = provider.models.filter((m) => m.isActive !== false);
            const inactiveModels = provider.models.filter((m) => m.isActive === false);
            return (
              <motion.div
                key={provider.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-lg border border-border bg-bg-surface overflow-hidden hover:border-border-hover transition-colors flex flex-col"
              >
                {/* Card Header */}
                <div className="p-5 pb-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-[14px] font-semibold text-text-primary truncate">{provider.name}</div>
                      <Tag>{provider.format}</Tag>
                    </div>
                    <Button onClick={() => openEditForm(provider)}>{t('common.action.edit')}</Button>
                  </div>

                  {/* Info rows */}
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-text-tertiary w-[52px] flex-shrink-0">{t('settings.endpoint')}</span>
                      <span className="text-text-secondary truncate font-mono">{provider.endpoint}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-tertiary w-[52px] flex-shrink-0">{t('settings.apiKey')}</span>
                      <span className="text-text-secondary font-mono">{provider.apiKeyMasked}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-tertiary w-[52px] flex-shrink-0">{t('settings.models')}</span>
                      <span className="text-text-secondary">
                        {activeModels.length} {t('settings.active')}
                        {inactiveModels.length > 0 && (
                          <span className="text-text-tertiary">
                            {' '}
                            · {inactiveModels.length} {t('settings.inactive')}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Test result */}
                {testResult && testResult.id === provider.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                    <Alert
                      type={testResult.success ? 'success' : 'error'}
                      title={
                        testResult.success
                          ? t('settings.connectionSuccess', { latency: testResult.latencyMs })
                          : t('settings.connectionFailed', { error: testResult.error })
                      }
                      showIcon
                      closable
                      onClose={() => setTestResult(null)}
                      className="font-mono"
                      style={{ margin: '0 20px 12px', fontSize: 11 }}
                    />
                  </motion.div>
                )}

                {/* Models Grid */}
                <div className="px-5 pb-4 pt-0 flex-1">
                  <div className="border-t border-border/50 pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {provider.models.map((model) => (
                        <div
                          key={model.id}
                          className={`px-2.5 py-1.5 rounded-md bg-bg-card border border-border/50 text-[11px] ${
                            model.isActive === false ? 'opacity-35' : ''
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                model.isActive === false ? 'bg-text-tertiary' : 'bg-accent-teal'
                              }`}
                            />
                            <span className="text-text-primary font-medium font-mono">{model.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 ml-3">
                            <span className="text-text-tertiary text-[10px] font-mono">
                              {model.contextSize >= 1000
                                ? `${Math.round(model.contextSize / 1000)}K`
                                : model.contextSize}
                            </span>
                            {model.supportsVision && (
                              <Tag color="blue" style={{ fontSize: 10, padding: '0 6px', lineHeight: '20px' }}>
                                V
                              </Tag>
                            )}
                            {model.supportsTools && (
                              <Tag color="purple" style={{ fontSize: 10, padding: '0 6px', lineHeight: '20px' }}>
                                T
                              </Tag>
                            )}
                            {model.supportsStreaming && (
                              <Tag color="green" style={{ fontSize: 10, padding: '0 6px', lineHeight: '20px' }}>
                                S
                              </Tag>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Footer - Actions */}
                <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between">
                  <Button
                    type="primary"
                    ghost
                    icon={<ApiOutlined />}
                    onClick={() => handleTest(provider.id)}
                    loading={testingId === provider.id}
                  >
                    {testingId === provider.id ? t('settings.testing') : t('settings.testConnection')}
                  </Button>
                  <Popconfirm
                    title={t('settings.deleteConfirmTitle')}
                    description={t('settings.deleteConfirmDesc')}
                    onConfirm={() => deleteProvider(provider.id)}
                    okText={t('common.action.delete')}
                    cancelText={t('common.action.cancel')}
                    okButtonProps={{ danger: true }}
                  >
                    <Button danger ghost>
                      {t('common.action.delete')}
                    </Button>
                  </Popconfirm>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Provider Form Modal */}
        <Modal
          open={showForm}
          title={editingId ? t('settings.editProvider') : t('settings.addProvider')}
          onCancel={closeForm}
          onOk={handleSubmit}
          okText={editingId ? t('common.action.update') : t('common.action.save')}
          okButtonProps={{ disabled: !!(!isFormValid || isNameDuplicate), loading: saving }}
          width={860}
          destroyOnHidden
        >
          <div className="space-y-4 py-2">
            {/* Name & Format */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-text-secondary mb-1 block">{t('settings.providerName')}</label>
                <Input
                  placeholder={t('settings.providerNamePlaceholder')}
                  value={form.name}
                  status={isNameDuplicate || (form.name && providerNameError) ? 'error' : undefined}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
                {isNameDuplicate && (
                  <span className="text-[10px] text-accent-rose mt-0.5 block">{t('settings.providerNameExists')}</span>
                )}
                {!isNameDuplicate && form.name && providerNameError && (
                  <span className="text-[10px] text-accent-rose mt-0.5 block">{providerNameError}</span>
                )}
              </div>
              <div>
                <label className="text-[11px] text-text-secondary mb-1 block">{t('settings.format')}</label>
                <Select
                  value={form.format}
                  onChange={(val) => {
                    resetDiscovery();
                    setForm((prev) => ({ ...prev, format: val }));
                  }}
                  options={[
                    { value: 'openai', label: t('settings.formatOpenAI') },
                    { value: 'anthropic', label: t('settings.formatAnthropic') },
                    { value: 'gemini', label: t('settings.formatGemini') },
                    { value: 'custom', label: t('settings.formatCustom') },
                  ]}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Endpoint */}
            <div>
              <label className="text-[11px] text-text-secondary mb-1 block">{t('settings.endpointUrl')}</label>
              <Input
                placeholder={
                  form.format === 'openai'
                    ? 'https://api.openai.com/v1'
                    : form.format === 'anthropic'
                      ? 'https://api.anthropic.com/v1'
                      : form.format === 'gemini'
                        ? 'https://generativelanguage.googleapis.com/v1beta'
                        : 'https://your-api-endpoint.com/v1'
                }
                value={form.endpoint}
                onChange={(e) => {
                  resetDiscovery();
                  setForm((prev) => ({ ...prev, endpoint: e.target.value }));
                }}
              />
            </div>

            {/* API Key */}
            <div>
              <label className="text-[11px] text-text-secondary mb-1 block">
                {t('settings.apiKey')}
                {editingId && <span className="text-text-tertiary ml-1">{t('settings.leaveEmptyToKeep')}</span>}
              </label>
              <Input.Password
                placeholder={editingId ? t('settings.leaveEmptyToKeepKey') : t('settings.enterApiKey')}
                value={form.apiKey}
                onChange={(e) => {
                  resetDiscovery();
                  setForm((prev) => ({ ...prev, apiKey: e.target.value }));
                }}
              />
            </div>

            {/* Models */}
            <div>
              {(form.format === 'openai' || form.format === 'custom') && (
                <div className="space-y-2 mb-4">
                  <Button
                    loading={discovery.loading}
                    disabled={!form.endpoint.trim() || (!editingId && !form.apiKey.trim())}
                    onClick={() => {
                      setSelectedModels([]);
                      void discovery.discover({
                        endpoint: form.endpoint.trim(),
                        apiKey: form.apiKey.trim() || undefined,
                        providerId: editingId || undefined,
                        format: form.format,
                      });
                    }}
                  >
                    {t('settings.fetchModels')}
                  </Button>
                  <p className="text-xs text-text-secondary">{t('settings.fetchModelsHint')}</p>
                  {discovery.error && <Alert type="error" showIcon title={discovery.error} />}
                  {discovery.loaded && discovery.models.length === 0 && (
                    <Alert type="info" title={t('settings.noModelsFound')} />
                  )}
                  {discovery.loaded && discovery.models.length > 0 && (
                    <>
                      <Select
                        mode="multiple"
                        aria-label={t('settings.selectModels')}
                        placeholder={t('settings.selectModels')}
                        value={selectedModels}
                        onChange={setSelectedModels}
                        options={discovery.models.map((name) => ({
                          value: name,
                          label: name,
                          disabled: !!validateModelId(name) || form.models.some((model) => model.name.trim() === name),
                        }))}
                        style={{ width: '100%' }}
                      />
                      <Button disabled={!selectedModels.length} onClick={importModels}>
                        {t('settings.importModels', { count: selectedModels.length })}
                      </Button>
                      <p className="text-xs text-text-secondary">{t('settings.importModelsHint')}</p>
                    </>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] text-text-secondary">{t('settings.models')}</label>
                <Button type="link" size="small" icon={<PlusOutlined />} onClick={addModel}>
                  {t('settings.addModel')}
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
                {form.models.map((model, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded bg-bg-card border border-border space-y-2 ${!model.isActive ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-text-tertiary font-medium">
                        {t('settings.modelNumber', { number: idx + 1 })}
                      </span>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={model.isActive}
                          onChange={(e) => updateModel(idx, 'isActive', e.target.checked)}
                          style={{ fontSize: 10 }}
                        >
                          <span className="text-[10px] text-text-secondary">{t('settings.activeLabel')}</span>
                        </Checkbox>
                        {form.models.length > 1 && (
                          <Button
                            type="link"
                            danger
                            size="small"
                            style={{ fontSize: 10 }}
                            onClick={() => removeModel(idx)}
                          >
                            {t('settings.remove')}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-text-tertiary mb-0.5 block">{t('settings.modelId')}</label>
                        <Input
                          size="small"
                          placeholder={t('settings.modelIdPlaceholder')}
                          value={model.name}
                          status={model.name && modelErrors[idx]?.name ? 'error' : undefined}
                          onChange={(e) => updateModel(idx, 'name', e.target.value)}
                        />
                        {model.name && modelErrors[idx]?.name && (
                          <span className="text-[9px] text-accent-rose mt-0.5 block">{modelErrors[idx].name}</span>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] text-text-tertiary mb-0.5 block">
                          {t('settings.displayName')}
                        </label>
                        <Input
                          size="small"
                          placeholder={t('settings.displayNamePlaceholder')}
                          value={model.displayName}
                          status={model.displayName && modelErrors[idx]?.displayName ? 'error' : undefined}
                          onChange={(e) => updateModel(idx, 'displayName', e.target.value)}
                        />
                        {model.displayName && modelErrors[idx]?.displayName && (
                          <span className="text-[9px] text-accent-rose mt-0.5 block">
                            {modelErrors[idx].displayName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-text-tertiary mb-0.5 block">{t('settings.contextSize')}</label>
                      <InputNumber
                        changeOnBlur
                        size="small"
                        style={{ width: '100%' }}
                        placeholder="128000"
                        value={model.contextSize}
                        onChange={(v) => updateModel(idx, 'contextSize', v ?? 4096)}
                        min={1}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={model.supportsVision}
                        onChange={(e) => updateModel(idx, 'supportsVision', e.target.checked)}
                      >
                        <span className="text-[11px] text-text-secondary">{t('settings.vision')}</span>
                      </Checkbox>
                      <Checkbox
                        checked={model.supportsTools}
                        onChange={(e) => updateModel(idx, 'supportsTools', e.target.checked)}
                      >
                        <span className="text-[11px] text-text-secondary">{t('settings.toolCalling')}</span>
                      </Checkbox>
                      <Checkbox
                        checked={model.supportsStreaming}
                        onChange={(e) => updateModel(idx, 'supportsStreaming', e.target.checked)}
                      >
                        <span className="text-[11px] text-text-secondary">{t('settings.streaming')}</span>
                      </Checkbox>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      </div>

      {/* About */}
      <div className="glass-card p-6 space-y-3">
        <div className="section-title !mb-0">{t('settings.about')}</div>
        <div className="space-y-1.5 text-[13px] text-text-secondary">
          <p>
            <span className="text-text-primary font-medium">LLM API Bench</span>
            <span className="text-text-tertiary ml-1.5 font-mono">{APP_VERSION}</span>
          </p>
          <p>{t('settings.aboutDescription')}</p>
        </div>
      </div>
    </div>
  );
}
