import path from "node:path";

import { loadConfig } from "../config.js";
import { SupabaseCliSyncClient } from "../infrastructure/storage/supabase-cli-sync.js";
import { FileMemoryStore } from "../infrastructure/storage/file-store.js";
import { SupabaseSyncClient } from "../infrastructure/storage/supabase-sync.js";

async function main() {
  const config = loadConfig();
  const sourceFilePath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : config.dataFilePath;

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  }

  const store = new FileMemoryStore({
    filePath: sourceFilePath,
    artifactDir: config.artifactDir
  });
  const state = await store.readState();
  const restClient = new SupabaseSyncClient({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey
  });
  const cliClient = new SupabaseCliSyncClient({
    cwd: process.cwd()
  });
  let summary;

  if (config.supabaseSyncTransport !== "cli") {
    try {
      summary = await restClient.syncState(state);
    } catch (error) {
      if (config.supabaseSyncTransport === "rest") {
        throw error;
      }
      console.warn(`REST sync failed, switching to CLI fallback: ${error.message}`);
    }
  }

  if (!summary) {
    summary = await cliClient.syncState(state);
  }

  console.log("Supabase sync complete.");
  console.log(typeof summary === "string" ? summary : JSON.stringify(summary, null, 2));
  console.log(`source: ${sourceFilePath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
