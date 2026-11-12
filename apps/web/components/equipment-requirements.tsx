'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { PixelIcon } from './workspace-ui';

const equipmentGroups = [
  {
    title: 'Head & face',
    items: [
      'Hardhat',
      'Welding helmet',
      'Safety glasses / goggles',
      'Face shield',
      'Hearing protection',
      'Respirator',
    ],
  },
  {
    title: 'Body & hands',
    items: [
      'High-visibility vest',
      'Protective gloves',
      'Protective coveralls',
      'Safety harness',
    ],
  },
  { title: 'Footwear', items: ['Safety boots'] },
];
export function equipmentChecklist(required: string[], custom: string) {
  return [
    ...new Set([
      ...required,
      ...custom
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    ]),
  ];
}
export function invalidEquipment(items: string[]) {
  return items.length > 20 || items.some((name) => name.length > 100);
}
export function EquipmentRequirements({
  required,
  custom,
  onApply,
  onCancel,
}: {
  required: string[];
  custom: string;
  onApply: (required: string[], custom: string) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    id = useId();
  const [selection, setSelection] = useState(required),
    [other, setOther] = useState(custom);
  const invalid = invalidEquipment(equipmentChecklist(selection, other));
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="equipment-dialog window"
      aria-labelledby={`${id}-title`}
      onCancel={onCancel}
      onKeyDown={(event) => {
        if (event.altKey && event.key === 'F4') {
          event.preventDefault();
          onCancel();
        }
        event.stopPropagation();
      }}
    >
      <div className="titlebar">
        <PixelIcon name="human" small />
        <h2 id={`${id}-title`}>Required equipment</h2>
        <div className="window-controls">
          <button aria-label="Close required equipment" onClick={onCancel}>
            <span className="control-close" />
          </button>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!invalid) onApply(selection, other);
        }}
      >
        <p className="dialog-instruction">
          List all visible equipment. Also check these items for each person:
        </p>
        <div className="requirements-groups">
          {equipmentGroups.map((group) => (
            <fieldset key={group.title}>
              <legend>{group.title}</legend>
              <div className="requirement-options">
                {group.items.map((name) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={selection.includes(name)}
                      onChange={(event) =>
                        setSelection((previous) =>
                          event.target.checked
                            ? [...previous, name]
                            : previous.filter((item) => item !== name),
                        )
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <label htmlFor={`${id}-other`}>Other required equipment</label>
        <input
          id={`${id}-other`}
          value={other}
          maxLength={1000}
          placeholder="e.g. welding apron, knee pads"
          onChange={(event) => setOther(event.target.value)}
        />
        <p className="dialog-hint">
          Separate names with commas. Leave all unchecked for inventory only.
        </p>
        {invalid && (
          <p role="alert" className="field-error">
            Use up to 20 items, with at most 100 characters per item.
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="dialog-reset"
            onClick={() => {
              setSelection([]);
              setOther('');
            }}
          >
            Clear requirements
          </button>
          <button type="submit" className="default-command" disabled={invalid}>
            OK
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
