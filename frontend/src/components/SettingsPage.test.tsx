import type { InputHTMLAttributes, ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../services/api';
import { SettingsPage } from './SettingsPage';

vi.mock('../services/api', () => ({ apiFetch: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> } }));
vi.mock('../antdImports', () => {
  const Input = ({ status: _status, ...props }: InputHTMLAttributes<HTMLInputElement> & { status?: string }) => (
    <input {...props} />
  );
  Input.Password = Input;
  return {
    Input,
    InputNumber: ({ value }: { value: number }) => <input type="number" readOnly value={value} />,
    Select: () => <div />,
    Checkbox: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    Tag: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    Popconfirm: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Alert: ({ title }: { title: string }) => <div role="alert">{title}</div>,
    Button: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
      <button disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
    Modal: ({ open, children, onOk }: { open: boolean; children: ReactNode; onOk: () => void }) =>
      open ? (
        <div role="dialog">
          {children}
          <button onClick={onOk}>Submit</button>
        </div>
      ) : null,
  };
});

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

function openAndFillForm() {
  fireEvent.click(screen.getAllByText('settings.addProvider')[0]);
  fireEvent.change(screen.getByPlaceholderText('settings.providerNamePlaceholder'), {
    target: { value: 'OurFreeModels' },
  });
  fireEvent.change(screen.getByPlaceholderText('https://api.openai.com/v1'), {
    target: { value: 'http://127.0.0.1:18900/v1' },
  });
  fireEvent.change(screen.getByPlaceholderText('settings.enterApiKey'), { target: { value: 'test-key' } });
  fireEvent.change(screen.getByPlaceholderText('settings.modelIdPlaceholder'), { target: { value: 'big-pickle' } });
}

describe('SettingsPage provider submission', () => {
  it('automatically imports all discovered models, including colon IDs, and preserves existing edits on refresh', async () => {
    const ids = ['big-pickle', 'inclusionai/ling-3.2-flash:free', 'combo:smart-free'];
    vi.mocked(apiFetch).mockImplementation(
      async (url) => new Response(JSON.stringify(url.endsWith('/discover-models') ? { models: ids } : [])),
    );
    render(<SettingsPage />);
    openAndFillForm();
    fireEvent.change(screen.getByPlaceholderText('settings.displayNamePlaceholder'), {
      target: { value: 'My Big Pickle' },
    });
    fireEvent.click(screen.getByText('settings.fetchModels'));
    await waitFor(() => expect(screen.getAllByPlaceholderText('settings.modelIdPlaceholder')).toHaveLength(3));
    expect(
      screen.getAllByPlaceholderText('settings.modelIdPlaceholder').map((input) => (input as HTMLInputElement).value),
    ).toEqual(ids);
    expect(screen.getAllByPlaceholderText('settings.displayNamePlaceholder')[0]).toHaveValue('My Big Pickle');
    fireEvent.click(screen.getByText('settings.fetchModelsSuccess'));
    await waitFor(() => expect(screen.getByText('settings.fetchModelsSuccess')).toBeInTheDocument());
    expect(screen.getAllByPlaceholderText('settings.modelIdPlaceholder')).toHaveLength(3);
    expect(screen.getAllByPlaceholderText('settings.displayNamePlaceholder')[0]).toHaveValue('My Big Pickle');
  });

  it('replaces the untouched empty row when fetching all models', async () => {
    vi.mocked(apiFetch).mockImplementation(
      async (url) =>
        new Response(JSON.stringify(url.endsWith('/discover-models') ? { models: ['model-a', 'model-b:free'] } : [])),
    );
    render(<SettingsPage />);
    openAndFillForm();
    fireEvent.change(screen.getByPlaceholderText('settings.modelIdPlaceholder'), { target: { value: '' } });
    fireEvent.click(screen.getByText('settings.fetchModels'));
    await waitFor(() => expect(screen.getAllByPlaceholderText('settings.modelIdPlaceholder')).toHaveLength(2));
    expect(
      screen.getAllByPlaceholderText('settings.modelIdPlaceholder').map((input) => (input as HTMLInputElement).value),
    ).toEqual(['model-a', 'model-b:free']);
  });

  it('closes the form after a successful save with an empty optional display name', async () => {
    vi.mocked(apiFetch).mockImplementation(
      async (_url, init) =>
        new Response(
          JSON.stringify(
            init?.method === 'POST'
              ? {
                  id: 'p1',
                  name: 'OurFreeModels',
                  endpoint: 'http://127.0.0.1:18900/v1',
                  apiKeyMasked: '***',
                  format: 'openai',
                  models: [],
                }
              : [],
          ),
          { status: init?.method === 'POST' ? 201 : 200 },
        ),
    );
    render(<SettingsPage />);
    openAndFillForm();
    fireEvent.click(screen.getByText('Submit'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const saved = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(saved![1]!.body as string).models[0].displayName).toBe('');
  });

  it.each(['server', 'network'])('preserves form values and displays %s failure inside the dialog', async (failure) => {
    vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
      if (init?.method !== 'POST') return new Response('[]');
      if (failure === 'network') throw new Error('Network unavailable');
      return new Response(JSON.stringify({ error: 'Save rejected' }), { status: 400 });
    });
    render(<SettingsPage />);
    openAndFillForm();
    fireEvent.click(screen.getByText('Submit'));
    const dialog = screen.getByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        failure === 'network' ? 'Network unavailable' : 'Save rejected',
      ),
    );
    expect(screen.getByPlaceholderText('settings.modelIdPlaceholder')).toHaveValue('big-pickle');
    expect(screen.getByPlaceholderText('settings.enterApiKey')).toHaveValue('test-key');
  });
});
