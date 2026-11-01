import { describe, expect, it } from "vitest";
import { parseEnex, planEnexImport } from "@takenotes/core/import/enex";

const OPTS = {
  attachmentLocation: "subfolder" as const,
  attachmentFolder: "attachments",
  existingLower: new Set<string>(),
};

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<en-export>
<note><title>Shopping</title><content><![CDATA[<?xml version="1.0"?><en-note><div>Buy <b>milk</b></div><en-media type="image/png"/></en-note>]]></content><tag>errands</tag><created>20240101T000000Z</created><resource><data encoding="base64">aGk=</data><mime>image/png</mime><resource-attributes><file-name>list.png</file-name></resource-attributes></resource></note>
<note><title>Ideas</title><content><![CDATA[<?xml version="1.0"?><en-note><p>hello world</p></en-note>]]></content></note>
</en-export>`;

describe("enex (Elephant) import", () => {
  it("parses notes, tags, dates, and resources without throwing", () => {
    const parsed = parseEnex(SAMPLE);
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.notes[0]).toMatchObject({ title: "Shopping" });
    expect(parsed.notes[0]!.tags).toEqual(["errands"]);
    expect(parsed.notes[0]!.resources).toHaveLength(1);
    expect(parsed.notes[0]!.resources[0]).toMatchObject({ filename: "list.png" });
  });

  it("plans markdown + attachments with collision-proof names and report", () => {
    const { plan, attachmentBytes } = planEnexImport(SAMPLE, OPTS);
    expect(plan.notes).toHaveLength(2);
    expect(plan.notes.map((n) => n.targetPath).sort()).toEqual(["Shopping.md", "Ideas.md"].map((n) => `evernote/${n}`).sort());
    const shopping = plan.notes.find((n) => n.targetPath.endsWith("Shopping.md"))!;
    expect(shopping.content).toContain("milk");
    expect(shopping.content).toContain("tags:");
    expect(plan.attachments.length).toBeGreaterThanOrEqual(1);
    expect(attachmentBytes.size).toBeGreaterThanOrEqual(1);
    expect(plan.skipped).toEqual([]);
  });

  it("degrades malformed input to warnings, never throws", () => {
    expect(planEnexImport("not xml at all", OPTS).plan.notes).toEqual([]);
    expect(planEnexImport("", OPTS).plan.warnings.join()).toMatch(/No <note>/);
    expect(parseEnex("<note><title>Unclosed").notes).toEqual([]);
  });

  it("collision-proofs against existing workspace names", () => {
    const { plan } = planEnexImport(SAMPLE, {
      ...OPTS,
      existingLower: new Set(["evernote/shopping.md"]),
    });
    expect(plan.notes.map((n) => n.targetPath.toLowerCase())).toContain("evernote/shopping 1.md");
  });
});
