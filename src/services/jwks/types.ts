import type { JWK } from 'jose';

export interface JWKS {
    keys: JWK[];
}
