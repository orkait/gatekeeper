import type { ServiceResult } from '../../types';

export function ok<T>(data: T): ServiceResult<T> {
    return { success: true, data };
}

export function err<T = never>(error: string): ServiceResult<T> {
    return { success: false, error };
}
