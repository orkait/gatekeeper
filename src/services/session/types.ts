import type { Session } from '../../repositories/types';

export interface CreateSessionInput {
    userId: string;
    tenantId: string;
    service: string;
    deviceInfo?: string;
    ipAddress?: string;
    expiresInSeconds?: number;
}

export interface SessionTokens {
    session: Session;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
