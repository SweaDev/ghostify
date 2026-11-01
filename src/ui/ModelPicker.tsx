import { useState } from 'react';
import type { ModelGroup } from '../ai/catalog';

const CUSTOM = '__custom__';

/** A model dropdown with an "Other…" entry for typing any model id. */
export function ModelPicker(props: {
  label: string;
  value: string;
  groups: ModelGroup[];
  className: string;
  onChange: (model: string) => void;
}) {
  const listed = props.groups.some((g) => g.models.includes(props.value));
  const [custom, setCustom] = useState(false);
  const typing = custom || (!listed && !props.value);
  return (
    <>
      <select
        aria-label={`${props.label} model`}
        value={typing ? CUSTOM : props.value}
        onChange={(e) => {
          const v = e.target.value;
          setCustom(v === CUSTOM);
          if (v !== CUSTOM) props.onChange(v);
        }}
        className={`${props.className} w-56 font-mono text-xs`}
      >
        {!listed && props.value && !typing && <option value={props.value}>{props.value}</option>}
        {props.groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>Other…</option>
      </select>
      {typing && (
        <input
          aria-label={`${props.label} model id`}
          placeholder="model id"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className={`${props.className} w-48 font-mono text-xs`}
        />
      )}
    </>
  );
}
