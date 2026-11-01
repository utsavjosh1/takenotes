import { useId, type ComponentPropsWithRef } from "react";

type NativeInput = Omit<ComponentPropsWithRef<"input">, "type" | "children">;

/** Bare text input. Use TextField when it needs a label, help and error text. */
export type InputProps = ComponentPropsWithRef<"input"> & { invalid?: boolean };
export function Input({ invalid, className = "", ...props }: InputProps) {
  return <input {...props} aria-invalid={invalid || props["aria-invalid"]} className={`tn-field-control ${className}`} />;
}

export type SelectProps = ComponentPropsWithRef<"select"> & { invalid?: boolean };
export function Select({ invalid, className = "", ...props }: SelectProps) {
  return <select {...props} aria-invalid={invalid || props["aria-invalid"]} className={`tn-field-control ${className}`} />;
}

export type TextareaProps = ComponentPropsWithRef<"textarea"> & { invalid?: boolean };
export function Textarea({ invalid, className = "", rows = 3, ...props }: TextareaProps) {
  return <textarea {...props} rows={rows} aria-invalid={invalid || props["aria-invalid"]} className={`tn-field-control ui-textarea ${className}`} />;
}

export type SwitchProps = NativeInput & {
  /** Accessible name. Required: a switch has no visible text of its own. */
  label: string;
};
/** 40x22 on/off. A native checkbox with role=switch: Space toggles. */
export function Switch({ label, className = "", ...props }: SwitchProps) {
  return <span className={`ui-switch ${className}`}>
    <input {...props} type="checkbox" role="switch" aria-label={label} />
    <span aria-hidden="true" />
  </span>;
}

export type CheckboxProps = NativeInput & {
  /** Visible text. Omit only when the surrounding UI supplies aria-label. */
  label?: string;
};
/** 18px, 5px radius, accent fill and a tick when checked. */
export function Checkbox({ label, className = "", id, ...props }: CheckboxProps) {
  const generated = useId();
  const box = <span className={`ui-check ${className}`}>
    <input {...props} id={label ? id ?? generated : id} type="checkbox" />
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="m4.5 9.5 3 3 6-7" /></svg>
  </span>;
  if (!label) return box;
  return <label className="ui-check-label" htmlFor={id ?? generated}>{box}<span>{label}</span></label>;
}
