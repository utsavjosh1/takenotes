import { useMemo, type JSX } from "react";
import { Button, Dialog } from "@takenotes/ui/dom";
import { COMMAND_GROUPS, commandGroup, type CommandSearchItem } from "@takenotes/core/commands/palette";

/** Every keyboard shortcut in two columns, grouped like the command palette. */
export function ShortcutsDialog({ commands, onClose }: { commands: CommandSearchItem[]; onClose: () => void }): JSX.Element {
  const groups = useMemo(() => {
    const out = COMMAND_GROUPS.map((g) => ({
      name: g,
      items: commands.filter((c) => c.shortcut && !/^view\.tab[2-9]$/.test(c.id) && commandGroup(c) === g)
        .map((c) => ({ id: c.id, title: c.id === "view.tab1" ? "Go to tab 1–9" : c.title, keys: c.shortcut! })),
    })).filter((g) => g.items.length > 0);
    return out;
  }, [commands]);
  return (
    <Dialog title="Keyboard shortcuts" size="wide" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="shortcuts-grid">
        {groups.map((g) => (
          <section key={g.name} aria-label={g.name}>
            <h3>{g.name}</h3>
            <dl>
              {g.items.map((i) => (<div key={i.id}><dt>{i.title}</dt><dd><kbd>{i.keys}</kbd></dd></div>))}
            </dl>
          </section>
        ))}
      </div>
      <p className="shortcuts-note">You can change any shortcut in Settings.</p>
    </Dialog>
  );
}
