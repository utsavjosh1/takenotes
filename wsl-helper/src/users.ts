/** Pure `/etc/passwd` parsing + interactive-candidate filtering.
 * No Node APIs, no side effects — unit-tested directly and reused by the
 * WSL helper's `users.list` op. `/etc/passwd` (the account database) is the
 * source of truth, never `/home/*` (configurable, incomplete). */

export type PasswdUser = {
  name: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
};

export type CandidateUser = PasswdUser & {
  /** True for the user the helper process runs as (the distro's default
   * user when spawned without `-u`, the selected user with `-u`). */
  isCurrent: boolean;
};

/** Parse passwd text into user records. Invalid/unparseable lines are
 * skipped, never fatal. Never throws. */
export function parsePasswd(text: string): PasswdUser[] {
  const out: PasswdUser[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const fields = line.split(":");
    if (fields.length < 7) continue;
    const [name, , uidRaw, gidRaw, , home, shell] = fields as [string, string, string, string, string, string, string];
    if (!name || name.length > 64) continue;
    if (!uidRaw || !gidRaw || !home || !shell) continue;
    if (!/^\d+$/.test(uidRaw) || !/^\d+$/.test(gidRaw)) continue;
    const uid = Number(uidRaw);
    const gid = Number(gidRaw);
    if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid > 0xffffffff || gid > 0xffffffff) continue;
    out.push({ name, uid, gid, home, shell });
  }
  return out;
}

export type CandidateFilter = {
  /** Minimum UID for interactive candidates (default 1000). Overridable per
   * distro — UID policies vary, so this threshold is a parameter, not a
   * constant buried in call sites. */
  minUid?: number;
  /** UID the helper runs as: always included even below the threshold, so
   * the current/default user is never filtered out of its own distro. */
  currentUid?: number;
};

/** Filter to interactive/human candidates: uid >= minUid plus the current
 * user always. System/service accounts (root, daemons, nologin uid < minUid)
 * are dropped. Shells are parsed metadata, not a filter — a human with an
 * unusual shell is still a human. */
export function filterCandidateUsers(users: PasswdUser[], filter: CandidateFilter = {}): CandidateUser[] {
  const minUid = filter.minUid ?? 1000;
  const currentUid = filter.currentUid ?? -1;
  const out: CandidateUser[] = [];
  for (const u of users) {
    // 65534 is the reserved NFS-overflow `nobody` account: numerically above
    // every threshold but never a human. Exclude it unless it paradoxically
    // runs the helper (isCurrent still wins below).
    if (u.uid === 65534 && u.uid !== currentUid) continue;
    if (u.uid < minUid && u.uid !== currentUid) continue;
    out.push({ ...u, isCurrent: u.uid === currentUid });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
