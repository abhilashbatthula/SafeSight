'use client';
import { useContext, useEffect, useId, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsSchema, type Auth } from '@safesight/contracts';
import { api } from '@/lib/api';
import {
  Notice,
  PixelIcon,
  Window,
  WindowControls,
  type Workspace,
} from './workspace-ui';

export function WorkspaceSettings({
  auth,
  workspace,
}: {
  auth: Auth;
  workspace: Workspace;
}) {
  const controls = useContext(WindowControls);
  const client = useQueryClient();
  const fieldId = useId();
  const [baseline, setBaseline] = useState({
    name: auth.facility.name,
    timezone: auth.facility.timezone,
  });
  const [name, setName] = useState(baseline.name);
  const [timezone, setTimezone] = useState(baseline.timezone);
  const [now, setNow] = useState<Date | null>(null);
  const [saved, setSaved] = useState(false);
  const zones = useMemo(
    () =>
      [
        ...new Set([
          'UTC',
          baseline.timezone,
          ...Intl.supportedValuesOf('timeZone'),
        ]),
      ].sort(),
    [baseline.timezone],
  );
  const draft = { name: name.trim(), timezone };
  const dirty = draft.name !== baseline.name || timezone !== baseline.timezone;
  const valid = settingsSchema.safeParse(draft).success;
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const save = useMutation({
    mutationFn: (preferences: { name: string; timezone: string }) =>
      api(
        '/settings',
        { method: 'PATCH', body: JSON.stringify(preferences) },
        auth.csrf,
      ),
    onSuccess: (_, preferences) => {
      setBaseline(preferences);
      setName(preferences.name);
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['auth'] });
    },
  });
  async function confirm() {
    if (dirty) await save.mutateAsync(draft);
    controls?.close();
  }
  const preview = now
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now)
    : '—';
  return (
    <Window
      title="Workspace settings"
      icon="settings"
      className="settings-window"
    >
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void confirm().catch(() => {});
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !save.isPending) {
            event.stopPropagation();
            controls?.close();
          }
        }}
      >
        <div className="window-body">
          <div className="settings-heading">
            <PixelIcon name="settings" />
            <div>
              <strong>Workspace properties</strong>
              <p>Workspace name and display time.</p>
            </div>
          </div>
          <fieldset className="workspace-properties" disabled={save.isPending}>
            <legend>Workspace</legend>
            <div className="property-field">
              <label htmlFor={`${fieldId}-name`}>Workspace name</label>
              <input
                id={`${fieldId}-name`}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setSaved(false);
                }}
                minLength={3}
                maxLength={100}
                required
                aria-invalid={name.trim().length < 3}
              />
            </div>
            {name.trim().length < 3 && (
              <p className="property-error" role="alert">
                Enter a name with at least 3 characters.
              </p>
            )}
            <div className="property-field">
              <label htmlFor={`${fieldId}-timezone`}>Time zone</label>
              <select
                id={`${fieldId}-timezone`}
                value={timezone}
                onChange={(event) => {
                  setTimezone(event.target.value);
                  setSaved(false);
                }}
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="property-field clock-preview">
              <span>Clock preview</span>
              <output className="inset" aria-label="Clock preview">
                {preview}
              </output>
            </div>
          </fieldset>
          <fieldset className="vision-properties">
            <legend>Image analysis</legend>
            <div className="vision-summary">
              <strong>Google Gemini</strong>
              <span
                className={`state ${workspace.inference.ready ? 'state-completed' : 'state-failed'}`}
              >
                {workspace.inference.ready ? 'Configured' : 'Setup required'}
              </span>
            </div>
            {!workspace.inference.ready && (
              <p>
                {workspace.inference.reason ??
                  'Add a Gemini key to enable image analysis.'}
              </p>
            )}
            <details className="service-details">
              <summary>Service details & setup</summary>
              <dl>
                <dt>Model</dt>
                <dd>
                  {workspace.inference.modelVersion ?? 'gemini-3.1-flash-lite'}
                </dd>
                <dt>API key</dt>
                <dd>Stored on the server</dd>
              </dl>
              <p>
                API access and quota are checked when analyzing a photo. Keep
                billing disabled for free-tier use.
              </p>
              <p>
                For setup, add your{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google AI Studio key
                </a>{' '}
                as <code>GEMINI_API_KEY</code> in the server’s <code>.env</code>
                , then restart SafeSight.
              </p>
              <p>
                Photos are sent to Google. Free-tier content may be used to
                improve its products.{' '}
                <a
                  href="https://ai.google.dev/gemini-api/docs/pricing"
                  target="_blank"
                  rel="noreferrer"
                >
                  Usage limits and data terms
                </a>
              </p>
            </details>
          </fieldset>
          {save.error && <Notice error>{save.error.message}</Notice>}
          <p className="settings-feedback" role="status">
            {save.isPending
              ? 'Saving…'
              : dirty
                ? 'Changes have not been applied.'
                : saved
                  ? 'Preferences saved.'
                  : 'Changes apply to this shared workspace.'}
          </p>
        </div>
        <div className="property-actions">
          <button
            className="primary"
            type="submit"
            disabled={!valid || save.isPending}
          >
            OK
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => controls?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!dirty || !valid || save.isPending}
            onClick={() => save.mutate(draft)}
          >
            Apply
          </button>
        </div>
      </form>
    </Window>
  );
}
