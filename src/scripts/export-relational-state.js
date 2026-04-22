import fs from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "../config.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";
import { projectStateToRelationalRows } from "../infrastructure/storage/state-projector.js";

async function main() {
  const config = loadConfig();
  const sourceFilePath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : config.dataFilePath;
  const store = new FileMemoryStore({
    filePath: sourceFilePath,
    artifactDir: config.artifactDir
  });
  const state = await store.readState();
  const projected = projectStateToRelationalRows(state);
  const outputDir = path.join(process.cwd(), "data", "relational-export");

  await fs.mkdir(outputDir, { recursive: true });

  for (const [table, rows] of Object.entries(projected)) {
    const filePath = path.join(outputDir, `${table}.json`);
    await fs.writeFile(filePath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    console.log(`${table}: ${rows.length} rows -> ${filePath}`);
  }

  console.log(`source: ${sourceFilePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
