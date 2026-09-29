export type DailyNoteDateParts = {
  year: string;
  month: string;
  day: string;
  isoDate: string;
};

export type TemplateVariables = {
  date: string;
  time: string;
  title: string;
  workspace: { name: string };
};

const DAILY_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TEMPLATE_VAR_RE = /\{\{\s*(date|time|title|workspace\.name)\s*\}\}/g;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function localDateParts(date = new Date()): DailyNoteDateParts {
  const year = String(date.getFullYear());
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return { year, month, day, isoDate: `${year}-${month}-${day}` };
}

export function assertDailyDate(input: string): DailyNoteDateParts | null {
  const m = DAILY_DATE_RE.exec(input);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  if (day < 1 || day > days) return null;
  return { year: m[1]!, month: m[2]!, day: m[3]!, isoDate: input };
}

export function dailyNotePath(date: DailyNoteDateParts | string = localDateParts()): string {
  const parts = typeof date === "string" ? assertDailyDate(date) : date;
  if (!parts) throw new Error("Invalid daily note date.");
  return `Daily/${parts.year}/${parts.month}/${parts.isoDate}.md`;
}

export function dailyNoteTitle(date: string): string {
  return date;
}

export function dailyTemplateVariables(args: { date: string; workspaceName: string; now?: Date }): TemplateVariables {
  const now = args.now ?? new Date();
  return {
    date: args.date,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    title: dailyNoteTitle(args.date),
    workspace: { name: args.workspaceName },
  };
}

export function renderTemplate(template: string, vars: TemplateVariables): string {
  return template.replace(TEMPLATE_VAR_RE, (_match, key: string) => {
    if (key === "date") return vars.date;
    if (key === "time") return vars.time;
    if (key === "title") return vars.title;
    if (key === "workspace.name") return vars.workspace.name;
    return "";
  });
}

export function defaultDailyTemplate(): string {
  return [
    "---",
    "type: daily",
    "date: {{date}}",
    "---",
    "# {{title}}",
    "",
    "## Notes",
    "",
    "## Tasks",
    "",
  ].join("\n");
}

export function dailyNoteContent(args: { date: string; workspaceName: string; now?: Date; template?: string }): string {
  const parts = assertDailyDate(args.date);
  if (!parts) throw new Error("Invalid daily note date.");
  const template = args.template ?? defaultDailyTemplate();
  const rendered = renderTemplate(template, dailyTemplateVariables({ date: parts.isoDate, workspaceName: args.workspaceName, now: args.now }));
  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}
