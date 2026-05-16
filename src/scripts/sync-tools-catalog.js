import { loadConfig } from "../config.js";
import { ToolsCatalogSyncService } from "../application/tools-catalog-sync-service.js";
import { SupabaseSyncClient } from "../infrastructure/storage/supabase-sync.js";

function printToolPreview(tools = []) {
  for (const tool of tools.slice(0, 5)) {
    console.log(`- ${tool.slug}: ${tool.title} [${tool.layer_keys.join(", ")}]`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = loadConfig();
  const syncClient = new SupabaseSyncClient({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey
  });
  const service = new ToolsCatalogSyncService({
    syncClient,
    spreadsheetId: config.toolsCatalogSpreadsheetId,
    gid: config.toolsCatalogGid,
    csvUrl: config.toolsCatalogCsvUrl
  });

  const result = await service.sync({ dryRun });
  console.log(JSON.stringify({
    ok: true,
    dryRun: result.dryRun,
    sourceUrl: result.sourceUrl,
    rawRows: result.rawRows,
    mappedTools: result.tools.length,
    skippedRows: result.skippedRows,
    syncedRows: result.syncedRows
  }, null, 2));
  printToolPreview(result.tools);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
