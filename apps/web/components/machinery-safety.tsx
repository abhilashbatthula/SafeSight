'use client';
import { useState } from 'react';
import type { Machine } from '@safesight/contracts';
const phases = [
  ['before_use', 'Before use'],
  ['operation', 'During operation'],
  ['maintenance', 'Maintenance & energy isolation'],
  ['emergency', 'Emergency precautions'],
] as const;
export function MachinerySafety({ machines }: { machines: Machine[] }) {
  const [selected, setSelected] = useState(''),
    [focus, setFocus] = useState('all');
  const machine =
    machines.find((item) => item.machineId === selected) ?? machines[0];
  if (!machine) return null;
  return (
    <section
      className="machinery-safety"
      aria-label="Machinery safety analysis"
    >
      <div className="machinery-heading">
        <h2>Machinery safety</h2>
        <span className="count">{machines.length}</span>
      </div>
      {machines.length > 1 && (
        <div
          className="person-selector"
          role="group"
          aria-label="Select machinery"
        >
          {machines.map((item) => (
            <button
              key={item.machineId}
              aria-pressed={item.machineId === machine.machineId}
              onClick={() => setSelected(item.machineId)}
            >
              {item.machineId}
            </button>
          ))}
        </div>
      )}
      <div className="person-heading">
        <h3>{machine.name}</h3>
        <span className="equipment-kind">
          {machine.identification === 'identified'
            ? 'Visual identification'
            : machine.identification === 'likely'
              ? 'Likely identification'
              : 'Identification uncertain'}
        </span>
        <p>{machine.description}</p>
      </div>
      <p className="machine-scope">
        Preliminary guidance from this photograph. Confirm the machine manual,
        task-specific risk assessment and operator training before use.
      </p>
      {machine.entanglementRisk && (
        <p className="entanglement-warning">
          <strong>Entanglement risk.</strong> Keep gloves, loose clothing,
          jewellery, lanyards and dangling wearables away from moving parts.
          Handling gloves may be appropriate only after safe stopping and
          isolation, as specified for the task.
        </p>
      )}
      <section className="inventory-group">
        <h3>Hazards to consider</h3>
        <div className="equipment-list">
          {machine.hazards.map((hazard, i) => (
            <div key={i} className="machine-hazard">
              <div>
                <strong>{hazard.name}</strong>
                <span className={`hazard-basis ${hazard.basis}`}>
                  {hazard.basis === 'visible'
                    ? 'Visible in image'
                    : 'Typical risk · verify'}
                </span>
              </div>
              <p>{hazard.details}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="inventory-group">
        <h3>Operator PPE & safety wearables</h3>
        <div className="equipment-list">
          {machine.recommendedWearables.map((item, i) => (
            <div className="wearable-item" key={i}>
              <div className="wearable-title">
                <strong>{item.name}</strong>
                <span
                  className={`check-status ${item.usage === 'avoid_during_operation' ? 'not_observed' : item.usage === 'recommended' ? 'observed' : 'uncertain'}`}
                >
                  {item.usage === 'avoid_during_operation'
                    ? 'Avoid during operation'
                    : item.usage === 'task_dependent'
                      ? 'Task dependent'
                      : 'Recommended'}
                </span>
              </div>
              <p>{item.purpose}</p>
              <p className="wearable-condition">
                <strong>When:</strong> {item.condition}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="inventory-group">
        <div className="precautions-heading">
          <h3>Safety precautions</h3>
          <label>
            Show{' '}
            <select
              aria-label="Precaution phase"
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
            >
              <option value="all">All phases</option>
              {phases.map(([phase, title]) => (
                <option key={phase} value={phase}>
                  {title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {phases.map(([phase, title]) => {
          const precautions = machine.precautions.filter(
            (item) => item.phase === phase,
          );
          return precautions.length ? (
            <div
              className={`precaution-phase ${focus !== 'all' && focus !== phase ? 'filtered-phase' : ''}`}
              key={phase}
            >
              <h4>{title}</h4>
              <ol>
                {precautions.map((item, i) => (
                  <li key={i}>
                    <strong>{item.action}</strong>
                    <p>{item.reason}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null;
        })}
      </section>
      {!!machine.questions.length && (
        <section className="inventory-group">
          <h3>Confirm before use</h3>
          <ul>
            {machine.questions.map((question, i) => (
              <li key={i}>{question}</li>
            ))}
          </ul>
          <p className="fine-print">
            Add these details to Task / operation when uploading a new
            inspection.
          </p>
        </section>
      )}
      <details className="machine-references">
        <summary>General safety references</summary>
        <p>
          These references support general guarding, energy-isolation and
          entanglement precautions. They do not verify this machine or the AI
          recommendations.
        </p>
        <ul>
          <li>
            <a
              href="https://www.osha.gov/etools/machine-guarding/introduction/general-requirements"
              target="_blank"
              rel="noreferrer"
            >
              OSHA: machine guarding and energy isolation
            </a>
          </li>
          <li>
            <a
              href="https://www.hse.gov.uk/pubns/eis16.pdf"
              target="_blank"
              rel="noreferrer"
            >
              HSE: glove use and rotating machinery
            </a>
          </li>
        </ul>
      </details>
    </section>
  );
}
