// REFACTORED: Using AuthRepository instead of legacy AuthStorageAdapter
import type { AuthRepository } from "../../repositories";
import type { User, UserPublic, AuthResult, ServiceResult, RefreshToken, JWTPayload, EmailVerificationToken } from "../../types";
import type { SignupInput, LoginInput } from "../../schemas/auth.schema";
import type { JWKSService } from "../jwks";
import type { EmailService } from "../email";
import { generateId, ok, err, nowMs, nowSeconds, hashSHA256, generateRandomToken, generateRandomBytes } from "../shared";
import {
    MAX_NAME_LENGTH,
    MAX_FAILED_LOGIN_ATTEMPTS,
    ACCOUNT_LOCKOUT_DURATION_MS,
    REFRESH_TOKEN_LENGTH,
    EMAIL_VERIFICATION_TOKEN_LENGTH,
    EMAIL_VERIFICATION_TOKEN_EXPIRY_MS,
    PBKDF2_ITERATIONS,
    PBKDF2_SALT_LENGTH,
    PBKDF2_KEY_LENGTH,
} from "../../constants/auth";
import { ERROR_MESSAGES } from "../../constants/errors";
import { logger } from "../../utils/logger";

export class AuthService {
    constructor(
        private repository: AuthRepository,
        private jwtSecret: string,
        private jwtExpiresIn: number = 900,
        private refreshTokenExpiresIn: number = 604800,
        private googleClientId?: string,
        private jwksService?: JWKSService,
        private emailService?: EmailService
    ) {}

    async signup(input: SignupInput): Promise<ServiceResult<AuthResult>> {
        // Normalize email to lowercase to prevent case-sensitive duplicates
        const normalizedEmail = input.email.toLowerCase().trim();

        // SECURITY: Hash password first to prevent timing-based email enumeration
        // Even if email exists, we still pay the cost of hashing to maintain constant time
        const passwordHash = await this.hashPassword(input.password);

        const existing = await this.repository.getUserByEmail(normalizedEmail);
        if (existing) {
            return err(ERROR_MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
        }
        const now = nowMs();
        // Sanitize name: trim whitespace and limit length to prevent XSS/injection
        const sanitizedName = input.name
            ? input.name.trim().substring(0, MAX_NAME_LENGTH).replace(/[<>]/g, '')
            : null;

        const user: User = {
            id: generateId("usr"),
            email: normalizedEmail,
            passwordHash,
            emailVerified: false,
            googleId: null,
            name: sanitizedName,
            avatarUrl: null,
            status: "active",
            createdAt: now,
            updatedAt: now,
            lastLoginAt: null,
            failedLoginCount: 0,
            lockedUntil: null,
        };

        await this.repository.createUser(user);

        // Send email verification if email service is configured
        if (this.emailService) {
            try {
                const verificationToken = await this.createEmailVerificationToken(user.id);
                await this.emailService.sendVerificationEmail(
                    user.email,
                    user.name,
                    verificationToken.token
                );
            } catch (error) {
                // Log error but don't fail signup - user can resend verification email
                logger.error('Failed to send verification email', error, { userId: user.id });
            }
        }

        const tokens = await this.generateTokens(user);
        return ok({ ...tokens, user: this.toPublicUser(user) });
    }

    async login(input: LoginInput): Promise<ServiceResult<AuthResult>> {
        // Normalize email to lowercase to match signup behavior
        const normalizedEmail = input.email.toLowerCase().trim();

        const user = await this.repository.getUserByEmail(normalizedEmail);

        // SECURITY: Check if account is locked
        // Return generic error to prevent account enumeration
        if (user?.lockedUntil && user.lockedUntil > nowMs()) {
            return err(ERROR_MESSAGES.AUTH.TOO_MANY_FAILED_ATTEMPTS);
        }

        // SECURITY: Always verify password to prevent timing-based enumeration
        // Use dummy hash if user doesn't exist to maintain constant time
        const passwordHash = user?.passwordHash || "pbkdf2:100000:dHVtbXlzYWx0:dHVtbXloYXNo";
        const isValid = await this.verifyPassword(input.password, passwordHash);

        // Check all conditions after password verification (constant time)
        if (!user || !user.passwordHash || !isValid) {
            // Track failed login attempt
            if (user) {
                await this.handleFailedLogin(user);
            }
            return err(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
        }

        // SECURITY: Return generic error for suspended accounts to prevent enumeration
        if (user.status !== "active") {
            return err(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
        }

        // Reset failed login count on successful login
        const now = nowMs();
        await this.repository.updateUser(user.id, {
            lastLoginAt: now,
            failedLoginCount: 0,
            lockedUntil: null,
        });

        const tokens = await this.generateTokens(user);
        return ok({ ...tokens, user: this.toPublicUser(user) });
    }

    async googleAuth(idToken: string): Promise<ServiceResult<AuthResult>> {
        const googlePayload = await this.verifyGoogleToken(idToken);
        if (!googlePayload) {
            return err(ERROR_MESSAGES.AUTH.INVALID_GOOGLE_TOKEN);
        }

        // Normalize email from Google to match signup/login behavior
        const normalizedEmail = googlePayload.email.toLowerCase().trim();

        let user = await this.repository.getUserByGoogleId(googlePayload.sub);

        if (!user) {
            user = await this.repository.getUserByEmail(normalizedEmail);
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
                email: normalizedEmail,
                passwordHash: null,
                emailVerified: true,
                googleId: googlePayload.sub,
                name: googlePayload.name || null,
                avatarUrl: googlePayload.picture || null,
                status: "active",
                createdAt: now,
                updatedAt: now,
                lastLoginAt: now,
                failedLoginCount: 0,
                lockedUntil: null,
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
            return err(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
        }

        if (storedToken.expiresAt < nowMs()) {
            await this.repository.revokeRefreshToken(tokenHash);
            return err(ERROR_MESSAGES.AUTH.REFRESH_TOKEN_EXPIRED);
        }

        const user = await this.repository.getUserById(storedToken.userId);
        if (!user || user.status !== "active") {
            return err(ERROR_MESSAGES.USER.NOT_FOUND);
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
            // Use RS256 check if JWKS is available
            if (this.jwksService) {
                const result = await this.jwksService.verifyJWT(token);
                if (result.valid && result.payload) {
                    return result.payload as JWTPayload;
                }
                // Don't fall back to HS256 if RS256 is configured but failed
                // This prevents downgrade attacks
                return null;
            }

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

    async verifyEmail(token: string): Promise<ServiceResult<{ message: string }>> {
        const tokenHash = await hashSHA256(token);
        const verificationToken = await this.repository.getEmailVerificationTokenByHash(tokenHash);

        if (!verificationToken) {
            return err(ERROR_MESSAGES.AUTH.INVALID_VERIFICATION_TOKEN);
        }

        if (verificationToken.expiresAt < nowMs()) {
            await this.repository.markEmailAsVerified(tokenHash);
            return err(ERROR_MESSAGES.AUTH.VERIFICATION_TOKEN_EXPIRED);
        }

        if (verificationToken.verifiedAt) {
            return err(ERROR_MESSAGES.AUTH.EMAIL_ALREADY_VERIFIED);
        }

        // Mark token as verified and update user
        await this.repository.markEmailAsVerified(tokenHash);
        await this.repository.updateUser(verificationToken.userId, { emailVerified: true });

        return ok({ message: ERROR_MESSAGES.SUCCESS.EMAIL_VERIFIED });
    }

    async resendVerificationEmail(email: string): Promise<ServiceResult<{ message: string }>> {
        if (!this.emailService) {
            return err(ERROR_MESSAGES.EMAIL.SERVICE_NOT_CONFIGURED);
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await this.repository.getUserByEmail(normalizedEmail);

        if (!user) {
            // Return generic message to prevent email enumeration
            return ok({ message: ERROR_MESSAGES.EMAIL.VERIFICATION_SENT_IF_EXISTS });
        }

        if (user.emailVerified) {
            return err(ERROR_MESSAGES.AUTH.EMAIL_ALREADY_VERIFIED);
        }

        try {
            // Delete any existing tokens for this user
            await this.repository.deleteEmailVerificationTokensForUser(user.id);

            // Create new verification token
            const verificationToken = await this.createEmailVerificationToken(user.id);

            // Send verification email
            await this.emailService.sendVerificationEmail(
                user.email,
                user.name,
                verificationToken.token
            );

            return ok({ message: ERROR_MESSAGES.EMAIL.VERIFICATION_SENT });
        } catch (error) {
            logger.error('Failed to resend verification email', error, { email: normalizedEmail });
            return err(ERROR_MESSAGES.EMAIL.SEND_FAILED);
        }
    }

    private async handleFailedLogin(user: User): Promise<void> {
        const newFailedCount = user.failedLoginCount + 1;

        if (newFailedCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
            // Lock account after max failed attempts
            await this.repository.updateUser(user.id, {
                failedLoginCount: newFailedCount,
                lockedUntil: nowMs() + ACCOUNT_LOCKOUT_DURATION_MS,
            });
        } else {
            // Increment failed login count
            await this.repository.updateUser(user.id, {
                failedLoginCount: newFailedCount,
            });
        }
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
        // Use RS256 if JWKS service is available
        if (this.jwksService) {
            return this.jwksService.signUserJWT(user.id, user.email, this.jwtExpiresIn);
        }

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
        const token = generateRandomToken(REFRESH_TOKEN_LENGTH);
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

    private async createEmailVerificationToken(userId: string): Promise<EmailVerificationToken> {
        const token = generateRandomToken(EMAIL_VERIFICATION_TOKEN_LENGTH);
        const tokenHash = await hashSHA256(token);
        const now = nowMs();

        const verificationToken: EmailVerificationToken = {
            id: generateId("evt"),
            userId,
            token,
            tokenHash,
            expiresAt: now + EMAIL_VERIFICATION_TOKEN_EXPIRY_MS,
            createdAt: now,
            verifiedAt: null,
        };

        await this.repository.createEmailVerificationToken(verificationToken);
        return verificationToken;
    }

    private async hashPassword(password: string): Promise<string> {
        // Using PBKDF2 with Web Crypto API (Workers compatible)
        const encoder = new TextEncoder();
        const salt = generateRandomBytes(PBKDF2_SALT_LENGTH);
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );

        const derivedBits = await crypto.subtle.deriveBits(
            { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
            keyMaterial,
            PBKDF2_KEY_LENGTH
        );

        const hash = new Uint8Array(derivedBits);
        const saltB64 = btoa(String.fromCharCode(...salt));
        const hashB64 = btoa(String.fromCharCode(...hash));

        return `pbkdf2:${PBKDF2_ITERATIONS}:${saltB64}:${hashB64}`;
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
            PBKDF2_KEY_LENGTH
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
