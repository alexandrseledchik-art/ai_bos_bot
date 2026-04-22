import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { buildSupabaseSyncSql } from "./build-sync-sql.js";

const execFileAsync = promisify(execFile);

export class SupabaseCliSyncClient {
  constructor({ cwd }) {
    this.cwd = cwd;
  }

  get enabled() {
    return true;
  }

  async syncState(state) {
    const sql = buildSupabaseSyncSql(state);
    const tempFile = path.join(os.tmpdir(), `supabase-sync-${Date.now()}.sql`);

    await fs.writeFile(tempFile, sql, "utf8");

    try {
      const { stdout, stderr } = await execFileAsync(
        "npx",
        ["supabase", "db", "query", "--linked", "-f", tempFile],
        {
          cwd: this.cwd,
          maxBuffer: 10 * 1024 * 1024
        }
      );

      return {
        transport: "cli",
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } finally {
      await fs.rm(tempFile, { force: true });
    }
  }
}
