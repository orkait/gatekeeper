import app from "./server";
import type { Bindings } from "./env";
import { handleScheduledBackup } from "./scheduled/backup";

export default {
    fetch: app.fetch,
    scheduled: handleScheduledBackup,
} satisfies ExportedHandler<Bindings>;
