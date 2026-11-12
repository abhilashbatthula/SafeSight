'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import type { Auth } from '@safesight/contracts';
import { api } from '@/lib/api';
import { Notice, type Workspace } from './workspace-ui';
import { PhotoIntake, type UploadItem } from './photo-intake';
import {
  EquipmentRequirements,
  equipmentChecklist,
  invalidEquipment,
} from './equipment-requirements';

function validation(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return 'Use a JPEG, PNG, or WebP image.';
  if (file.size > 8 * 1024 * 1024) return 'Image exceeds 8 MB.';
}
export function UploadPanel({
  auth,
  workspace,
  kind,
}: {
  auth: Auth;
  workspace: Workspace;
  kind: 'human' | 'machinery';
}) {
  const [required, setRequired] = useState<string[]>([]),
    [custom, setCustom] = useState(''),
    [context, setContext] = useState('');
  const [model, setModel] = useState(''),
    [material, setMaterial] = useState(''),
    [environment, setEnvironment] = useState('');
  const [phase, setPhase] = useState('All stages'),
    [requirementsOpen, setRequirementsOpen] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]),
    [busy, setBusy] = useState(false);
  const fieldId = useId(),
    client = useQueryClient(),
    human = kind === 'human';
  const ready = items.filter(
    (item) =>
      item.status === 'ready' ||
      (item.status === 'error' && !validation(item.file)),
  );
  const checklist = human ? equipmentChecklist(required, custom) : [];
  const invalidChecklist = invalidEquipment(checklist);
  const operationContext = human
    ? context.trim()
    : [
        `Assessment focus: ${phase}`,
        context.trim() && `Task: ${context.trim()}`,
        model.trim() && `Machine/model: ${model.trim()}`,
        material.trim() && `Material: ${material.trim()}`,
        environment.trim() && `Environment: ${environment.trim()}`,
      ]
        .filter(Boolean)
        .join('\n');
  function add(files: FileList | File[]) {
    if (busy) return;
    const selectedFiles = Array.from(files);
    setItems((previous) => [
      ...previous,
      ...selectedFiles.map((file) => {
        const error = validation(file);
        return {
          key: crypto.randomUUID(),
          file,
          status: error ? ('error' as const) : ('ready' as const),
          error,
        };
      }),
    ]);
  }
  function update(key: string, values: Partial<UploadItem>) {
    setItems((previous) =>
      previous.map((item) =>
        item.key === key ? { ...item, ...values } : item,
      ),
    );
  }
  async function upload() {
    if (
      busy ||
      !ready.length ||
      !workspace.inference.ready ||
      !workspace.zoneId ||
      invalidChecklist
    )
      return;
    setBusy(true);
    try {
      for (const item of ready) {
        update(item.key, { status: 'uploading', error: undefined });
        const form = new FormData();
        form.set('zoneId', workspace.zoneId);
        form.set('image', item.file);
        form.set('requiredEquipment', JSON.stringify(checklist));
        form.set('operationContext', operationContext);
        try {
          const result = await api<{ id: string }>(
            '/inspections',
            { method: 'POST', body: form },
            auth.csrf,
          );
          update(item.key, { status: 'queued', id: result.id });
          void client.invalidateQueries({
            predicate: (query) => query.queryKey[0] !== 'auth',
          });
        } catch (error) {
          update(item.key, {
            status: 'error',
            error:
              error instanceof Error
                ? error.message
                : 'Upload failed. Try again.',
          });
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const requirementsButton = (
    <button disabled={busy} onClick={() => setRequirementsOpen(true)}>
      Required equipment…
    </button>
  );
  const photos = (
    <PhotoIntake
      kind={kind}
      items={items}
      busy={busy}
      onAdd={add}
      onRemove={(key) =>
        setItems((previous) => previous.filter((item) => item.key !== key))
      }
      onClear={() => setItems([])}
      tools={human ? requirementsButton : undefined}
    />
  );
  return (
    <div
      className={`upload-panel ${human ? 'human-workspace' : 'machinery-workspace'}`}
    >
      {!workspace.inference.ready && (
        <Notice>
          <strong>Vision AI is unavailable.</strong>
          <p>
            You can select images now.{' '}
            <Link href="/settings">Open Settings</Link> to enable analysis.
          </p>
        </Notice>
      )}
      {human ? (
        <>
          <div className="human-inspection-layout">{photos}</div>
          <div className="human-inspection-options">
            <label htmlFor={`${fieldId}-activity`}>Work activity:</label>
            <input
              id={`${fieldId}-activity`}
              placeholder="e.g. welding, working at height"
              maxLength={1000}
              value={context}
              disabled={busy}
              onChange={(event) => setContext(event.target.value)}
            />
            <span className="requirements-summary" title={checklist.join(', ')}>
              {checklist.length
                ? `${checklist.length} required item${checklist.length === 1 ? '' : 's'}`
                : 'Inventory all equipment'}
            </span>
          </div>
        </>
      ) : (
        <div className="machine-worksheet">
          <section
            className="machine-brief"
            aria-labelledby={`${fieldId}-context-title`}
          >
            <h2 id={`${fieldId}-context-title`}>Safety assessment</h2>
            <fieldset
              className="machine-context-fields"
              aria-labelledby={`${fieldId}-context-title`}
              disabled={busy}
            >
              <label htmlFor={`${fieldId}-phase`}>Assessment focus</label>
              <select
                id={`${fieldId}-phase`}
                value={phase}
                onChange={(event) => setPhase(event.target.value)}
              >
                {[
                  'All stages',
                  'Before use',
                  'During operation',
                  'Maintenance & isolation',
                  'Emergency planning',
                ].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <label htmlFor={`${fieldId}-task`}>Task / operation</label>
              <textarea
                id={`${fieldId}-task`}
                rows={3}
                maxLength={350}
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="What will the operator do?"
              />
              <label htmlFor={`${fieldId}-model`}>Machine / model</label>
              <input
                id={`${fieldId}-model`}
                maxLength={120}
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="Leave blank to identify from photo"
              />
              <details className="machine-extra-details">
                <summary>Material & work environment</summary>
                <label htmlFor={`${fieldId}-material`}>
                  Material / workpiece
                </label>
                <input
                  id={`${fieldId}-material`}
                  maxLength={120}
                  value={material}
                  onChange={(event) => setMaterial(event.target.value)}
                  placeholder="e.g. steel stock"
                />
                <label htmlFor={`${fieldId}-environment`}>
                  Work environment
                </label>
                <input
                  id={`${fieldId}-environment`}
                  maxLength={240}
                  value={environment}
                  onChange={(event) => setEnvironment(event.target.value)}
                  placeholder="e.g. indoor workshop, ventilation"
                />
              </details>
            </fieldset>
            <div className="machine-assessment-scope">
              <p>
                Leave unknown details blank. Confirm photo guidance against the
                machine manual and an on-site assessment.
              </p>
            </div>
          </section>
          {photos}
        </div>
      )}
      <div className="upload-actions">
        <p role="status">
          {busy
            ? 'Uploading photographs…'
            : `${ready.length} photograph${ready.length === 1 ? '' : 's'} ready · each image analyzed separately`}
        </p>
        <button
          className="primary-button"
          disabled={
            !ready.length ||
            busy ||
            !workspace.inference.ready ||
            !workspace.zoneId ||
            invalidChecklist
          }
          onClick={() => void upload()}
        >
          {busy ? 'Uploading…' : human ? 'Analyze PPE' : 'Analyze machinery'}
        </button>
      </div>
      {requirementsOpen && (
        <EquipmentRequirements
          required={required}
          custom={custom}
          onCancel={() => setRequirementsOpen(false)}
          onApply={(nextRequired, nextCustom) => {
            setRequired(nextRequired);
            setCustom(nextCustom);
            setRequirementsOpen(false);
          }}
        />
      )}
    </div>
  );
}
