import type { Bindings } from '../env';
import { createAuthDB } from '../utils/db';

/**
 * Tables to backup.
 */
const BACKUP_TABLES = [
    'users',
    'tenants',
    'tenant_users',
    'subscriptions',
    'tenant_subscription_items',
    'api_keys',
    'sessions',
    'feature_flags',
    'admin_overrides',
    'webhook_endpoints',
] as const;

/**
 * Backup result for a single table.
 */
export interface TableBackupResult {
    table: string;
    rowCount: number;
    path: string;
    success: boolean;
    error?: string;
}

/**
 * Full backup result.
 */
export interface BackupResult {
    timestamp: string;
    tables: TableBackupResult[];
    totalRows: number;
    duration: number;
}

/**
 * Row type with index signature for dynamic tables.
 */
interface BackupRow {
    [key: string]: unknown;
}

/**
 * Perform a full database backup to R2.
 *
 * Exports each table as a JSON file to:
 *   backups/{table}/{timestamp}.json
 *
 * @param env - Worker environment bindings
 * @returns Backup result with status for each table
 */
export async function performBackup(env: Bindings): Promise<BackupResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const results: TableBackupResult[] = [];
    let totalRows = 0;

    if (!env.BACKUP_BUCKET) {
        console.error('Backup bucket not configured');
        return {
            timestamp,
            tables: [],
            totalRows: 0,
            duration: Date.now() - startTime,
        };
    }

    const db = createAuthDB(env.DB);

    for (const table of BACKUP_TABLES) {
        try {
            const result = await backupTable(env.BACKUP_BUCKET, db, table, timestamp);
            results.push(result);
            if (result.success) {
                totalRows += result.rowCount;
            }
        } catch (error) {
            console.error(`Failed to backup table ${table}:`, error);
            results.push({
                table,
                rowCount: 0,
                path: '',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    const duration = Date.now() - startTime;

    console.log(`Backup completed in ${duration}ms. Total rows: ${totalRows}`);

    return {
        timestamp,
        tables: results,
        totalRows,
        duration,
    };
}

/**
 * Backup a single table to R2.
 */
async function backupTable(
    bucket: R2Bucket,
    db: ReturnType<typeof createAuthDB>,
    table: string,
    timestamp: string
): Promise<TableBackupResult> {
    // SECURITY FIX: Validate table name against whitelist to prevent SQL injection
    // The table parameter is interpolated into SQL, so we must ensure it's a known safe value
    const allowedTables: readonly string[] = BACKUP_TABLES;
    if (!allowedTables.includes(table)) {
        console.error(`Invalid table name attempted: ${table}`);
        return {
            table,
            rowCount: 0,
            path: '',
            success: false,
            error: `Invalid table name: ${table}`,
        };
    }

    const path = `backups/${table}/${timestamp}.json`;

    // Fetch all rows from the table (table name is now validated)
    const result = await db.all<BackupRow>(`SELECT * FROM ${table}`, []);
    const rows = result.results;

    // Create backup payload
    const backup = {
        table,
        exportedAt: new Date().toISOString(),
        rowCount: rows.length,
        data: rows,
    };

    // Upload to R2
    await bucket.put(path, JSON.stringify(backup, null, 2), {
        httpMetadata: {
            contentType: 'application/json',
        },
        customMetadata: {
            table,
            rowCount: String(rows.length),
            exportedAt: backup.exportedAt,
        },
    });

    console.log(`Backed up ${table}: ${rows.length} rows -> ${path}`);

    return {
        table,
        rowCount: rows.length,
        path,
        success: true,
    };
}

/**
 * List available backups from R2.
 */
export async function listBackups(
    bucket: R2Bucket,
    table?: string
): Promise<{ path: string; size: number; uploaded: Date }[]> {
    const prefix = table ? `backups/${table}/` : 'backups/';
    const listed = await bucket.list({ prefix });

    return listed.objects.map(obj => ({
        path: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
    }));
}

/**
 * Restore a table from a backup.
 * WARNING: This will delete existing data in the table!
 *
 * @param bucket - R2 bucket
 * @param db - Database connection
 * @param backupPath - Path to the backup file in R2
 * @returns Number of rows restored
 */
export async function restoreFromBackup(
    bucket: R2Bucket,
    db: ReturnType<typeof createAuthDB>,
    backupPath: string
): Promise<{ table: string; rowCount: number }> {
    const object = await bucket.get(backupPath);
    if (!object) {
        throw new Error(`Backup not found: ${backupPath}`);
    }

    const content = await object.text();
    const backup = JSON.parse(content) as {
        table: string;
        data: BackupRow[];
    };

    if (!backup.table || !Array.isArray(backup.data)) {
        throw new Error('Invalid backup format');
    }

    // This is a simplified restore - in production you'd want transactions
    // and proper handling of foreign keys
    console.warn(`Restoring ${backup.table} from ${backupPath}`);

    // Delete existing data
    await db.run(`DELETE FROM ${backup.table}`, []);

    // Insert backup data
    let insertedCount = 0;
    for (const row of backup.data) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = columns.map(() => '?').join(', ');

        await db.run(
            `INSERT INTO ${backup.table} (${columns.join(', ')}) VALUES (${placeholders})`,
            values
        );
        insertedCount++;
    }

    return {
        table: backup.table,
        rowCount: insertedCount,
    };
}

/**
 * Scheduled event handler for backups.
 * Called by Cloudflare Workers scheduled trigger.
 */
export async function handleScheduledBackup(
    _controller: ScheduledController,
    env: Bindings,
    _ctx: ExecutionContext
): Promise<void> {
    console.log('Starting scheduled backup...');

    try {
        const result = await performBackup(env);

        const successCount = result.tables.filter(t => t.success).length;
        const failCount = result.tables.filter(t => !t.success).length;

        console.log(`Backup completed: ${successCount} tables succeeded, ${failCount} failed`);
        console.log(`Total rows backed up: ${result.totalRows}`);
        console.log(`Duration: ${result.duration}ms`);

        if (failCount > 0) {
            const failures = result.tables.filter(t => !t.success);
            console.error('Failed tables:', failures.map(f => `${f.table}: ${f.error}`).join(', '));
        }
    } catch (error) {
        console.error('Scheduled backup failed:', error);
    }
}
