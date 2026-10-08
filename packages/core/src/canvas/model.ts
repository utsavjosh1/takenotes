/** Step 7 Canvas model (Phase 4c): JSON Canvas `.canvas` docs, pure + total.
 *
 * Open JSON Canvas format (`nodes[]` + `edges[]`): text cards (Markdown),
 * file cards (vault notes / images — images are `file` nodes with an
 * image extension, there is no separate image type), link cards (URLs),
 * groups (spatial labels), and directed edges with sides/ends/labels.
 * No filesystem, no React: identical JSON parses to identical docs.
 *
 * MVP scope (roadmap Step 7, minimal): text + file + group nodes, link
 * nodes (read, create, edit URL), directed edges (add/remove/reconnect,
 * navigate = follow from/to id, labels), node/edge colors, groups
 * (create/rename/group-selected bbox). Deferred: web-card previews,
 * audio/PDF/unrecognized-file cards, Alt-drag duplicate, aspect-lock,
 * background images, jump-to-group, readonly mode, export-image,
 * Canvas-in-Canvas full text, `![[x.canvas]]` embed rendering
 * (shapes-only, renderer concern).
 *
 * Parsing is tolerant: bad nodes/edges drop with per-item errors and the
 * file is never touched — the caller decides whether to save the cleaned
 * doc back. Ops are total: bad ids/values return `{ ok: false }` with an
 * `INVALID_REQUEST`-style message, never throw.
 */

export const CANVAS_EXT = ".canvas";

/** True for `.canvas` paths (case-insensitive). Canvas files ride the
doc-tab pipeline (dirty/save/conflict/recovery) but never the index. */
export function isCanvasPath(rel: string): boolean {
  return /\.canvas$/i.test(rel.trim());
}

/** Preset palette (JSON Canvas `1`–`6` = red orange yellow green cyan
 * purple) plus `#rgb`/`#rrggbb` custom. Anything else is rejected. */
export const CANVAS_PRESET_COLORS = ["1", "2", "3", "4", "5", "6"] as const;
export type CanvasPresetColor = (typeof CANVAS_PRESET_COLORS)[number];

export const CANVAS_SIDES = ["top", "right", "bottom", "left"] as const;
export type CanvasSide = (typeof CANVAS_SIDES)[number];
export const CANVAS_ENDS = ["none", "arrow"] as const;
export type CanvasEnd = (typeof CANVAS_ENDS)[number];

export const MAX_CANVAS_NODES = 500;
export const MAX_CANVAS_EDGES = 1000;
export const MAX_CANVAS_TEXT_LEN = 50000;
const MAX_ID_LEN = 64;
const MAX_LABEL_LEN = 500;
const COORD_BOUND = 1000000;

export type TextCanvasNode = {
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color?: string;
};

export type FileCanvasNode = {
  id: string;
  type: "file";
  x: number;
  y: number;
  width: number;
  height: number;
  file: string;
  subpath?: string;
  color?: string;
};

export type LinkCanvasNode = {
  id: string;
  type: "link";
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
  color?: string;
};

export type GroupCanvasNode = {
  id: string;
  type: "group";
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "contain" | "tiled";
};

export type CanvasNode = TextCanvasNode | FileCanvasNode | LinkCanvasNode | GroupCanvasNode;

export type CanvasEdge = {
  id: string;
  fromNode: string;
  fromSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toNode: string;
  toSide?: CanvasSide;
  toEnd?: CanvasEnd;
  color?: string;
  label?: string;
};

export type CanvasDoc = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export type CanvasParseResult = { ok: true; doc: CanvasDoc; errors: string[] } | { ok: false; error: string };
export type CanvasOpResult = { ok: true; doc: CanvasDoc; id?: string } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  // eslint-disable-next-line no-control-regex
  if (!t || t.length > MAX_ID_LEN || /[\u0000-\u001f]/.test(t)) return null;
  return t;
}

function cleanNum(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (Math.abs(raw) > COORD_BOUND) return null;
  return raw;
}

function cleanSize(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 1 || raw > 10000) return null;
  return raw;
}

export function isValidCanvasColor(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  if ((CANVAS_PRESET_COLORS as readonly string[]).includes(raw)) return true;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw);
}

/** Vault-relative file refs: `/`-separated, no absolute/NUL/`..` escape. */
function cleanFileRef(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\\/g, "/");
  if (!t || t.length > 512 || t.includes("\0")) return null;
  if (t.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(t)) return null;
  return t;
}

function cleanSide(raw: unknown): CanvasSide | null {
  return raw === "top" || raw === "right" || raw === "bottom" || raw === "left" ? raw : null;
}

function cleanEnd(raw: unknown): CanvasEnd | null {
  return raw === "none" || raw === "arrow" ? raw : null;
}

function cleanNode(raw: unknown, seen: Set<string>): { node: CanvasNode } | { error: string } {
  if (!isRecord(raw)) return { error: "node must be an object" };
  const id = cleanId(raw["id"]);
  if (!id) return { error: "node id must be a non-empty string" };
  if (seen.has(id)) return { error: `duplicate node id "${id}"` };
  const x = cleanNum(raw["x"]);
  const y = cleanNum(raw["y"]);
  const width = cleanSize(raw["width"]);
  const height = cleanSize(raw["height"]);
  if (x === null || y === null || width === null || height === null) {
    return { error: `node "${id}" has a bad frame (x/y finite, width/height 1..10000)` };
  }
  const colorRaw = raw["color"];
  let color: string | undefined;
  if (colorRaw !== undefined) {
    if (!isValidCanvasColor(colorRaw)) return { error: `node "${id}" has a bad color` };
    color = colorRaw as string;
  }
  const type = raw["type"];
  if (type === "text") {
    if (typeof raw["text"] !== "string") return { error: `text node "${id}" needs a text string` };
    if (raw["text"].length > MAX_CANVAS_TEXT_LEN) return { error: `text node "${id}" exceeds ${MAX_CANVAS_TEXT_LEN} chars` };
    seen.add(id);
    return { node: { id, type, x, y, width, height, text: raw["text"], ...(color === undefined ? {} : { color }) } };
  }
  if (type === "file") {
    const file = cleanFileRef(raw["file"]);
    if (!file) return { error: `file node "${id}" needs a workspace-relative file path` };
    const sub = raw["subpath"];
    if (sub !== undefined && (typeof sub !== "string" || sub.length > 512)) {
      return { error: `file node "${id}" has a bad subpath` };
    }
    seen.add(id);
    return {
      node: {
        id, type, x, y, width, height, file,
        ...(sub === undefined ? {} : { subpath: sub }),
        ...(color === undefined ? {} : { color }),
      },
    };
  }
  if (type === "link") {
    if (typeof raw["url"] !== "string" || !raw["url"].trim() || raw["url"].trim().length > 2048) {
      return { error: `link node "${id}" needs a non-empty url` };
    }
    seen.add(id);
    return { node: { id, type, x, y, width, height, url: raw["url"].trim(), ...(color === undefined ? {} : { color }) } };
  }
  if (type === "group") {
    const label = raw["label"];
    if (label !== undefined && (typeof label !== "string" || label.length > MAX_LABEL_LEN)) {
      return { error: `group "${id}" has a bad label` };
    }
    const bg = raw["background"];
    if (bg !== undefined && (typeof bg !== "string" || bg.length > 512)) {
      return { error: `group "${id}" has a bad background` };
    }
    const style = raw["backgroundStyle"];
    if (style !== undefined && style !== "cover" && style !== "contain" && style !== "tiled") {
      return { error: `group "${id}" has a bad backgroundStyle` };
    }
    if (color !== undefined) return { error: `group "${id}" takes no color` };
    seen.add(id);
    return {
      node: {
        id, type, x, y, width, height,
        ...(label === undefined ? {} : { label }),
        ...(bg === undefined ? {} : { background: bg }),
        ...(style === undefined ? {} : { backgroundStyle: style }),
      },
    };
  }
  return { error: `node "${id}" has unknown type` };
}

function cleanEdge(
  raw: unknown,
  seen: Set<string>,
  nodeIds: Set<string>,
): { edge: CanvasEdge } | { error: string } {
  if (!isRecord(raw)) return { error: "edge must be an object" };
  const id = cleanId(raw["id"]);
  if (!id) return { error: "edge id must be a non-empty string" };
  if (seen.has(id)) return { error: `duplicate edge id "${id}"` };
  const from = typeof raw["fromNode"] === "string" ? raw["fromNode"] : null;
  const to = typeof raw["toNode"] === "string" ? raw["toNode"] : null;
  if (!from || !to) return { error: `edge "${id}" needs fromNode + toNode` };
  if (!nodeIds.has(from) || !nodeIds.has(to)) return { error: `edge "${id}" dangles (unknown endpoint)` };
  for (const [key, clean] of [["fromSide", cleanSide], ["toSide", cleanSide], ["fromEnd", cleanEnd], ["toEnd", cleanEnd]] as const) {
    const v = raw[key];
    if (v !== undefined && (clean as (u: unknown) => unknown)(v) === null) return { error: `edge "${id}" has a bad ${key}` };
  }
  const colorRaw = raw["color"];
  if (colorRaw !== undefined && !isValidCanvasColor(colorRaw)) return { error: `edge "${id}" has a bad color` };
  const label = raw["label"];
  if (label !== undefined && (typeof label !== "string" || label.length > MAX_LABEL_LEN)) {
    return { error: `edge "${id}" has a bad label` };
  }
  seen.add(id);
  const edge: CanvasEdge = { id, fromNode: from, toNode: to };
  if (raw["fromSide"] !== undefined) edge.fromSide = raw["fromSide"] as CanvasSide;
  if (raw["fromEnd"] !== undefined) edge.fromEnd = raw["fromEnd"] as CanvasEnd;
  if (raw["toSide"] !== undefined) edge.toSide = raw["toSide"] as CanvasSide;
  if (raw["toEnd"] !== undefined) edge.toEnd = raw["toEnd"] as CanvasEnd;
  if (colorRaw !== undefined) edge.color = colorRaw as string;
  if (label !== undefined) edge.label = label;
  return { edge };
}

/** Parse unknown JSON into a Canvas doc. Tolerant: bad items drop with
 * errors; structurally-broken input (`nodes`/`edges` not arrays when
 * present, root not an object) refuses the whole doc. Never throws. */
export function parseCanvasDoc(input: unknown): CanvasParseResult {
  let root: unknown = input;
  if (typeof input === "string") {
    try {
      root = JSON.parse(input);
    } catch {
      return { ok: false, error: "INVALID_REQUEST: canvas file is not valid JSON" };
    }
  }
  if (!isRecord(root)) return { ok: false, error: "INVALID_REQUEST: canvas root must be an object" };
  const rawNodes = root["nodes"] === undefined ? [] : root["nodes"];
  const rawEdges = root["edges"] === undefined ? [] : root["edges"];
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) {
    return { ok: false, error: "INVALID_REQUEST: canvas nodes/edges must be arrays" };
  }
  const errors: string[] = [];
  const nodes: CanvasNode[] = [];
  const seenNodes = new Set<string>();
  for (const raw of rawNodes.slice(0, MAX_CANVAS_NODES + 1)) {
    if (nodes.length >= MAX_CANVAS_NODES) {
      errors.push(`node cap ${MAX_CANVAS_NODES} hit — extra nodes dropped`);
      break;
    }
    const r = cleanNode(raw, seenNodes);
    if ("node" in r) nodes.push(r.node);
    else errors.push(r.error);
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: CanvasEdge[] = [];
  const seenEdges = new Set<string>();
  for (const raw of rawEdges.slice(0, MAX_CANVAS_EDGES + 1)) {
    if (edges.length >= MAX_CANVAS_EDGES) {
      errors.push(`edge cap ${MAX_CANVAS_EDGES} hit — extra edges dropped`);
      break;
    }
    const r = cleanEdge(raw, seenEdges, nodeIds);
    if ("edge" in r) edges.push(r.edge);
    else errors.push(r.error);
  }
  return { ok: true, doc: { nodes, edges }, errors };
}

/** Deterministic serialization (array order preserved, 2-space JSON). */
export function serializeCanvasDoc(doc: CanvasDoc): string {
  return JSON.stringify({ nodes: doc.nodes, edges: doc.edges }, null, 2);
}

export function emptyCanvas(): CanvasDoc {
  return { nodes: [], edges: [] };
}

function nextId(prefix: string, taken: Set<string>): string {
  let i = taken.size + 1;
  while (taken.has(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}

function cloneDoc(doc: CanvasDoc): CanvasDoc {
  return { nodes: doc.nodes.map((n) => ({ ...n })), edges: doc.edges.map((e) => ({ ...e })) };
}

function nodeIds(doc: CanvasDoc): Set<string> {
  return new Set(doc.nodes.map((n) => n.id));
}

export type NewNodeAttrs = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  id?: string;
};

function checkFrame(doc: CanvasDoc, attrs: NewNodeAttrs): { error: string } | { id: string; x: number; y: number; width: number; height: number } {
  const x = cleanNum(attrs.x);
  const y = cleanNum(attrs.y);
  const width = attrs.width === undefined ? 250 : cleanSize(attrs.width);
  const height = attrs.height === undefined ? 100 : cleanSize(attrs.height);
  if (x === null || y === null || width === null || height === null) {
    return { error: "INVALID_REQUEST: bad frame (x/y finite, width/height 1..10000)" };
  }
  if (doc.nodes.length >= MAX_CANVAS_NODES) return { error: `INVALID_REQUEST: node cap ${MAX_CANVAS_NODES} hit` };
  const taken = nodeIds(doc);
  const id = attrs.id === undefined ? nextId("node", taken) : cleanId(attrs.id);
  if (!id) return { error: "INVALID_REQUEST: bad node id" };
  if (taken.has(id)) return { error: `INVALID_REQUEST: duplicate node id "${id}"` };
  return { id, x, y, width, height };
}

function findNode(doc: CanvasDoc, id: string): CanvasNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

/** Add a text card. */
export function addTextNode(doc: CanvasDoc, attrs: NewNodeAttrs & { text?: string; color?: string }): CanvasOpResult {
  const frame = checkFrame(doc, attrs);
  if ("error" in frame) return { ok: false, error: frame.error };
  const text = attrs.text ?? "";
  if (typeof text !== "string" || text.length > MAX_CANVAS_TEXT_LEN) {
    return { ok: false, error: `INVALID_REQUEST: text exceeds ${MAX_CANVAS_TEXT_LEN} chars` };
  }
  if (attrs.color !== undefined && !isValidCanvasColor(attrs.color)) {
    return { ok: false, error: "INVALID_REQUEST: bad color" };
  }
  const next = cloneDoc(doc);
  next.nodes.push({
    id: frame.id, type: "text", x: frame.x, y: frame.y,
    width: frame.width, height: frame.height, text,
    ...(attrs.color === undefined ? {} : { color: attrs.color }),
  });
  return { ok: true, doc: next, id: frame.id };
}

/** Add a file card (vault note or image — images are `file` nodes whose
 * path has an image extension; there is no separate image type). */
export function addFileNode(
  doc: CanvasDoc,
  attrs: NewNodeAttrs & { file: string; subpath?: string; color?: string },
): CanvasOpResult {
  const frame = checkFrame(doc, attrs);
  if ("error" in frame) return { ok: false, error: frame.error };
  const file = cleanFileRef(attrs.file);
  if (!file) return { ok: false, error: "INVALID_REQUEST: file must be a workspace-relative path" };
  if (attrs.subpath !== undefined && (typeof attrs.subpath !== "string" || attrs.subpath.length > 512)) {
    return { ok: false, error: "INVALID_REQUEST: bad subpath" };
  }
  if (attrs.color !== undefined && !isValidCanvasColor(attrs.color)) {
    return { ok: false, error: "INVALID_REQUEST: bad color" };
  }
  const next = cloneDoc(doc);
  next.nodes.push({
    id: frame.id, type: "file", x: frame.x, y: frame.y,
    width: attrs.width === undefined ? 400 : frame.width,
    height: attrs.height === undefined ? 300 : frame.height,
    file,
    ...(attrs.subpath === undefined ? {} : { subpath: attrs.subpath }),
    ...(attrs.color === undefined ? {} : { color: attrs.color }),
  });
  return { ok: true, doc: next, id: frame.id };
}

/** Add a link card. */
export function addLinkNode(
  doc: CanvasDoc,
  attrs: NewNodeAttrs & { url: string; color?: string },
): CanvasOpResult {
  const frame = checkFrame(doc, attrs);
  if ("error" in frame) return { ok: false, error: frame.error };
  if (typeof attrs.url !== "string" || !attrs.url.trim() || attrs.url.trim().length > 2048) {
    return { ok: false, error: "INVALID_REQUEST: url must be non-empty" };
  }
  if (attrs.color !== undefined && !isValidCanvasColor(attrs.color)) {
    return { ok: false, error: "INVALID_REQUEST: bad color" };
  }
  const next = cloneDoc(doc);
  next.nodes.push({
    id: frame.id, type: "link", x: frame.x, y: frame.y,
    width: frame.width, height: frame.height, url: attrs.url.trim(),
    ...(attrs.color === undefined ? {} : { color: attrs.color }),
  });
  return { ok: true, doc: next, id: frame.id };
}

/** Add a group (spatial label box). */
export function addGroupNode(
  doc: CanvasDoc,
  attrs: NewNodeAttrs & { label?: string },
): CanvasOpResult {
  const frame = checkFrame(doc, attrs);
  if ("error" in frame) return { ok: false, error: frame.error };
  if (attrs.label !== undefined && (typeof attrs.label !== "string" || attrs.label.length > MAX_LABEL_LEN)) {
    return { ok: false, error: "INVALID_REQUEST: bad group label" };
  }
  const next = cloneDoc(doc);
  next.nodes.push({
    id: frame.id, type: "group", x: frame.x, y: frame.y,
    width: frame.width, height: frame.height,
    ...(attrs.label === undefined ? {} : { label: attrs.label }),
  });
  return { ok: true, doc: next, id: frame.id };
}

/** Move a node. */
export function moveNode(doc: CanvasDoc, id: string, x: number, y: number): CanvasOpResult {
  const node = findNode(doc, id);
  if (!node) return { ok: false, error: `INVALID_REQUEST: unknown node "${id}"` };
  const cx = cleanNum(x);
  const cy = cleanNum(y);
  if (cx === null || cy === null) return { ok: false, error: "INVALID_REQUEST: bad coordinates" };
  const next = cloneDoc(doc);
  const target = next.nodes.find((n) => n.id === id)!;
  target.x = cx;
  target.y = cy;
  return { ok: true, doc: next };
}

/** Resize a node. */
export function resizeNode(doc: CanvasDoc, id: string, width: number, height: number): CanvasOpResult {
  const node = findNode(doc, id);
  if (!node) return { ok: false, error: `INVALID_REQUEST: unknown node "${id}"` };
  const w = cleanSize(width);
  const h = cleanSize(height);
  if (w === null || h === null) return { ok: false, error: "INVALID_REQUEST: bad size (1..10000)" };
  const next = cloneDoc(doc);
  const target = next.nodes.find((n) => n.id === id)!;
  target.width = w;
  target.height = h;
  return { ok: true, doc: next };
}

/** Edit a text card's Markdown. Text nodes only. */
export function setNodeText(doc: CanvasDoc, id: string, text: string): CanvasOpResult {
  const node = findNode(doc, id);
  if (!node) return { ok: false, error: `INVALID_REQUEST: unknown node "${id}"` };
  if (node.type !== "text") return { ok: false, error: `INVALID_REQUEST: node "${id}" is not a text card` };
  if (typeof text !== "string" || text.length > MAX_CANVAS_TEXT_LEN) {
    return { ok: false, error: `INVALID_REQUEST: text exceeds ${MAX_CANVAS_TEXT_LEN} chars` };
  }
  const next = cloneDoc(doc);
  (next.nodes.find((n) => n.id === id) as TextCanvasNode).text = text;
  return { ok: true, doc: next };
}

/** Repoint a file card. File nodes only. */
export function setNodeFile(doc: CanvasDoc, id: string, file: string, subpath?: string): CanvasOpResult {
  const node = findNode(doc, id);
  if (!node) return { ok: false, error: `INVALID_REQUEST: unknown node "${id}"` };
  if (node.type !== "file") return { ok: false, error: `INVALID_REQUEST: node "${id}" is not a file card` };
  const clean = cleanFileRef(file);
  if (!clean) return { ok: false, error: "INVALID_REQUEST: file must be a workspace-relative path" };
  if (subpath !== undefined && (typeof subpath !== "string" || subpath.length > 512)) {
    return { ok: false, error: "INVALID_REQUEST: bad subpath" };
  }
  const next = cloneDoc(doc);
  const target = next.nodes.find((n) => n.id === id) as FileCanvasNode;
  target.file = clean;
  if (subpath === undefined) delete target.subpath;
  else target.subpath = subpath;
  return { ok: true, doc: next };
}

/** Rename a group. Groups only. */
export function renameGroup(doc: CanvasDoc, id: string, label: string): CanvasOpResult {
  const node = findNode(doc, id);
  if (!node) return { ok: false, error: `INVALID_REQUEST: unknown node "${id}"` };
  if (node.type !== "group") return { ok: false, error: `INVALID_REQUEST: node "${id}" is not a group` };
  if (typeof label !== "string" || label.length > MAX_LABEL_LEN) {
    return { ok: false, error: "INVALID_REQUEST: bad group label" };
  }
  const next = cloneDoc(doc);
  const target = next.nodes.find((n) => n.id === id) as GroupCanvasNode;
  if (label) target.label = label;
  else delete target.label;
  return { ok: true, doc: next };
}

/** Set a text/file/link node's color (groups take no color). */
export function setNodeColor(doc: CanvasDoc, id: string, color: string | undefined): CanvasOpResult {
  const node = findNode(doc, id);
  if (!node) return { ok: false, error: `INVALID_REQUEST: unknown node "${id}"` };
  if (node.type === "group") return { ok: false, error: `INVALID_REQUEST: group "${id}" takes no color` };
  if (color !== undefined && !isValidCanvasColor(color)) {
    return { ok: false, error: "INVALID_REQUEST: bad color" };
  }
  const next = cloneDoc(doc);
  const target = next.nodes.find((n) => n.id === id) as TextCanvasNode | FileCanvasNode | LinkCanvasNode;
  if (color === undefined) delete target.color;
  else target.color = color;
  return { ok: true, doc: next };
}

/** Delete a node; incident edges drop with it. Group contents are
 * spatial, not owned — deleting a group never deletes other nodes. */
export function deleteNode(doc: CanvasDoc, id: string): CanvasOpResult {
  if (!findNode(doc, id)) return { ok: false, error: `INVALID_REQUEST: unknown node "${id}"` };
  return {
    ok: true,
    doc: {
      nodes: doc.nodes.filter((n) => n.id !== id).map((n) => ({ ...n })),
      edges: doc.edges.filter((e) => e.fromNode !== id && e.toNode !== id).map((e) => ({ ...e })),
    },
  };
}

export type NewEdgeAttrs = {
  fromNode: string;
  toNode: string;
  fromSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toSide?: CanvasSide;
  toEnd?: CanvasEnd;
  color?: string;
  label?: string;
  id?: string;
};

/** Add a directed edge. Endpoints must exist; sides/ends default to
 * right/none → left/arrow. */
export function addEdge(doc: CanvasDoc, attrs: NewEdgeAttrs): CanvasOpResult {
  const ids = nodeIds(doc);
  if (!ids.has(attrs.fromNode) || !ids.has(attrs.toNode)) {
    return { ok: false, error: "INVALID_REQUEST: edge endpoint unknown" };
  }
  if (doc.edges.length >= MAX_CANVAS_EDGES) return { ok: false, error: `INVALID_REQUEST: edge cap ${MAX_CANVAS_EDGES} hit` };
  for (const [key, clean] of [["fromSide", cleanSide], ["toSide", cleanSide], ["fromEnd", cleanEnd], ["toEnd", cleanEnd]] as const) {
    const v = attrs[key];
    if (v !== undefined && (clean as (u: unknown) => unknown)(v) === null) {
      return { ok: false, error: `INVALID_REQUEST: bad ${key}` };
    }
  }
  if (attrs.color !== undefined && !isValidCanvasColor(attrs.color)) {
    return { ok: false, error: "INVALID_REQUEST: bad color" };
  }
  if (attrs.label !== undefined && (typeof attrs.label !== "string" || attrs.label.length > MAX_LABEL_LEN)) {
    return { ok: false, error: "INVALID_REQUEST: bad edge label" };
  }
  const taken = new Set(doc.edges.map((e) => e.id));
  const id = attrs.id === undefined ? nextId("edge", taken) : cleanId(attrs.id);
  if (!id) return { ok: false, error: "INVALID_REQUEST: bad edge id" };
  if (taken.has(id)) return { ok: false, error: `INVALID_REQUEST: duplicate edge id "${id}"` };
  const next = cloneDoc(doc);
  next.edges.push({
    id,
    fromNode: attrs.fromNode,
    fromSide: attrs.fromSide ?? "right",
    fromEnd: attrs.fromEnd ?? "none",
    toNode: attrs.toNode,
    toSide: attrs.toSide ?? "left",
    toEnd: attrs.toEnd ?? "arrow",
    ...(attrs.color === undefined ? {} : { color: attrs.color }),
    ...(attrs.label === undefined ? {} : { label: attrs.label }),
  });
  return { ok: true, doc: next, id };
}

/** Remove an edge. */
export function removeEdge(doc: CanvasDoc, id: string): CanvasOpResult {
  if (!doc.edges.some((e) => e.id === id)) return { ok: false, error: `INVALID_REQUEST: unknown edge "${id}"` };
  return { ok: true, doc: { nodes: doc.nodes.map((n) => ({ ...n })), edges: doc.edges.filter((e) => e.id !== id).map((e) => ({ ...e })) } };
}

export type ReconnectAttrs = {
  fromNode?: string;
  toNode?: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toEnd?: CanvasEnd;
};

/** Reconnect an edge: move either endpoint and/or change sides/ends. */
export function reconnectEdge(doc: CanvasDoc, id: string, attrs: ReconnectAttrs): CanvasOpResult {
  const edge = doc.edges.find((e) => e.id === id);
  if (!edge) return { ok: false, error: `INVALID_REQUEST: unknown edge "${id}"` };
  const ids = nodeIds(doc);
  const fromNode = attrs.fromNode ?? edge.fromNode;
  const toNode = attrs.toNode ?? edge.toNode;
  if (!ids.has(fromNode) || !ids.has(toNode)) {
    return { ok: false, error: "INVALID_REQUEST: edge endpoint unknown" };
  }
  for (const [key, clean] of [["fromSide", cleanSide], ["toSide", cleanSide], ["fromEnd", cleanEnd], ["toEnd", cleanEnd]] as const) {
    const v = attrs[key];
    if (v !== undefined && (clean as (u: unknown) => unknown)(v) === null) {
      return { ok: false, error: `INVALID_REQUEST: bad ${key}` };
    }
  }
  const next = cloneDoc(doc);
  const target = next.edges.find((e) => e.id === id)!;
  target.fromNode = fromNode;
  target.toNode = toNode;
  if (attrs.fromSide !== undefined) target.fromSide = attrs.fromSide;
  if (attrs.toSide !== undefined) target.toSide = attrs.toSide;
  if (attrs.fromEnd !== undefined) target.fromEnd = attrs.fromEnd;
  if (attrs.toEnd !== undefined) target.toEnd = attrs.toEnd;
  return { ok: true, doc: next };
}

/** Set an edge's label (`""` clears). */
export function setEdgeLabel(doc: CanvasDoc, id: string, label: string): CanvasOpResult {
  const edge = doc.edges.find((e) => e.id === id);
  if (!edge) return { ok: false, error: `INVALID_REQUEST: unknown edge "${id}"` };
  if (typeof label !== "string" || label.length > MAX_LABEL_LEN) {
    return { ok: false, error: "INVALID_REQUEST: bad edge label" };
  }
  const next = cloneDoc(doc);
  const target = next.edges.find((e) => e.id === id)!;
  if (label) target.label = label;
  else delete target.label;
  return { ok: true, doc: next };
}

/** Set an edge's color (`undefined` clears). */
export function setEdgeColor(doc: CanvasDoc, id: string, color: string | undefined): CanvasOpResult {
  const edge = doc.edges.find((e) => e.id === id);
  if (!edge) return { ok: false, error: `INVALID_REQUEST: unknown edge "${id}"` };
  if (color !== undefined && !isValidCanvasColor(color)) {
    return { ok: false, error: "INVALID_REQUEST: bad color" };
  }
  const next = cloneDoc(doc);
  const target = next.edges.find((e) => e.id === id)!;
  if (color === undefined) delete target.color;
  else target.color = color;
  return { ok: true, doc: next };
}

/** Create a group sized to the bounding box of `memberIds` (+40 padding).
 * Membership stays spatial — the group owns nothing. */
export function groupSelected(doc: CanvasDoc, memberIds: string[], label?: string): CanvasOpResult {
  if (memberIds.length === 0) return { ok: false, error: "INVALID_REQUEST: group needs at least one node" };
  const members = memberIds.map((id) => findNode(doc, id));
  if (members.some((m) => !m)) return { ok: false, error: "INVALID_REQUEST: group member unknown" };
  if (typeof label === "string" && label.length > MAX_LABEL_LEN) {
    return { ok: false, error: "INVALID_REQUEST: bad group label" };
  }
  const xs = members.map((m) => m!.x);
  const ys = members.map((m) => m!.y);
  const rs = members.map((m) => m!.x + m!.width);
  const bs = members.map((m) => m!.y + m!.height);
  const pad = 40;
  return addGroupNode(doc, {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...rs) - Math.min(...xs) + pad * 2,
    height: Math.max(...bs) - Math.min(...ys) + pad * 2,
    ...(label === undefined ? {} : { label }),
  });
}

/** Edge endpoints for navigation (source/target jump). */
export function edgeEndpoints(doc: CanvasDoc, id: string): { fromNode: string; toNode: string } | null {
  const edge = doc.edges.find((e) => e.id === id);
  return edge ? { fromNode: edge.fromNode, toNode: edge.toNode } : null;
}

/** True when a file-card path is an image (inline preview eligible). */
export function isImageFileRef(file: string): boolean {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.split(/[?#]/)[0] ?? "");
}
