import fs from "node:fs/promises";
import path from "node:path";

import { emptyState } from "../../domain/entities.js";

export class FileMemoryStore {
  constructor({ filePath, artifactDir }) {
    this.filePath = filePath;
    this.artifactDir = artifactDir;
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.mkdir(this.artifactDir, { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      await this.writeState(emptyState());
    }
  }

  async readState() {
    await this.init();
    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...emptyState(),
      ...parsed
    };
  }

  async writeState(state) {
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, this.filePath);
  }

  async update(mutator) {
    const state = await this.readState();
    const result = await mutator(state);
    await this.writeState(state);
    return result;
  }

  async saveArtifactDocument({ artifactId, title, body }) {
    await this.init();
    const safeTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const filePath = path.join(this.artifactDir, `${artifactId}-${safeTitle || "artifact"}.md`);
    await fs.writeFile(filePath, body, "utf8");
    return filePath;
  }
}
