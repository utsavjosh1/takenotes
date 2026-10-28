import { useEffect, useId, useRef, useState, type JSX } from "react";
import { Button, Dialog, Notice, SelectField, TextField } from "@takenotes/ui/dom";
import { useForm } from "react-hook-form";
import { valibotResolver } from "@hookform/resolvers/valibot";
import type { WslDistribution, WslLinuxUser } from "@takenotes/contracts/ipc";
import { WslConnectSchema, type WslConnectInput } from "@takenotes/core/validation/schemas";
import { stepStatuses, WIZARD_STEPS } from "@takenotes/core/workspace/onboarding";
import type { WslDialogState } from "../hooks/use-wsl-connect";

/** Picker label: `Name · Running|Stopped · WSL2` (+ default marker).
 * State/version are absent on the quiet fallback path — show honestly. */
function distroLabel(d: WslDistribution): string {
  const state = d.state ?? "Unknown";
  const version = d.version ? `WSL ${d.version}` : "WSL";
  const def = d.isDefault ? " (default)" : "";
  return `${d.name} · ${state} · ${version}${def}`;
}

/** WSL connect dialog. Form state (distro/user/path + validation) lives
 * here in React Hook Form; server data (distros, users, progress, errors)
 * comes from the dialog state owned by `useWslConnect`. */
export function WslDialog({
  dialog,
  onDistro,
  onConnect,
  onClose,
  onPairLink,
}: {
  dialog: WslDialogState;
  onDistro: (distro: string) => void;
  onConnect: (data: WslConnectInput) => void;
  onClose: () => void;
  onPairLink?: () => void;
}): JSX.Element {
  const { register, handleSubmit, setValue, formState: { errors, isValid } } = useForm<WslConnectInput>({
    resolver: valibotResolver(WslConnectSchema),
    mode: "onChange",
    defaultValues: { distro: dialog.initialDistro, linuxUser: "", path: "~/notes" },
  });
  // Preselect the distro default user once users arrive (manual picks are
  // never clobbered — the list only changes identity on distro switch,
  // which also resets the field below).
  useEffect(() => {
    if (dialog.users.length === 0) return;
    const def = dialog.users.find((u) => u.isDefault) ?? dialog.users[0];
    if (def) setValue("linuxUser", def.username, { shouldValidate: true });
  }, [dialog.users, setValue]);
  const distroRegister = register("distro");
  const formId = useId();
  const [submitted, setSubmitted] = useState(false);
  const lastRef = useRef<WslConnectInput | null>(null);
  const run = (data: WslConnectInput): void => { lastRef.current = data; setSubmitted(true); onConnect(data); };
  const failed = submitted && !dialog.connecting && !!dialog.error;
  // The connect call installs the helper and pairs in one go; the wizard shows
  // that stage as "Install helper" until the call returns.
  const phase = !submitted ? "choose" : "install";
  const statuses = stepStatuses(phase, failed ? "failed" : submitted ? "working" : "idle");
  const showProgress = submitted && (dialog.connecting || failed);
  return (
    <Dialog title="Open WSL folder" onClose={onClose} footer={<>
      {onPairLink && <Button onClick={onPairLink}>I have a pairing link</Button>}
      <Button onClick={onClose}>Cancel</Button>
      {dialog.distros.length > 0 && !failed && <Button form={formId} type="submit" variant="primary"
        disabled={!isValid || dialog.usersLoading} pending={dialog.connecting} pendingLabel="Setting up…">Set up and open</Button>}
    </>}>
      <form id={formId} className="dialog-stack" onSubmit={(e) => {
        if (dialog.connecting) { e.preventDefault(); return; }
        void handleSubmit(run)(e);
      }}>
        <ol className="wizard-steps" aria-label="Setup steps">
          {WIZARD_STEPS.map((st, i) => (
            <li key={st.id} className={`wiz-${statuses[i]}`} aria-current={st.id === phase ? "step" : undefined}>
              <span className="wiz-mark" aria-hidden="true">{statuses[i] === "done" ? "✓" : statuses[i] === "failed" ? "!" : i + 1}</span>
              {st.label}<span className="sr-only"> — {statuses[i]}</span>
            </li>
          ))}
        </ol>
        {failed && dialog.error && (
          <Notice tone="danger" announcement="assertive" title="Setup didn’t finish"
            actions={<><Button onClick={() => void navigator.clipboard.writeText(dialog.error ?? "")}>Copy details</Button><Button variant="primary" onClick={() => lastRef.current && run(lastRef.current)}>Try again</Button></>}>
            takenotes could not set up the helper in this distribution. Details: <span className="mono">{dialog.error}</span>
          </Notice>
        )}
        {!submitted && dialog.error && <Notice tone="danger" announcement="assertive" title="Couldn’t read your Linux distributions">{dialog.error}</Notice>}
        {dialog.distros.length > 0 && !showProgress && !failed && <>
          <SelectField label="Distribution" error={errors.distro?.message} {...distroRegister}
            onChange={(e) => {
              const v = e.target.value;
              setValue("distro", v, { shouldValidate: true });
              setValue("linuxUser", "");
              onDistro(v);
            }}>
            {dialog.distros.map((d) => <option key={d.name} value={d.name}>{distroLabel(d)}</option>)}
          </SelectField>
          <SelectField label="Linux user" {...register("linuxUser")}
            disabled={dialog.usersLoading || dialog.users.length === 0}
            error={errors.linuxUser?.message || dialog.usersError || undefined}
            description={dialog.usersLoading ? "Loading Linux users…" : dialog.users.length === 0 ? "No interactive users found in this distribution." : "File operations run as this Linux user."}>
            {dialog.users.map((u) => <option key={u.username} value={u.username}>
              {u.username}{u.isDefault ? " (default)" : ""} — {u.home}
            </option>)}
          </SelectField>
          <TextField label="WSL folder path" {...register("path")} placeholder="~/notes"
            description="Choose a folder in the selected distribution." error={errors.path?.message} />
        </>}
        {dialog.distros.length === 0 && !dialog.error && <p>No WSL distributions found.</p>}
      </form>
    </Dialog>
  );
}

export type { WslDistribution, WslLinuxUser };
