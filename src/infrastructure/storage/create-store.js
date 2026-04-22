import { FileMemoryStore } from "./file-store.js";
import { SupabaseCliSyncClient } from "./supabase-cli-sync.js";
import { ReplicatedMemoryStore, SupabaseSyncClient } from "./supabase-sync.js";

export function createMemoryStore(config) {
  const fileStore = new FileMemoryStore({
    filePath: config.dataFilePath,
    artifactDir: config.artifactDir
  });

  if (!config.enableSupabaseSync) {
    return fileStore;
  }

  const syncClient = new SupabaseSyncClient({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey
  });
  const fallbackSyncClient =
    config.supabaseSyncTransport === "rest"
      ? null
      : new SupabaseCliSyncClient({
          cwd: process.cwd()
        });

  return new ReplicatedMemoryStore({
    fileStore,
    syncClient: config.supabaseSyncTransport === "cli" ? null : syncClient,
    fallbackSyncClient
  });
}
