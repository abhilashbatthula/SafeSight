'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
  useMutation,
} from '@tanstack/react-query';
import type { Auth, Finding, Inspection } from '@safesight/contracts';
import { api } from '@/lib/api';
import { UploadPanel } from './upload-panel';
import { MachinerySafety } from './machinery-safety';
import { ComputerDesktop } from './computer-desktop';
import { WorkspaceSettings as Settings } from './workspace-settings';

import { Notice, PixelIcon, Window, type Workspace } from './workspace-ui';
function stamp(value: string, tz: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
const statuses = {
  COMPLETED: 'Completed',
  PROCESSING: 'Analyzing',
  QUEUED: 'Queued',
  FAILED: 'Failed',
};
function Status({ status }: { status: Inspection['status'] }) {
  return (
    <span className={`state state-${status.toLowerCase()}`}>
      <span aria-hidden="true">■</span> {statuses[status]}
    </span>
  );
}
function Loading() {
  return (
    <div className="empty" role="status">
      Loading workspace…
    </div>
  );
}
function ErrorNotice({ error }: { error: Error | null }) {
  return error ? <Notice error>{error.message}</Notice> : null;
}
function refresh(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
}
function useAction(auth: Auth) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method = 'POST',
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) =>
      api<{ id?: string }>(
        path,
        { method, ...(body ? { body: JSON.stringify(body) } : {}) },
        auth.csrf,
      ),
    onSuccess: () => refresh(client),
  });
}
function InspectionTable({ rows, auth }: { rows: Inspection[]; auth: Auth }) {
  return (
    <div className="table-scroll inset">
      <table>
        <thead>
          <tr>
            <th>Image</th>
            <th>Status</th>
            <th>People</th>
            <th>Machinery</th>
            <th>Saved</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td>
                <Link className="file-link" href={`/inspections/${i.id}`}>
                  <PixelIcon name="file" small />
                  <span>{i.original_name}</span>
                </Link>
              </td>
              <td>
                <Status status={i.status} />
              </td>
              <td>{i.result?.findings.length ?? '—'}</td>
              <td>{i.result?.machines?.length ?? '—'}</td>
              <td className="nowrap">
                {stamp(i.created_at, auth.facility.timezone)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty">No inspections saved.</div>}
    </div>
  );
}
function Inspect({
  auth,
  workspace,
  kind,
}: {
  auth: Auth;
  workspace: Workspace;
  kind: 'human' | 'machinery';
}) {
  return (
    <Window
      title={kind === 'human' ? 'Human analysis' : 'Machinery analysis'}
      icon={kind}
      className={`analysis-window analysis-${kind}`}
    >
      <div className="window-body">
        <UploadPanel auth={auth} workspace={workspace} kind={kind} />
      </div>
      <div className="statusbar">
        <span>JPEG / PNG / WebP</span>
        <span>8 MB · 20 MP per image</span>
        <span>
          {kind === 'human'
            ? 'Per-person PPE inventory'
            : 'Hazards · precautions · operator PPE'}
        </span>
      </div>
    </Window>
  );
}
function History({ auth }: { auth: Auth }) {
  const [page, setPage] = useState(0),
    [status, setStatus] = useState(''),
    [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['history', page, status, search],
    queryFn: () =>
      api<{ rows: Inspection[] }>(
        `/inspections?limit=20&page=${page}${status ? `&status=${status}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
    refetchInterval: 5000,
  });
  return (
    <Window title="Inspection history" icon="history">
      <div className="toolbar">
        <Link className="button" href="/">
          New inspection
        </Link>
        <button
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          Refresh
        </button>
        <span className="toolbar-divider" />
        <label className="inline-label">
          Find image{' '}
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="inline-label">
          Status{' '}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All</option>
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="window-body">
        <ErrorNotice error={query.error} />
        {query.isPending ? (
          <Loading />
        ) : (
          <InspectionTable rows={query.data?.rows ?? []} auth={auth} />
        )}
        <div className="pagination">
          <span>
            Page {page + 1} · {query.data?.rows.length ?? 0} inspections
          </span>
          <div className="row">
            <button
              disabled={!page || query.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              disabled={(query.data?.rows.length ?? 0) < 20 || query.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      <div className="statusbar">
        <span>Saved photographs and analysis</span>
        <span>Times shown in {auth.facility.timezone}</span>
      </div>
    </Window>
  );
}
function Inventory({ person }: { person: Finding }) {
  const groups = [
    { status: 'worn', label: 'Worn equipment & clothing' },
    { status: 'carried', label: 'Carried equipment' },
    { status: 'uncertain', label: 'Uncertain identification' },
  ] as const;
  if (!person.equipment)
    return (
      <div className="legacy-findings">
        <p>Earlier detector observations:</p>
        <p>
          Hardhat: {person.helmet.replaceAll('_', ' ')}
          <br />
          Vest: {person.vest.replaceAll('_', ' ')}
        </p>
      </div>
    );
  return (
    <>
      {groups.map((group) => {
        const equipment =
          person.equipment?.filter((item) => item.status === group.status) ??
          [];
        if (!equipment.length && group.status !== 'worn') return null;
        return (
          <section className="inventory-group" key={group.status}>
            <h3>
              {group.label} <span className="count">{equipment.length}</span>
            </h3>
            {equipment.length ? (
              <div className="equipment-list">
                {equipment.map((item, i) => (
                  <div className="equipment-item" key={`${item.name}-${i}`}>
                    <span
                      aria-hidden="true"
                      className={`equipment-symbol ${group.status}`}
                    >
                      {group.status === 'worn'
                        ? '✓'
                        : group.status === 'carried'
                          ? '↗'
                          : '?'}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <span className="equipment-kind">
                        {item.category === 'ppe'
                          ? 'PPE'
                          : item.category === 'workwear'
                            ? 'Clothing'
                            : 'Equipment'}
                      </span>
                      <p>{item.evidence}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No worn equipment could be identified clearly.</p>
            )}
          </section>
        );
      })}
      {!!person.requiredChecks?.length && (
        <section className="inventory-group">
          <h3>Required equipment check</h3>
          <div className="required-list">
            {person.requiredChecks.map((check) => (
              <div key={check.name}>
                <strong>{check.name}</strong>
                <span className={`check-status ${check.status}`}>
                  {check.status === 'observed'
                    ? 'Observed'
                    : check.status === 'not_observed'
                      ? 'Not observed'
                      : 'Uncertain'}
                </span>
                <p>{check.evidence}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {!!person.limitations?.length && (
        <section className="inventory-group">
          <h3>Visibility notes</h3>
          <ul>
            {person.limitations.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
function download(i: Inspection) {
  const url = URL.createObjectURL(
    new Blob(
      [JSON.stringify({ ...i, exportedAt: new Date().toISOString() }, null, 2)],
      { type: 'application/json' },
    ),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `safesight-${i.id}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Detail({
  id,
  auth,
  workspace,
}: {
  id: string;
  auth: Auth;
  workspace: Workspace;
}) {
  const router = useRouter(),
    action = useAction(auth);
  const query = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => api<Inspection>(`/inspections/${id}`),
    refetchInterval: (q) =>
      ['QUEUED', 'PROCESSING'].includes(q.state.data?.status ?? '')
        ? 2000
        : false,
  });
  const [selected, setSelected] = useState('');
  const inspection = query.data,
    result = inspection?.result;
  const person =
    result?.findings.find((p) => p.personId === selected) ??
    result?.findings[0];
  const busy =
    inspection && ['QUEUED', 'PROCESSING'].includes(inspection.status);
  async function reanalyze() {
    const next = await action.mutateAsync({
      path: `/inspections/${id}/reanalyze`,
    });
    if (next.id) router.push(`/inspections/${next.id}`);
  }
  return (
    <Window
      title={inspection?.original_name ?? 'Inspection'}
      icon="file"
      className="result-window"
    >
      <div className="toolbar">
        <Link href="/history" className="button">
          ← History
        </Link>
        <span className="toolbar-divider" />
        <button
          disabled={
            !inspection ||
            busy ||
            inspection.image_deleted ||
            !workspace.inference.ready ||
            action.isPending
          }
          onClick={() => void reanalyze().catch(() => {})}
        >
          Analyze again
        </button>
        <button
          disabled={!result}
          onClick={() => inspection && download(inspection)}
        >
          Save report
        </button>
        <button disabled={!result} onClick={() => window.print()}>
          Print
        </button>
      </div>
      <div className="window-body">
        <ErrorNotice error={query.error} />
        <ErrorNotice error={action.error} />
        {query.isPending ? (
          <Loading />
        ) : (
          inspection && (
            <>
              <div className="inspection-meta">
                <Status status={inspection.status} />
                <span>
                  {stamp(inspection.created_at, auth.facility.timezone)}
                </span>
                <span>
                  {inspection.width} × {inspection.height} px
                </span>
              </div>
              <div className="review-layout">
                <section className="photo-pane">
                  <div className="pane-heading">Source photograph</div>
                  <div className="image-view inset">
                    {inspection.image_deleted ? (
                      <div className="empty">
                        Photograph removed.
                        <br />
                        The saved analysis is retained.
                      </div>
                    ) : (
                      <img
                        src={`/api/inspections/${id}/image`}
                        alt={`Source photograph: ${inspection.original_name}`}
                      />
                    )}
                  </div>
                  <div className="photo-caption">
                    <span>Original normalized image</span>
                    {!inspection.image_deleted && !busy && (
                      <button
                        className="text-button"
                        disabled={action.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Remove this photograph? The saved analysis will remain.',
                            )
                          )
                            action.mutate({
                              path: `/inspections/${id}/image`,
                              method: 'DELETE',
                            });
                        }}
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </section>
                <section className="analysis-pane">
                  <div className="pane-heading">
                    Safety analysis{' '}
                    <span>
                      {result
                        ? `${result.findings.length} person${result.findings.length === 1 ? '' : 's'}${result.machines?.length ? ` · ${result.machines.length} machine${result.machines.length === 1 ? '' : 's'}` : ''}`
                        : 'Pending'}
                    </span>
                  </div>
                  <div
                    className="inventory-paper inset"
                    role="region"
                    aria-label="Safety analysis"
                    tabIndex={0}
                  >
                    {busy && (
                      <Notice>
                        <strong>Analyzing photograph…</strong>
                        <p>
                          Identifying people, equipment and machinery. This
                          window updates automatically.
                        </p>
                        <div
                          className="progress"
                          aria-label="Analysis in progress"
                          role="progressbar"
                        >
                          <span />
                        </div>
                      </Notice>
                    )}
                    {inspection.status === 'FAILED' && (
                      <Notice error>
                        <strong>Analysis failed</strong>
                        <p>{inspection.error}</p>
                        {inspection.attempts < 3 &&
                          !inspection.image_deleted && (
                            <button
                              disabled={
                                !workspace.inference.ready || action.isPending
                              }
                              onClick={() =>
                                action.mutate({
                                  path: `/inspections/${id}/retry`,
                                })
                              }
                            >
                              Retry analysis
                            </button>
                          )}
                      </Notice>
                    )}
                    {result && result.analysisType !== 'vision' && (
                      <Notice>
                        <strong>Earlier detector result</strong>
                        <p>
                          This inspection used the old helmet-and-vest detector.
                          Analyze again with vision AI for a full visible
                          equipment inventory.
                        </p>
                      </Notice>
                    )}
                    {inspection.requirements.operationContext && (
                      <p className="inspection-context">
                        <strong>Activity / machine context:</strong>{' '}
                        {inspection.requirements.operationContext}
                      </p>
                    )}
                    {result?.analysisType === 'vision' && !result.machines && (
                      <Notice>
                        This earlier analysis does not include machinery
                        guidance. Use Analyze again to inspect the saved
                        photograph with the updated AI.
                      </Notice>
                    )}

                    {!result ? (
                      <div className="empty">
                        PPE observations and machinery precautions appear here
                        when analysis completes.
                      </div>
                    ) : (
                      <>
                        {result.summary && (
                          <p className="analysis-summary">{result.summary}</p>
                        )}
                        {!result.findings.length && result.machines?.length ? (
                          <p className="no-operator">
                            No person is visible. Operator PPE recommendations
                            below describe what to wear for the task.
                          </p>
                        ) : !result.findings.length ? (
                          <div className="empty">
                            <PixelIcon />
                            <h2>No people identified</h2>
                            <p>
                              No per-person equipment assessment is available
                              for this photograph.
                            </p>
                          </div>
                        ) : (
                          <>
                            <div
                              className="person-selector"
                              role="group"
                              aria-label="Select person"
                            >
                              {result.findings.map((f) => (
                                <button
                                  key={f.personId}
                                  aria-pressed={f.personId === person?.personId}
                                  onClick={() => setSelected(f.personId)}
                                >
                                  {f.personId}
                                </button>
                              ))}
                            </div>
                            {person && (
                              <>
                                <div className="person-heading">
                                  <h2>Person {person.personId}</h2>
                                  <p>
                                    {person.description ??
                                      'Legacy detector observation'}
                                  </p>
                                </div>
                                <Inventory person={person} />
                              </>
                            )}
                          </>
                        )}
                        {!!result.machines?.length && (
                          <MachinerySafety machines={result.machines} />
                        )}
                        {result.machines?.length === 0 &&
                          result.findings.length > 0 && (
                            <p className="fine-print no-machinery">
                              No machinery identified in this photograph.
                            </p>
                          )}
                      </>
                    )}
                  </div>
                </section>
              </div>
              {result && (
                <>
                  <div className="analysis-provenance">
                    <span>
                      {result.provider ?? 'Legacy detector'} ·{' '}
                      {result.modelVersion}
                    </span>
                    <span>{(result.processingMs / 1000).toFixed(1)} s</span>
                  </div>
                </>
              )}
            </>
          )
        )}
      </div>
      <div className="statusbar">
        <span>{inspection ? statuses[inspection.status] : 'Loading'}</span>
        <span>Saved safety analysis</span>
      </div>
    </Window>
  );
}
function Desktop() {
  const client = useQueryClient();
  const auth = useQuery({
    queryKey: ['auth'],
    queryFn: () => api<Auth>('/auth/me'),
    staleTime: 10 * 60 * 1000,
  });
  const workspace = useQuery({
    queryKey: ['workspace'],
    queryFn: () => api<Workspace>('/workspace'),
    enabled: !!auth.data,
    refetchInterval: 15000,
  });
  useEffect(() => {
    if (!auth.data) return;
    const stream = new EventSource('/api/events');
    stream.addEventListener('change', () => refresh(client));
    return () => stream.close();
  }, [auth.data, client]);
  return (
    <ComputerDesktop
      timezone={auth.data?.facility.timezone ?? 'UTC'}
      ready={workspace.data?.inference.ready ?? false}
      loading={
        auth.isPending || workspace.isPending || !auth.data || !workspace.data
      }
      error={<ErrorNotice error={auth.error ?? workspace.error} />}
      renderApp={(app) => {
        if (!auth.data || !workspace.data) return null;
        if (app.kind === 'result' && app.inspectionId)
          return (
            <Detail
              id={app.inspectionId}
              auth={auth.data}
              workspace={workspace.data}
            />
          );
        if (app.kind === 'settings')
          return <Settings auth={auth.data} workspace={workspace.data} />;
        if (app.kind === 'history') return <History auth={auth.data} />;
        return (
          <Inspect
            auth={auth.data}
            workspace={workspace.data}
            kind={app.kind === 'machinery' ? 'machinery' : 'human'}
          />
        );
      }}
    />
  );
}

export default function Application() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Desktop />
    </QueryClientProvider>
  );
}
