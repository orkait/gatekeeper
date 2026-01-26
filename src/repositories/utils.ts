// Re-export shared utilities
export { UpdateBuilder, transforms, type FieldMapping } from '../utils/update-builder';

import type { AuthDB, D1Meta } from '../utils/db';
import { UpdateBuilder, type FieldMapping } from '../utils/update-builder';

export async function executeUpdate<T>(
    db: AuthDB,
    table: string,
    id: string,
    updates: Partial<T>,
    mappings: FieldMapping<T>[],
    options?: { addUpdatedAt?: boolean }
): Promise<D1Meta> {
    const builder = new UpdateBuilder(updates, mappings);

    if (options?.addUpdatedAt !== false) {
        builder.addTimestamp('updated_at');
    }

    if (!builder.hasUpdates()) {
        return { changes: 0, duration: 0, last_row_id: 0, rows_read: 0, rows_written: 0 };
    }

    return db.run(builder.toSql(table), builder.getValues(id));
}
