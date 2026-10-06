import { useEffect, useId, type JSX } from "react";
import { Button, Dialog, Notice, SelectField, TextField } from "@takenotes/ui/dom";
import { useForm } from "react-hook-form";
import { valibotResolver } from "@hookform/resolvers/valibot";
import type { WslDistribution, WslLinuxUser } from "@takenotes/contracts/ipc";
import { WslConnectSchema, type WslConnectInput } from "@takenotes/core/validation/schemas";
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
}: {
  dialog: WslDialogState;
  onDistro: (distro: string) => void;
  onConnect: (data: WslConnectInput) => void;
  onClose: () => void;
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
  return (
    <Dialog title="Open WSL folder" onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      {dialog.distros.length > 0 && <Button form={formId} type="submit" variant="primary"
        disabled={!isValid || dialog.usersLoading} pending={dialog.connecting} pendingLabel="Opening…">Open workspace</Button>}
    </>}>
      <form id={formId} className="dialog-stack" onSubmit={(e) => {
        if (dialog.connecting) { e.preventDefault(); return; }
        void handleSubmit(onConnect)(e);
      }}>
        {dialog.error && <Notice tone="danger" announcement="assertive" title="Couldn’t open this workspace">{dialog.error}</Notice>}
        {dialog.distros.length > 0 && <>
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
