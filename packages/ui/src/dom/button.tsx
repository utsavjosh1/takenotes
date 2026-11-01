import type { ComponentPropsWithRef, ReactNode } from "react";
import { actionState, canonicalVariant, type ActionState, type ButtonSize, type ButtonVariant } from "../behavior";

export type ButtonProps = ComponentPropsWithRef<"button"> & ActionState & {
  variant?: ButtonVariant;
  /** sm 26px, md 30px (default), lg 36px. Touch devices always get 44px. */
  size?: ButtonSize;
  pendingLabel?: string;
};

/** Operations stay in the caller. Pending blocks repeated activation without
 * removing the focused button; type defaults to button, never implicit submit. */
export function Button({ variant = "default", size = "md", pending = false, pendingLabel, disabled,
  children, className = "", onClick, type = "button", ...props }: ButtonProps) {
  const state = actionState({ disabled, pending });
  return (
    <button {...props} type={type} disabled={disabled} aria-disabled={state.blocked || undefined}
      aria-busy={state.busy || undefined} className={`tn-button tn-button--${canonicalVariant(variant)} tn-button--${size} ${className}`}
      onClick={(event) => {
        if (state.blocked) { event.preventDefault(); return; }
        onClick?.(event);
      }}>
      {pendingLabel ? <span className="tn-button-labels">
        <span style={{ visibility: pending ? "hidden" : undefined }} aria-hidden={pending || undefined}>{children}</span>
        <span style={{ visibility: pending ? undefined : "hidden" }} aria-hidden={!pending || undefined}>{pendingLabel}</span>
      </span> : children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, "children" | "aria-label" | "pendingLabel"> & {
  label: string;
  children: ReactNode;
};
export function IconButton({ label, children, className = "", variant = "ghost", ...props }: IconButtonProps) {
  return <Button {...props} variant={variant} aria-label={label} title={props.title ?? label}
    className={`tn-icon-button ${className}`}><span aria-hidden="true">{children}</span></Button>;
}
