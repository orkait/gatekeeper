import type { AuthStorageAdapter } from "../adapters/adapter";
import type { User, UserPublic, AuthResult, ServiceResult, RefreshToken, JWTPayload } from "../types";
import type { SignupInput, LoginInput } from "../schemas/auth.schema";

export class AuthService {
    constructor(
        private adapter: AuthStorageAdapter,
        private jwtSecret: string,
        private jwtExpiresIn: number = 900,
        private refreshTokenExpiresIn: number = 604800,
        private googleClientId?: string
    ) {}

    async signup(input: SignupInput): Promise<ServiceResult<AuthResult>> {
        const existing = await this.adapter.getUserByEmail(input.email);
        if (existing) {
            return { success: false, error: "Email already registered" };
        }

        const passwordHash = await this.hashPassword(input.password);
        const now = Date.now();
        const user: User = {
            id: this.generateId("usr"),
            email: input.email,
            passwordHash,
            emailVerified: false,
            googleId: null,
            name: input.name || null,
            avatarUrl: null,
            status: "active",
            createdAt: now,
            updatedAt: now,
            lastLoginAt: now,
        };

        await this.adapter.createUser(user);

        const tokens = await this.generateTokens(user);
        return {
            success: true,
            data: { ...tokens, user: this.toPublicUser(user) },
        };
    }

    async login(input: LoginInput): Promise<ServiceResult<AuthResult>> {
        const user = await this.adapter.getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
            return { success: false, error: "Invalid email or password" };
        }

        const isValid = await this.verifyPassword(input.password, user.passwordHash);
        if (!isValid) {
            return { success: false, error: "Invalid email or password" };
        }

        if (user.status !== "active") {
            return { success: false, error: "Account is suspended" };
        }

        await this.adapter.updateUser(user.id, { lastLoginAt: Date.now() });

        const tokens = await this.generateTokens(user);
        return {
            success: true,
            data: { ...tokens, user: this.toPublicUser(user) },
        };
    }

    async googleAuth(idToken: string): Promise<ServiceResult<AuthResult>> {
        const googlePayload = await this.verifyGoogleToken(idToken);
        if (!googlePayload) {
            return { success: false, error: "Invalid Google token" };
        }

        let user = await this.adapter.getUserByGoogleId(googlePayload.sub);

        if (!user) {
            user = await this.adapter.getUserByEmail(googlePayload.email);
            if (user) {
                await this.adapter.updateUser(user.id, {
                    googleId: googlePayload.sub,
                    emailVerified: true,
                    name: user.name || googlePayload.name || null,
                    avatarUrl: user.avatarUrl || googlePayload.picture || null,
                });
                user = (await this.adapter.getUserById(user.id))!;
            }
        }

        if (!user) {
            const now = Date.now();
            user = {
                id: this.generateId("usr"),
                email: googlePayload.email,
                passwordHash: null,
                emailVerified: true,
                googleId: googlePayload.sub,
                name: googlePayload.name || null,
                avatarUrl: googlePayload.picture || null,
                status: "active",
                createdAt: now,
                updatedAt: now,
                lastLoginAt: now,
            };
            await this.adapter.createUser(user);
        } else {
            await this.adapter.updateUser(user.id, { lastLoginAt: Date.now() });
        }

        const tokens = await this.generateTokens(user);
        return {
            success: true,
            data: { ...tokens, user: this.toPublicUser(user) },
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<ServiceResult<AuthResult>> {
        const tokenHash = await this.hashToken(refreshToken);
        const storedToken = await this.adapter.getRefreshToken(tokenHash);

        if (!storedToken) {
            return { success: false, error: "Invalid refresh token" };
        }

        if (storedToken.expiresAt < Date.now()) {
            await this.adapter.revokeRefreshToken(tokenHash);
            return { success: false, error: "Refresh token expired" };
        }

        const user = await this.adapter.getUserById(storedToken.userId);
        if (!user || user.status !== "active") {
            return { success: false, error: "User not found or suspended" };
        }

        // Revoke old token and generate new ones (token rotation)
        await this.adapter.revokeRefreshToken(tokenHash);
        const tokens = await this.generateTokens(user);

        return {
            success: true,
            data: { ...tokens, user: this.toPublicUser(user) },
        };
    }

    async logout(refreshToken: string): Promise<void> {
        const tokenHash = await this.hashToken(refreshToken);
        await this.adapter.revokeRefreshToken(tokenHash);
    }

    async logoutAll(userId: string): Promise<void> {
        await this.adapter.revokeAllUserTokens(userId);
    }

    async verifyAccessToken(token: string): Promise<JWTPayload | null> {
        try {
            const [headerB64, payloadB64, signatureB64] = token.split(".");
            if (!headerB64 || !payloadB64 || !signatureB64) return null;

            const payload = JSON.parse(this.base64UrlDecode(payloadB64)) as JWTPayload;

            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                return null;
            }

            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey(
                "raw",
                encoder.encode(this.jwtSecret),
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["verify"]
            );

            const data = encoder.encode(`${headerB64}.${payloadB64}`);
            const signature = Uint8Array.from(
                atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
                c => c.charCodeAt(0)
            );

            const isValid = await crypto.subtle.verify("HMAC", key, signature, data);
            return isValid ? payload : null;
        } catch {
            return null;
        }
    }

    async getUser(userId: string): Promise<User | null> {
        return this.adapter.getUserById(userId);
    }

    // Private helpers
    private async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
        const accessToken = await this.generateAccessToken(user);
        const refreshToken = await this.generateRefreshToken(user.id);

        return {
            accessToken,
            refreshToken,
            expiresIn: this.jwtExpiresIn,
        };
    }

    private async generateAccessToken(user: User): Promise<string> {
        const header = { alg: "HS256", typ: "JWT" };
        const now = Math.floor(Date.now() / 1000);
        const payload: JWTPayload = {
            sub: user.id,
            email: user.email,
            iat: now,
            exp: now + this.jwtExpiresIn,
        };

        const headerB64 = this.base64UrlEncode(JSON.stringify(header));
        const payloadB64 = this.base64UrlEncode(JSON.stringify(payload));

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(this.jwtSecret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );

        const data = encoder.encode(`${headerB64}.${payloadB64}`);
        const signatureBuffer = await crypto.subtle.sign("HMAC", key, data);
        const signatureB64 = this.base64UrlEncode(
            String.fromCharCode(...new Uint8Array(signatureBuffer))
        );

        return `${headerB64}.${payloadB64}.${signatureB64}`;
    }

    private async generateRefreshToken(userId: string): Promise<string> {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const token = this.bytesToBase62(bytes);

        const tokenHash = await this.hashToken(token);
        const now = Date.now();

        const refreshToken: RefreshToken = {
            id: this.generateId("rt"),
            userId,
            tokenHash,
            deviceInfo: null,
            ipAddress: null,
            expiresAt: now + this.refreshTokenExpiresIn * 1000,
            createdAt: now,
            revokedAt: null,
        };

        await this.adapter.createRefreshToken(refreshToken);
        return token;
    }

    private async hashPassword(password: string): Promise<string> {
        // Using PBKDF2 with Web Crypto API (Workers compatible)
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );

        const derivedBits = await crypto.subtle.deriveBits(
            { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial,
            256
        );

        const hash = new Uint8Array(derivedBits);
        const saltB64 = btoa(String.fromCharCode(...salt));
        const hashB64 = btoa(String.fromCharCode(...hash));

        return `pbkdf2:100000:${saltB64}:${hashB64}`;
    }

    private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
        const [, iterationsStr, saltB64, hashB64] = storedHash.split(":");
        if (!iterationsStr || !saltB64 || !hashB64) return false;

        const iterations = parseInt(iterationsStr, 10);
        const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
        const storedHashBytes = Uint8Array.from(atob(hashB64), c => c.charCodeAt(0));

        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );

        const derivedBits = await crypto.subtle.deriveBits(
            { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
            keyMaterial,
            256
        );

        const derivedHash = new Uint8Array(derivedBits);

        if (derivedHash.length !== storedHashBytes.length) return false;
        return derivedHash.every((byte, i) => byte === storedHashBytes[i]);
    }

    private async hashToken(token: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(token);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
    }

    private async verifyGoogleToken(idToken: string): Promise<{ sub: string; email: string; name?: string; picture?: string } | null> {
        if (!this.googleClientId) return null;

        try {
            // Decode and verify the Google ID token
            const [, payloadB64] = idToken.split(".");
            if (!payloadB64) return null;

            const payload = JSON.parse(this.base64UrlDecode(payloadB64));

            // Verify audience and issuer
            if (payload.aud !== this.googleClientId) return null;
            if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) return null;

            // Check expiration
            if (payload.exp < Math.floor(Date.now() / 1000)) return null;

            return {
                sub: payload.sub,
                email: payload.email,
                name: payload.name,
                picture: payload.picture,
            };
        } catch {
            return null;
        }
    }

    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    private toPublicUser(user: User): UserPublic {
        return {
            id: user.id,
            email: user.email,
            emailVerified: user.emailVerified,
            name: user.name,
            avatarUrl: user.avatarUrl,
            status: user.status,
            createdAt: user.createdAt,
        };
    }

    private base64UrlEncode(str: string): string {
        return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    private base64UrlDecode(str: string): string {
        const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
        return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    }

    private bytesToBase62(bytes: Uint8Array): string {
        const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        let result = "";
        for (const byte of bytes) {
            result += chars[byte % 62];
        }
        return result;
    }
}
