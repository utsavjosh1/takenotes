import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { fieldState, type FieldState } from "../behavior";

type FieldProps = FieldState & { label: string; id?: string };
type ControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

/** Label/help/error associations are owned here, validation remains in the
 * caller. Error text is live; ordinary help is not repeatedly announced. */
function Field({ label, id: suppliedId, description, error, describedBy, children }: FieldProps & {
  describedBy?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const state = fieldState({ description, error });
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const descriptions = [describedBy, state.description ? helpId : null, state.invalid ? errorId : null].filter(Boolean).join(" ");
  return <div className="tn-field">
    <label className="tn-field-label" htmlFor={id}>{label}</label>
    {children({ id, "aria-describedby": descriptions || undefined, "aria-invalid": state.invalid || undefined })}
    {state.description && <p className="tn-field-help" id={helpId}>{state.description}</p>}
    {state.error && <p className="tn-field-error" id={errorId} role="alert">{state.error}</p>}
  </div>;
}

export type TextFieldProps = Omit<ComponentPropsWithRef<"input">, "children" | "aria-invalid"> & FieldProps;
export function TextField({ label, description, error, id, className = "", "aria-describedby": describedBy, ...props }: TextFieldProps) {
  return <Field label={label} description={description} error={error} id={id} describedBy={describedBy}>
    {(control) => <input {...props} {...control} className={`tn-field-control ${className}`} />}
  </Field>;
}

export type SelectFieldProps = Omit<ComponentPropsWithRef<"select">, "aria-invalid"> & FieldProps;
export function SelectField({ label, description, error, id, className = "", "aria-describedby": describedBy, children, ...props }: SelectFieldProps) {
  return <Field label={label} description={description} error={error} id={id} describedBy={describedBy}>
    {(control) => <select {...props} {...control} className={`tn-field-control ${className}`}>{children}</select>}
  </Field>;
}

export type SettingControlProps = { id: string; "aria-labelledby": string; "aria-describedby"?: string };
export type SettingRowProps = {
  label: string;
  description?: string;
  children?: ReactNode | ((props: SettingControlProps) => ReactNode);
};
export function SettingRow({ label, description, children }: SettingRowProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const isControl = typeof children === "function";
  return <div className="tn-setting-row">
    <div className="tn-setting-description">
      {isControl ? <label id={labelId} htmlFor={id}>{label}</label> : <span id={labelId}>{label}</span>}
      {description && <p id={helpId}>{description}</p>}
    </div>
    {isControl ? children({ id, "aria-labelledby": labelId, "aria-describedby": description ? helpId : undefined }) : children}
  </div>;
}
