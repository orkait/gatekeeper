// REFACTORED: Using AuthRepository instead of legacy AuthStorageAdapter
import type { AuthRepository } from "../../repositories";
import type { User, UserPublic, AuthResult, ServiceResult, RefreshToken, JWTPayload } from "../../types";
import type { SignupInput, LoginInput } from "../../schemas/auth.schema";
import { generateId, ok, err, nowMs, nowSeconds, hashSHA256, generateRandomToken, generateRandomBytes } from "../shared";

export class AuthService {
    constructor(
        private repository: AuthRepository,
        private jwtSecret: string,
        private jwtExpiresIn: number = 900,
        private refreshTokenExpiresIn: number = 604800,
        private googleClientId?: string
    ) { }

    async signup(input: SignupInput): Promise<ServiceResult<AuthResult>> {
        const existing = await this.repository.getUserByEmail(input.email);
        if (existing) {
            return err("Email already registered");
        }

        const passwordHash = await this.hashPassword(input.password);
        const now = nowMs();
        const user: User = {
            id: generateId("usr"),
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

        await this.repository.createUser(user);

        const tokens = await this.generateTokens(user);
        return ok({ ...tokens, user: this.toPublicUser(user) });
    }

    async login(input: LoginInput): Promise<ServiceResult<AuthResult>> {
        const user = await this.repository.getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
            return err("Invalid email or password");
        }

        const isValid = await this.verifyPassword(input.password, user.passwordHash);
        if (!isValid) {
            return err("Invalid email or password");
        }

        if (user.status !== "active") {
            return err("Account is suspended");
        }

        await this.repository.updateUser(user.id, { lastLoginAt: nowMs() });

        const tokens = await this.generateTokens(user);
        return ok({ ...tokens, user: this.toPublicUser(user) });
    }

    async googleAuth(idToken: string): Promise<ServiceResult<AuthResult>> {
        const googlePayload = await this.verifyGoogleToken(idToken);
        if (!googlePayload) {
            return err("Invalid Google token");
        }

        let user = await this.repository.getUserByGoogleId(googlePayload.sub);

        if (!user) {
            user = await this.repository.getUserByEmail(googlePayload.email);
            if (user) {
                await this.repository.updateUser(user.id, {
                    googleId: googlePayload.sub,
                    emailVerified: true,
                    name: user.name || googlePayload.name || null,
                    avatarUrl: user.avatarUrl || googlePayload.picture || null,
                });
                user = (await this.repository.getUserById(user.id))!;
            }
        }

        if (!user) {
            const now = nowMs();
            user = {
                id: generateId("usr"),
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
            await this.repository.createUser(user);
        } else {
            await this.repository.updateUser(user.id, { lastLoginAt: nowMs() });
        }

        const tokens = await this.generateTokens(user);
        return ok({ ...tokens, user: this.toPublicUser(user) });
    }

    async refreshAccessToken(refreshToken: string): Promise<ServiceResult<AuthResult>> {
        const tokenHash = await hashSHA256(refreshToken);
        const storedToken = await this.repository.getRefreshToken(tokenHash);

        if (!storedToken) {
            return err("Invalid refresh token");
        }

        if (storedToken.expiresAt < nowMs()) {
            await this.repository.revokeRefreshToken(tokenHash);
            return err("Refresh token expired");
        }

        const user = await this.repository.getUserById(storedToken.userId);
        if (!user || user.status !== "active") {
            return err("User not found or suspended");
        }

        // Revoke old token and generate new ones (token rotation)
        await this.repository.revokeRefreshToken(tokenHash);
        const tokens = await this.generateTokens(user);

        return ok({ ...tokens, user: this.toPublicUser(user) });
    }

    async logout(refreshToken: string): Promise<void> {
        const tokenHash = await hashSHA256(refreshToken);
        await this.repository.revokeRefreshToken(tokenHash);
    }

    async logoutAll(userId: string): Promise<void> {
        await this.repository.revokeAllUserRefreshTokens(userId);
    }

    async verifyAccessToken(token: string): Promise<JWTPayload | null> {
        try {
            const [headerB64, payloadB64, signatureB64] = token.split(".");
            if (!headerB64 || !payloadB64 || !signatureB64) return null;

            const payload = JSON.parse(this.base64UrlDecode(payloadB64)) as JWTPayload;

            if (payload.exp && payload.exp < nowSeconds()) {
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
        return this.repository.getUserById(userId);
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
        const now = nowSeconds();
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
        const token = generateRandomToken(32);
        const tokenHash = await hashSHA256(token);
        const now = nowMs();

        const refreshToken: RefreshToken = {
            id: generateId("rt"),
            userId,
            tokenHash,
            deviceInfo: null,
            ipAddress: null,
            expiresAt: now + this.refreshTokenExpiresIn * 1000,
            createdAt: now,
            revokedAt: null,
        };

        await this.repository.createRefreshToken(refreshToken);
        return token;
    }

    private async hashPassword(password: string): Promise<string> {
        // Using PBKDF2 with Web Crypto API (Workers compatible)
        const encoder = new TextEncoder();
        const salt = generateRandomBytes(16);
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

    private async verifyGoogleToken(idToken: string): Promise<{ sub: string; email: string; name?: string; picture?: string } | null> {
        if (!this.googleClientId) return null;

        try {
            // SECURITY FIX: Use Google's tokeninfo API to verify the token signature
            // This ensures the token was actually issued by Google and not forged
            const response = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
            );

            if (!response.ok) {
                // Token verification failed (invalid signature, expired, etc.)
                return null;
            }

            const payload = await response.json() as {
                aud?: string;
                iss?: string;
                sub?: string;
                email?: string;
                name?: string;
                picture?: string;
                exp?: string;
            };

            // Verify audience matches our client ID
            if (payload.aud !== this.googleClientId) return null;

            // Verify issuer is Google
            if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss ?? "")) return null;

            // Verify required fields are present
            if (!payload.sub || !payload.email) return null;

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
}
