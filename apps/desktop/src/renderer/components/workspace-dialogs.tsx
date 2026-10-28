import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Button, Dialog, Notice, TextField } from "@takenotes/ui/dom";
import {
  lockoutMessage, normalizeServerAddress, parsePairLink, SignInLockout, validateWorkspaceName, WRONG_TOKEN_MESSAGE,
} from "@takenotes/core/workspace/onboarding";
import { getBridge } from "../bridge";

export function CreateWorkspaceDialog({ existing, onCreate, onClose }: {
  existing: string[]; onCreate: (name: string) => Promise<string | null>; onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const problem = validateWorkspaceName(name, existing);
  const shown = touched ? (problem ?? serverError ?? undefined) : undefined;
  const submit = async (): Promise<void> => {
    setTouched(true);
    if (problem || busy) return;
    setBusy(true);
    const err = await onCreate(name.trim());
    setBusy(false);
    if (err) setServerError(err);
  };
  return (
    <Dialog title="Create a workspace" onClose={onClose} initialFocus={nameRef}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={touched && !!problem} pending={busy} pendingLabel="Creating…" onClick={() => void submit()}>Create</Button></>}>
      <form className="dialog-stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <TextField label="Name" ref={nameRef} value={name} placeholder="My notes" error={shown}
          description="A folder with this name is created in your Documents folder, with a welcome note."
          onChange={(e) => { setName(e.target.value); setTouched(true); setServerError(null); }} />
      </form>
    </Dialog>
  );
}

const LOCK_KEY = "takenotes.signInLock";
const lockout = new SignInLockout({
  get: () => { try { return localStorage.getItem(LOCK_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(LOCK_KEY, v); } catch { /* storage unavailable: lockout lasts for this session only */ } },
});

export function ServerSignInDialog({ initialAddress = "", onSignedIn, onClose }: {
  initialAddress?: string; onSignedIn: (address: string) => void; onClose: () => void;
}): JSX.Element {
  const [address, setAddress] = useState(initialAddress);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const [seconds, setSeconds] = useState(() => lockout.secondsLeft());
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds(lockout.secondsLeft()), 500);
    return () => clearInterval(t);
  }, [seconds > 0]);
  const locked = seconds > 0;
  const addressProblem = address && !normalizeServerAddress(address) ? "Enter a full address, like https://notes.example.com" : undefined;
  const submit = async (): Promise<void> => {
    if (locked || busy) return;
    const origin = normalizeServerAddress(address);
    if (!origin) { setError("Enter a full address, like https://notes.example.com"); return; }
    if (!token) { setError("Enter your access token."); return; }
    const bridge = getBridge();
    if (!bridge) { setError("Server sign-in needs the desktop app."); return; }
    setBusy(true); setError(null); setDetails(null);
    const res = await bridge.workspace.verifyServer(origin, token);
    setBusy(false);
    if (res.ok) { lockout.recordSuccess(); onSignedIn(origin); return; }
    if (res.error.code === "PERMISSION_DENIED") {
      const r = lockout.recordFailure();
      setSeconds(lockout.secondsLeft());
      setError(r.locked ? null : res.error.message === WRONG_TOKEN_MESSAGE ? WRONG_TOKEN_MESSAGE : res.error.message);
    } else setError(res.error.message);
    setDetails([res.error.code, res.error.detail].filter(Boolean).join("\n") || null);
  };
  return (
    <Dialog title="Sign in to a server" onClose={onClose} initialFocus={firstRef}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={locked} pending={busy} pendingLabel="Checking…" onClick={() => void submit()}>Sign in</Button></>}>
      <form className="dialog-stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <TextField label="Server address" value={address} placeholder="https://notes.example.com" ref={initialAddress ? undefined : firstRef}
          error={addressProblem} onChange={(e) => setAddress(e.target.value)} disabled={locked} />
        <TextField label="Access token" type="password" value={token} ref={initialAddress ? firstRef : undefined} autoComplete="off"
          onChange={(e) => setToken(e.target.value)} disabled={locked} />
        <div role="alert" aria-live="assertive">
          {locked ? <p className="err">{lockoutMessage(seconds)}</p> : error ? <p className="err">{error}</p> : null}
        </div>
        {details && (
          <details className="err-details"><summary>Details</summary><pre>{details}</pre></details>
        )}
      </form>
    </Dialog>
  );
}

export function PairDialog({ onPair, onClose }: { onPair: (server: string) => void; onClose: () => void }): JSX.Element {
  const [link, setLink] = useState("");
  const preview = useMemo(() => parsePairLink(link), [link]);
  const linkRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog title="Pair from a link" onClose={onClose} initialFocus={linkRef}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!preview} onClick={() => preview && onPair(preview.server)}>Continue</Button></>}>
      <div className="dialog-stack">
        <TextField label="Pairing link" value={link} placeholder="takenotes://pair?server=…" ref={linkRef}
          error={link && !preview ? "This isn’t a takenotes pairing link." : undefined} onChange={(e) => setLink(e.target.value)} />
        {preview && (
          <Notice tone="info" title="This will connect to">
            <dl className="pair-preview"><dt>Name</dt><dd>{preview.name}</dd><dt>Server</dt><dd>{preview.server}</dd></dl>
          </Notice>
        )}
      </div>
    </Dialog>
  );
}
