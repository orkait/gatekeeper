/**
 * Shared UpdateBuilder utility for building dynamic SQL UPDATE statements.
 * Used by both adapters and repositories to eliminate code duplication.
 */

type SqlValue = string | number | null;

export interface FieldMapping<T> {
    key: keyof T;
    column: string;
    transform?: (value: unknown) => SqlValue;
}

export class UpdateBuilder<T> {
    private fields: string[] = [];
    private values: SqlValue[] = [];

    constructor(
        private updates: Partial<T>,
        private mappings: FieldMapping<T>[]
    ) {
        this.build();
    }

    private build(): void {
        for (const mapping of this.mappings) {
            const value = this.updates[mapping.key];
            if (value !== undefined) {
                this.fields.push(`${mapping.column} = ?`);
                this.values.push(mapping.transform ? mapping.transform(value) : value as SqlValue);
            }
        }
    }

    addTimestamp(column: string): this {
        this.fields.push(`${column} = ?`);
        this.values.push(Date.now());
        return this;
    }

    hasUpdates(): boolean {
        return this.fields.length > 0;
    }

    toSql(table: string, idColumn = 'id'): string {
        return `UPDATE ${table} SET ${this.fields.join(', ')} WHERE ${idColumn} = ?`;
    }

    getValues(id: string): SqlValue[] {
        return [...this.values, id];
    }
}

export const transforms = {
    toJson: (value: unknown): string => JSON.stringify(value),
    toBoolean: (value: unknown): number => (value ? 1 : 0),
};
