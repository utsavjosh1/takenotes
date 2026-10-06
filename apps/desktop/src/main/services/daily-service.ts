import { appError, type AppError } from "@takenotes/contracts/errors";
import type { DailyNoteCreateResult, DailyNoteInfo } from "@takenotes/contracts/ipc";
import { dailyNoteContent, dailyNotePath, localDateParts } from "@takenotes/core/productivity/daily";
import type { NoteService } from "./note-service.js";
import type { WorkspaceService } from "./workspace-service.js";

export class DailyService {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly notes: NoteService,
  ) {}

  private today(): { date: string; relativePath: string } {
    const parts = localDateParts();
    return { date: parts.isoDate, relativePath: dailyNotePath(parts) };
  }

  async getToday(workspaceId: string): Promise<{ info: DailyNoteInfo } | { error: AppError }> {
    const reg = this.workspaces.get(workspaceId);
    if (!reg) return { error: appError("INVALID_REQUEST", "Unknown workspace.") };
    const today = this.today();
    const read = await this.notes.readFile(workspaceId, today.relativePath);
    if ("result" in read) return { info: { ...today, exists: true } };
    if (read.error.code === "NOT_FOUND") return { info: { ...today, exists: false } };
    return { error: read.error };
  }

  async createToday(workspaceId: string): Promise<{ result: DailyNoteCreateResult } | { error: AppError }> {
    const reg = this.workspaces.get(workspaceId);
    if (!reg) return { error: appError("INVALID_REQUEST", "Unknown workspace.") };
    const today = this.today();
    const content = dailyNoteContent({ date: today.date, workspaceName: reg.displayName });
    const created = await this.notes.createFile(workspaceId, today.relativePath, content);
    if ("revision" in created) {
      return { result: { ...today, exists: true, revision: created.revision, content } };
    }
    if (created.error.code !== "ALREADY_EXISTS") return { error: created.error };
    const existing = await this.notes.readFile(workspaceId, today.relativePath);
    if ("error" in existing) return { error: existing.error };
    return {
      result: {
        ...today,
        exists: true,
        revision: existing.result.revision,
        content: existing.result.content,
      },
    };
  }
}
