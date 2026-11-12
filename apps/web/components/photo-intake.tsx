'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import type { Inspection } from '@safesight/contracts';
import { api } from '@/lib/api';
import { PixelIcon } from './workspace-ui';
export type UploadItem = {
  key: string;
  file: File;
  status: 'ready' | 'uploading' | 'queued' | 'error';
  error?: string;
  id?: string;
};
function Photo({
  file,
  zoom = 'fit',
  onSize,
}: {
  file: File;
  zoom?: string;
  onSize?: (width: number, height: number) => void;
}) {
  const [url, setUrl] = useState(''),
    [width, setWidth] = useState(0);
  useEffect(() => {
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return url ? (
    <img
      src={url}
      alt={file.name}
      style={
        zoom === 'fit'
          ? undefined
          : {
              width: (width * Number(zoom)) / 100,
              maxWidth: 'none',
              maxHeight: 'none',
            }
      }
      onLoad={(event) => {
        setWidth(event.currentTarget.naturalWidth);
        onSize?.(
          event.currentTarget.naturalWidth,
          event.currentTarget.naturalHeight,
        );
      }}
    />
  ) : null;
}
const jobLabels = {
  QUEUED: 'Queued',
  PROCESSING: 'Analyzing…',
  COMPLETED: 'Complete',
  FAILED: 'Analysis failed',
};
export function PhotoIntake({
  kind,
  items,
  busy,
  onAdd,
  onRemove,
  onClear,
  tools,
}: {
  kind: 'human' | 'machinery';
  items: UploadItem[];
  busy: boolean;
  onAdd: (files: FileList | File[]) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  tools?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false),
    [selected, setSelected] = useState(''),
    [zoom, setZoom] = useState('fit');
  const [dimensions, setDimensions] = useState<{
    key: string;
    width: number;
    height: number;
  } | null>(null);
  const machine = kind === 'machinery';
  const active = items.find((item) => item.key === selected) ?? items[0];
  const jobs = items.filter((item) => item.id);
  const queries = useQueries({
    queries: jobs.map((item) => ({
      queryKey: ['inspection', item.id],
      queryFn: () => api<Inspection>(`/inspections/${item.id}`),
      refetchInterval: (query: { state: { data: Inspection | undefined } }) =>
        ['QUEUED', 'PROCESSING'].includes(query.state.data?.status ?? 'QUEUED')
          ? Math.max(3000, jobs.length * 1200)
          : false,
      staleTime: 2000,
      retry: 1,
    })),
  });
  function jobFor(item: UploadItem) {
    return queries[jobs.findIndex((job) => job.key === item.key)];
  }
  function label(item: UploadItem) {
    const query = jobFor(item);
    return (
      item.error ??
      (query?.isError
        ? 'Status unavailable'
        : query?.data
          ? jobLabels[query.data.status]
          : item.status === 'queued'
            ? 'Queued'
            : item.status === 'uploading'
              ? 'Uploading…'
              : 'Ready')
    );
  }
  const finished = queries.filter(
    (query) =>
      query.data && ['COMPLETED', 'FAILED'].includes(query.data.status),
  ).length;
  const activeJob = active ? jobFor(active) : undefined;
  const list = (
    <div
      className="photo-file-list inset"
      role="group"
      aria-label={
        machine ? 'Select machine photograph' : 'Select person photograph'
      }
    >
      <div className="file-list-heading">
        <span>Name</span>
        <span>Status</span>
      </div>
      {!items.length && (
        <p className="file-list-empty">No photographs selected.</p>
      )}
      {items.map((item) => (
        <div className="photo-file-row" key={item.key}>
          <button
            className="photo-file-select"
            aria-label={`Preview ${item.file.name}`}
            aria-pressed={item.key === active?.key}
            onClick={() => {
              setSelected(item.key);
              setZoom('fit');
            }}
          >
            <PixelIcon name="file" small />
            <span>{item.file.name}</span>
            <span
              className={`file-job-status ${item.error || jobFor(item)?.data?.status === 'FAILED' ? 'file-job-error' : ''}`}
              title={label(item)}
            >
              {label(item)}
            </span>
          </button>
          {item.id && (
            <Link
              href={`/inspections/${item.id}`}
              className="file-result"
              aria-label="View analysis →"
              title={`View analysis of ${item.file.name}`}
            >
              View
            </Link>
          )}
        </div>
      ))}
    </div>
  );
  const viewer = (
    <div className="photo-viewer">
      <div className="preview-tools">
        <span>Photograph</span>
        <label>
          Zoom{' '}
          <select
            aria-label="Photo zoom"
            value={zoom}
            disabled={!active || !!active.error}
            onChange={(event) => setZoom(event.target.value)}
          >
            <option value="fit">Fit</option>
            <option value="100">100%</option>
            <option value="200">200%</option>
            <option value="400">400%</option>
          </select>
        </label>
      </div>
      <div
        className={`photo-viewer-stage inset ${machine ? 'machine-photo-stage' : 'human-photo-stage'} ${zoom === 'fit' ? 'fit-photo' : 'zoomed-photo'} ${dragging ? 'dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onAdd(event.dataTransfer.files);
        }}
      >
        {active && !active.error ? (
          <Photo
            key={active.key}
            file={active.file}
            zoom={zoom}
            onSize={(width, height) =>
              setDimensions({ key: active.key, width, height })
            }
          />
        ) : (
          <div className="photo-viewer-empty">
            <PixelIcon name={machine ? 'machinery' : 'human'} />
            <p>
              {active?.error ??
                (machine
                  ? 'Open a machine photograph.'
                  : 'Open a photograph of people.')}
            </p>
            <span>
              {machine
                ? 'Include guards, controls and the work area.'
                : 'Include the head, hands and footwear.'}
            </span>
            <button disabled={busy} onClick={() => input.current?.click()}>
              Browse images…
            </button>
            <span>or drop JPEG, PNG or WebP files here</span>
          </div>
        )}
      </div>
      <div className="photo-properties">
        <span title={active?.file.name}>
          {active?.file.name ?? 'No photograph'}
        </span>
        <span>
          {active
            ? `${(active.file.size / 1024 / 1024).toFixed(1)} MB`
            : '8 MB maximum'}
          {active && dimensions?.key === active.key
            ? ` · ${dimensions?.width} × ${dimensions?.height}`
            : ''}
        </span>
      </div>
      {activeJob?.data?.status === 'FAILED' && (
        <p className="field-error" role="alert">
          {activeJob.data.error ?? 'Analysis failed. Open the result to retry.'}
        </p>
      )}
      {activeJob?.isError && (
        <div className="status-retry">
          Status unavailable.{' '}
          <button onClick={() => void activeJob.refetch()}>
            Refresh status
          </button>
        </div>
      )}
    </div>
  );
  return (
    <section
      className={`photo-intake ${machine ? 'machine-photo-intake' : 'human-photo-intake'}`}
      aria-label={machine ? 'Machine photographs' : 'People photographs'}
    >
      <div
        className="intake-toolbar"
        role="toolbar"
        aria-label="Photograph commands"
      >
        <button disabled={busy} onClick={() => input.current?.click()}>
          <PixelIcon name="history" small />
          Open photos…
        </button>
        <button
          disabled={busy || !active}
          onClick={() => active && onRemove(active.key)}
        >
          Remove
        </button>
        <button disabled={busy || !items.length} onClick={onClear}>
          Clear
        </button>
        {tools}
      </div>
      <div className={machine ? 'machine-photographs' : 'human-photographs'}>
        {machine ? (
          <>
            {viewer}
            {list}
          </>
        ) : (
          <>
            {list}
            {viewer}
          </>
        )}
      </div>
      <div className="batch-progress" role="status">
        <span>
          {items.length} photograph{items.length === 1 ? '' : 's'}
          {jobs.length ? ` · ${finished} of ${jobs.length} finished` : ''}
        </span>
        {jobs.length > 0 && (
          <progress
            aria-label="Analysis progress"
            value={finished}
            max={jobs.length}
          />
        )}
      </div>
      <input
        ref={input}
        aria-label="Site images"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          if (event.target.files) onAdd(event.target.files);
          event.target.value = '';
        }}
      />
    </section>
  );
}
