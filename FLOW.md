# Orkait Auth - System Flow Guide

This document teaches you how the entire authentication control plane works, step by step.

---

## 1. The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        YOUR PRODUCT (Multiple Services)                  │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────┤
│  Frontend    │  Documents   │  Analytics   │  Billing     │  ...more    │
│  (React)     │  Service     │  Service     │  Service     │  services   │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴─────────────┘
       │              │              │              │
       │              │  "Can user   │              │
       │              │   do this?"  │              │
       │              ▼              ▼              ▼
       │         ┌─────────────────────────────────────┐
       └────────►│         ORKAIT AUTH                 │◄────────────────
                 │      (This Control Plane)           │
                 ├─────────────────────────────────────┤
                 │  • Authenticates users              │
                 │  • Manages sessions                 │
                 │  • Handles tenants (orgs)           │
                 │  • Tracks quotas & usage            │
                 │  • Authorizes actions               │
                 └─────────────────────────────────────┘
```

**Key insight**: Orkait Auth is NOT your main product. It's the "gatekeeper" that all your services call to answer: **"Is this person allowed to do this thing?"**

---

## 2. Core Concepts

### 2.1 User
A person with an account. Has email, password (or Google ID), and profile info.

```
User {
  id: "usr_abc123"
  email: "jane@company.com"
  name: "Jane"
  status: "active"
}
```

### 2.2 Tenant
An organization/company. Users belong to tenants. Think "workspace" in Slack or "organization" in GitHub.

```
Tenant {
  id: "tnt_xyz789"
  name: "Acme Corp"
  globalQuotaLimit: 10000  // Max API calls per month
}
```

### 2.3 Tenant User (Membership)
Links a user to a tenant with a specific role.

```
TenantUser {
  tenantId: "tnt_xyz789"
  userId: "usr_abc123"
  role: "admin"  // "owner" | "admin" | "member"
}
```

### 2.4 Session
Proof that a user is logged in. Each user gets ONE session per service.

```
Session {
  id: "sess_111"
  userId: "usr_abc123"
  tenantId: "tnt_xyz789"
  service: "documents"  // Which service this session is for
  refreshTokenHash: "..."
}
```

### 2.5 JWT Tokens
Portable proof of identity. Two types:

| Token | Lifetime | Purpose |
|-------|----------|---------|
| Access Token | 15 min | Sent with every API request |
| Refresh Token | 7 days | Used to get new access tokens |

---

## 3. Flow #1: User Sign Up

```
User                    Frontend                Orkait Auth              Database
 │                         │                         │                       │
 │  "Sign me up"           │                         │                       │
 │ ───────────────────────►│                         │                       │
 │                         │  POST /api/auth/signup  │                       │
 │                         │  {email, password, name}│                       │
 │                         │────────────────────────►│                       │
 │                         │                         │                       │
 │                         │                         │  1. Check: email exists?
 │                         │                         │─────────────────────►│
 │                         │                         │◄─────────────────────│
 │                         │                         │                       │
 │                         │                         │  2. Hash password (PBKDF2)
 │                         │                         │  3. Create user record │
 │                         │                         │─────────────────────►│
 │                         │                         │                       │
 │                         │                         │  4. Generate tokens   │
 │                         │  {accessToken,          │                       │
 │                         │   refreshToken, user}   │                       │
 │                         │◄────────────────────────│                       │
 │  "You're logged in!"    │                         │                       │
 │ ◄───────────────────────│                         │                       │
```

**Code path:**
```
routes/auth/handlers.ts → POST /signup
  └── AuthService.signup()
        ├── repository.getUserByEmail()  // Check duplicate
        ├── hashPassword()               // PBKDF2-SHA256, 100k iterations
        ├── repository.createUser()      // Save to DB
        └── generateTokens()             // Create JWT access + refresh tokens
```

---

## 4. Flow #2: API Request with Authentication

```
Frontend                Your Service            Orkait Auth
    │                         │                       │
    │  GET /documents/123     │                       │
    │  Authorization: Bearer  │                       │
    │  <accessToken>          │                       │
    │────────────────────────►│                       │
    │                         │                       │
    │                         │  Verify JWT locally   │
    │                         │  (using JWKS or       │
    │                         │   shared secret)      │
    │                         │                       │
    │                         │  OR call /authorize   │
    │                         │──────────────────────►│
    │                         │                       │
    │                         │  {allowed: true}      │
    │                         │◄──────────────────────│
    │                         │                       │
    │  {document data}        │                       │
    │◄────────────────────────│                       │
```

**Two verification options:**

1. **Local verification**: Your service verifies JWT using the public key from `/.well-known/jwks.json`
2. **Central authorization**: Your service calls `/api/authorize` for complex checks (quotas, features, roles)

---

## 5. Flow #3: Creating a Tenant (Organization)

```
User                    Frontend                Orkait Auth              Database
 │                         │                         │                       │
 │  "Create my company"    │                         │                       │
 │ ───────────────────────►│                         │                       │
 │                         │  POST /api/tenants      │                       │
 │                         │  Authorization: Bearer  │                       │
 │                         │  {name: "Acme Corp"}    │                       │
 │                         │────────────────────────►│                       │
 │                         │                         │                       │
 │                         │                         │  1. Verify JWT        │
 │                         │                         │  2. Create tenant     │
 │                         │                         │─────────────────────►│
 │                         │                         │                       │
 │                         │                         │  3. Add user as owner │
 │                         │                         │─────────────────────►│
 │                         │                         │                       │
 │                         │  {tenant data}          │                       │
 │                         │◄────────────────────────│                       │
 │  "Tenant created!"      │                         │                       │
 │ ◄───────────────────────│                         │                       │
```

**Important**: The user who creates a tenant automatically becomes the **owner**.

---

## 6. Flow #4: The Central Authorization Check

This is the most powerful endpoint. Other services call it to check permissions.

```
POST /api/authorize
{
  "action": "delete",
  "resource": "documents/123",
  "context": {
    "tenantId": "tnt_xyz789",
    "service": "documents",
    "requiredFeature": "bulk_delete",
    "requiredRole": "admin",
    "quotaToConsume": 1
  }
}
```

**What it checks (in order):**

```
1. SESSION CHECK
   └── Is the JWT valid? Is the session still active?
         │
         ▼
2. SUBSCRIPTION CHECK
   └── Does this tenant have an active subscription?
         │
         ▼
3. SERVICE CHECK
   └── Is "documents" service enabled for this subscription?
         │
         ▼
4. FEATURE CHECK
   └── Is "bulk_delete" feature flag enabled?
       (Could be: tier-based, tenant-specific, or rollout %)
         │
         ▼
5. QUOTA CHECK
   └── Has the tenant exceeded their API call limit?
         │
         ▼
6. ROLE CHECK
   └── Does this user have "admin" role in this tenant?
         │
         ▼
   ✅ ALLOWED (or ❌ DENIED with reason)
```

**Response:**
```json
{
  "allowed": true,
  "userId": "usr_abc123",
  "tenantId": "tnt_xyz789",
  "subscription": { "tier": "pro", "status": "active" },
  "quotaRemaining": 8500
}
```

---

## 7. Flow #5: Token Refresh

Access tokens expire after 15 minutes. Here's how to get a new one:

```
Frontend                                    Orkait Auth
    │                                            │
    │  POST /api/auth/refresh                    │
    │  {refreshToken: "abc..."}                  │
    │───────────────────────────────────────────►│
    │                                            │
    │                                            │  1. Hash the refresh token
    │                                            │  2. Look up in database
    │                                            │  3. Check if expired
    │                                            │  4. Check if revoked
    │                                            │  5. Get the user
    │                                            │  6. REVOKE old refresh token ⚠️
    │                                            │  7. Generate new token pair
    │                                            │
    │  {accessToken, refreshToken (NEW!), user}  │
    │◄───────────────────────────────────────────│
```

**Security feature: Token Rotation**  
Every time you refresh, you get a NEW refresh token. The old one is revoked. This means if someone steals your refresh token, they can only use it once before it becomes invalid.

---

## 8. Flow #6: API Key Authentication

For server-to-server communication (no user interaction):

```
Backend Service                             Orkait Auth
    │                                            │
    │  POST /api/auth/apikey                     │
    │  {apiKey: "ork_live_abc123..."}            │
    │───────────────────────────────────────────►│
    │                                            │
    │                                            │  1. Hash the API key (SHA-256)
    │                                            │  2. Look up by hash
    │                                            │  3. Check status & expiry
    │                                            │  4. Generate scoped JWT
    │                                            │
    │  {accessToken, scopes: ["read", "write"]}  │
    │◄───────────────────────────────────────────│
    │                                            │
    │  Now use accessToken for API calls...      │
```

**Key security**: API keys are HASHED before storage. We never store the plaintext. When you create an API key, you see it ONCE.

---

## 9. Data Flow Diagram

```
                    ┌──────────────────────────────────────┐
                    │              D1 DATABASE             │
                    ├──────────────────────────────────────┤
                    │  users          │  tenant_users      │
                    │  tenants        │  sessions          │
                    │  subscriptions  │  api_keys          │
                    │  feature_flags  │  usage_events      │
                    └─────────────────┬────────────────────┘
                                      │
                                      ▼
┌─────────────┐    ┌───────────────────────────────────────────┐
│  Incoming   │    │                MIDDLEWARE                 │
│  Request    │───►│  logger → cors → service-injector → auth  │
└─────────────┘    └───────────────────────┬───────────────────┘
                                           │
                                           ▼
                    ┌──────────────────────────────────────┐
                    │              ROUTES                   │
                    ├──────────────────────────────────────┤
                    │  /auth     → AuthService              │
                    │  /tenants  → TenantService            │
                    │  /keys     → ApiKeyService            │
                    │  /authorize → AuthorizationService    │
                    │  /webhooks → WebhookService           │
                    └──────────────────────────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────────┐
                    │           REPOSITORIES               │
                    ├──────────────────────────────────────┤
                    │  AuthRepository                       │
                    │    └── UserRepository                 │
                    │    └── TenantRepository               │
                    │    └── SessionRepository              │
                    │    └── RefreshTokenRepository         │
                    └──────────────────────────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────────┐
                    │           KV CACHE                   │
                    ├──────────────────────────────────────┤
                    │  Cached authorization decisions       │
                    │  (for performance, TTL = minutes)     │
                    └──────────────────────────────────────┘
```

---

## 10. Security Model Summary

| What | How It's Protected |
|------|-------------------|
| Passwords | PBKDF2-SHA256, 100k iterations, random salt |
| Access Tokens | JWT signed with HS256, 15 min expiry |
| Refresh Tokens | Stored as SHA-256 hash, rotated on each use |
| API Keys | Stored as SHA-256 hash, prefix stored for lookup |
| Database Reads | D1 sessions for strong consistency (no stale data) |

---

## 11. Quick Reference: Which Service Does What?

| Service | Responsibility |
|---------|---------------|
| `AuthService` | Sign up, login, token refresh, logout |
| `JWTService` | Create and verify JWT tokens |
| `TenantService` | Create/manage organizations |
| `SessionService` | Per-service session management |
| `QuotaService` | Track usage, check remaining quota |
| `AuthorizationService` | The central "can they do this?" check |
| `FeatureFlagService` | Check if features are enabled |
| `WebhookService` | Notify external systems of events |

---

## 12. Hands-On Exercise

Try this flow yourself:

```bash
# 1. Sign up
curl -X POST https://orkait-auth.aconite.workers.dev/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test1234", "name": "Test"}'

# Save the accessToken from the response

# 2. Create a tenant
curl -X POST https://orkait-auth.aconite.workers.dev/api/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"name": "My Company", "globalQuotaLimit": 1000}'

# 3. List your tenants
curl -X GET https://orkait-auth.aconite.workers.dev/api/tenants/me/list \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 4. Refresh your token
curl -X POST https://orkait-auth.aconite.workers.dev/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "YOUR_REFRESH_TOKEN"}'
```

---

## 13. Common Questions

**Q: Why separate access & refresh tokens?**  
A: Access tokens are short-lived (15 min) so if stolen, the damage is limited. Refresh tokens are long-lived but only sent to one endpoint (`/refresh`), reducing exposure.

**Q: Why hash passwords with PBKDF2 instead of SHA-256?**  
A: SHA-256 is too fast! Attackers can guess billions of passwords per second. PBKDF2 with 100k iterations is intentionally slow, making brute-force attacks impractical.

**Q: Why is tenant required for some tokens?**  
A: Some tokens are "basic" (just proves who you are). Others are "session" tokens (proves who you are AND which organization you're acting on behalf of).

**Q: What happens if D1 database is down?**  
A: The system falls back to KV cache for authorization decisions. It's "degraded mode" - works but may use slightly stale data.

---

That's the core of Orkait Auth! 🎉
