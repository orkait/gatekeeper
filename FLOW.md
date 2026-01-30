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

## 14. Subscription Management

Subscriptions control **what features a tenant can access** based on their tier.

### 14.1 Subscription Model

```
Subscription {
  id: "sub_abc123"
  tenantId: "tnt_xyz789"
  tier: "pro"                    // "free" | "pro" | "enterprise"
  status: "active"               // "active" | "cancelled" | "past_due"
  currentPeriodEnd: 1735689600   // When current period expires
}
```

### 14.2 Tier Hierarchy

```
┌──────────────────────────────────────────────────────────────┐
│                        ENTERPRISE                             │
│  • All features                                               │
│  • Highest quota limits                                       │
│  • Priority support                                           │
├──────────────────────────────────────────────────────────────┤
│                           PRO                                 │
│  • Advanced features                                          │
│  • Higher quota limits                                        │
├──────────────────────────────────────────────────────────────┤
│                          FREE                                 │
│  • Basic features only                                        │
│  • Limited quota                                              │
└──────────────────────────────────────────────────────────────┘
```

### 14.3 Flow: Upgrade Subscription

```
Admin/User              Frontend                Orkait Auth
    │                       │                        │
    │  "Upgrade to Pro"     │                        │
    │ ─────────────────────►│                        │
    │                       │ POST /api/subscriptions│
    │                       │ /{tenantId}/upgrade    │
    │                       │ {tier: "pro"}          │
    │                       │───────────────────────►│
    │                       │                        │
    │                       │                        │  1. Validate: new tier > current
    │                       │                        │  2. Update subscription
    │                       │                        │  3. Emit webhook event ──┐
    │                       │                        │                          │
    │                       │ {subscription}         │                          ▼
    │                       │◄───────────────────────│               Billing Service
    │  "Now on Pro!"        │                        │               receives notification
    │ ◄─────────────────────│                        │
```

### 14.4 Per-Service Enablement

Subscriptions can enable/disable specific services:

```typescript
// Enable analytics service for this subscription
POST /api/subscriptions/{subscriptionId}/services
{ "service": "analytics", "enabled": true }

// During authorization, system checks:
// 1. Is subscription active?
// 2. Is this specific service enabled?
```

### 14.5 When Subscriptions Are Checked

Subscriptions are checked during the **Authorization** flow:

```
Authorization Request
        │
        ▼
┌─────────────────┐
│ Session valid?  │──No──► Deny
└────────┬────────┘
         │ Yes
         ▼
┌─────────────────────────┐
│ Subscription active?    │──No──► Deny (SUBSCRIPTION_INACTIVE)
└────────┬────────────────┘
         │ Yes
         ▼
┌─────────────────────────┐
│ Tier has this feature?  │──No──► Deny (TIER_TOO_LOW)
└────────┬────────────────┘
         │ Yes
         ▼
    Continue checks...
```

---

## 15. Usage Tracking & Quota System

Tracks API usage and enforces limits at both **API key** and **tenant** levels.

### 15.1 Usage Event

```
UsageEvent {
  tenantId: "tnt_xyz789"
  apiKeyId: "key_123"          // Optional
  service: "api"
  action: "document.create"
  quantity: 1
  period: "2024-01"            // Monthly bucket
  idempotencyKey: "req_abc"    // Prevents double-counting
}
```

### 15.2 Two-Level Quota Limits

```
┌─────────────────────────────────────────────────────────────┐
│                    TENANT GLOBAL LIMIT                       │
│                    100,000 calls/month                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              API Key Limits (Optional)                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
│  │  │ Key A       │  │ Key B       │  │ Key C       │   │   │
│  │  │ 10k/day     │  │ 5k/hour     │  │ No limit    │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 15.3 Flow: Check and Record Usage

```
Your Service                           Orkait Auth
    │                                       │
    │  POST /api/authorize                  │
    │  {action, resource, context: {        │
    │    tenantId, quantity: 1, apiKeyId    │
    │  }}                                   │
    │──────────────────────────────────────►│
    │                                       │
    │                                       │  1. Check API key limit
    │                                       │     (if apiKeyId provided)
    │                                       │
    │                                       │  2. Check tenant global limit
    │                                       │
    │                                       │  3. If allowed, record usage
    │                                       │
    │  {allowed: true,                      │
    │   quotaRemaining: 8500}               │
    │◄──────────────────────────────────────│
    │                                       │
    │  Proceed with request                 │
```

### 15.4 Quota Endpoints

```bash
# Get current quota status
GET /api/subscriptions/usage/{tenantId}/quota

# Response:
{
  "allowed": true,
  "remaining": 8500,
  "limit": 10000,
  "used": 1500,
  "level": "tenant"  // or "api_key"
}

# Get usage summary
GET /api/subscriptions/usage/{tenantId}?period=2024-01

# Get detailed usage events
GET /api/subscriptions/usage/{tenantId}/events?period=2024-01&limit=100
```

### 15.5 Race Condition Protection

Uses **99% buffer** to prevent multiple concurrent requests exceeding limit:

```
Actual Limit: 10,000
Effective Limit: 10,000 × 0.99 = 9,900

This leaves headroom for concurrent requests.
```

---

## 16. Admin Features: Feature Flags

Feature flags control **gradual rollout** and **per-tier features**.

### 16.1 Feature Flag Model

```
FeatureFlag {
  name: "dark_mode"
  description: "New dark mode UI"
  enabledTiers: ["pro", "enterprise"]   // Which tiers get this
  enabledTenants: ["tnt_beta123"]       // Explicit whitelist
  rolloutPercentage: 25                  // Gradual rollout (25%)
  active: true                           // Kill switch
}
```

### 16.2 Feature Flag Evaluation Order

```
Request: "Is dark_mode enabled for tenant_xyz?"
                │
                ▼
┌───────────────────────────┐
│ Is flag globally active?  │──No──► Feature DISABLED
└────────────┬──────────────┘
             │ Yes
             ▼
┌───────────────────────────┐
│ Is tenant whitelisted?    │──Yes─► Feature ENABLED
└────────────┬──────────────┘
             │ No
             ▼
┌───────────────────────────┐
│ Is tier in enabledTiers?  │──No──► Feature DISABLED
└────────────┬──────────────┘
             │ Yes
             ▼
┌───────────────────────────┐
│ Rollout check:            │
│ hash(tenantId + flagName) │
│ % 100 < rolloutPercentage │──No──► Feature DISABLED
└────────────┬──────────────┘
             │ Yes
             ▼
        Feature ENABLED
```

### 16.3 Deterministic Rollout

The rollout is **deterministic** (not random):
- Same tenant always gets same result for same flag
- Based on hash of `tenantId + flagName`
- Ensures consistent user experience

### 16.4 Real-World Use Cases

| Scenario | How to Configure |
|----------|-----------------|
| Beta feature for select customers | `enabledTenants: ["tnt_customer1", "tnt_customer2"]` |
| Pro-only feature | `enabledTiers: ["pro", "enterprise"]` |
| Gradual rollout | `rolloutPercentage: 10` → `25` → `50` → `100` |
| Kill switch | Set `active: false` to disable for everyone |

### 16.5 Feature Flag Endpoints (Admin Only)

```bash
# Create flag
POST /api/admin/flags
{
  "name": "new_editor",
  "enabledTiers": ["pro"],
  "rolloutPercentage": 10
}

# Update flag (increase rollout)
PATCH /api/admin/flags/{id}
{ "rolloutPercentage": 50 }

# List all flags
GET /api/admin/flags

# Check if feature enabled (used by authorization)
# Internal: flagService.featureEnabled("new_editor", {tenantId, tier})
```

---

## 17. Admin Features: Overrides

Overrides allow admins to **grant exceptions** to normal rules.

### 17.1 Override Types

| Type | Purpose | Example Value |
|------|---------|---------------|
| `quota_boost` | Add extra API calls | `"1000000"` (add 1M calls) |
| `tier_upgrade` | Temporarily upgrade tier | `"enterprise"` |
| `feature_grant` | Grant specific feature | `"advanced_analytics"` |

### 17.2 Override Model

```
Override {
  tenantId: "tnt_xyz789"
  type: "quota_boost"
  value: "500000"
  reason: "Customer success promo"
  grantedBy: "admin@company.com"
  expiresAt: 1735689600           // Optional expiration
}
```

### 17.3 How Overrides Are Applied

```
Authorization Request
        │
        ▼
┌─────────────────────────┐
│ Fetch active overrides  │
│ for this tenant         │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                   APPLY OVERRIDES                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  tier_upgrade?  ──► Treat tenant as higher tier              │
│                     (Original: free → Effective: pro)        │
│                                                              │
│  feature_grant? ──► Feature enabled regardless of tier/flag  │
│                                                              │
│  quota_boost?   ──► Add extra units to quota limit           │
│                     (100k + 500k boost = 600k effective)     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
    Continue authorization with modified values
```

### 17.4 Real-World Use Cases

| Scenario | Override Type |
|----------|--------------|
| Give trial customer Pro features | `tier_upgrade` to "pro" |
| Promotional quota increase | `quota_boost` of 1,000,000 |
| Early access to beta feature | `feature_grant` for feature name |
| Enterprise POC evaluation | `tier_upgrade` to "enterprise" with expiration |

### 17.5 Override Endpoints (Admin Only)

```bash
# Create override
POST /api/admin/overrides
{
  "tenantId": "tnt_xyz789",
  "type": "quota_boost",
  "value": "500000",
  "reason": "Q4 promotion",
  "expiresInSeconds": 2592000  # 30 days
}

# List overrides for tenant
GET /api/admin/overrides?tenantId=tnt_xyz789

# Get active overrides (non-expired)
GET /api/admin/overrides/{tenantId}/active

# Manually expire an override
POST /api/admin/overrides/{id}/expire

# Delete override
DELETE /api/admin/overrides/{id}
```

---

## 18. Webhook System

Webhooks notify external systems when **events occur** in Orkait Auth.

### 18.1 Supported Events

| Event | When Triggered |
|-------|---------------|
| `subscription.upgraded` | Tenant upgrades tier |
| `subscription.downgraded` | Tenant downgrades tier |
| `subscription.cancelled` | Subscription cancelled |
| `user.added_to_tenant` | User joins tenant |
| `user.removed_from_tenant` | User removed from tenant |
| `api_key.created` | New API key created |
| `api_key.revoked` | API key revoked |
| `quota.exceeded` | Tenant hits quota limit |
| `quota.warning` | Tenant at 80% of quota |
| `*` | Wildcard: receive ALL events |

### 18.2 Webhook Registration

```
Tenant Admin              Frontend                Orkait Auth
    │                         │                        │
    │  "Notify me when       │                        │
    │   quota exceeded"      │                        │
    │ ───────────────────────►│                        │
    │                         │ POST /api/webhooks    │
    │                         │ {url, events, secret} │
    │                         │───────────────────────►│
    │                         │                        │
    │                         │                        │  Store endpoint
    │                         │                        │
    │                         │ {webhookId}            │
    │                         │◄───────────────────────│
```

### 18.3 Event Delivery Flow

```
┌────────────────────┐
│  Event Occurs      │  (e.g., quota exceeded)
│  in Orkait Auth    │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Find all webhooks │  Query: active webhooks subscribed
│  subscribed to     │         to "quota.exceeded" or "*"
│  this event        │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Create webhook    │  Status: pending
│  event record      │  Attempts: 0
└─────────┬──────────┘
          │
          ▼ (async/scheduled)
┌────────────────────┐
│  Deliver to URL    │  POST to registered URL
│  with payload      │  Include HMAC signature if secret set
└─────────┬──────────┘
          │
          ├──── Success ──► Status: delivered
          │
          └──── Failure ──► Status: failed, increment attempts
                            (retry logic can be added)
```

### 18.4 Webhook Payload Example

```json
POST https://your-app.com/webhooks/orkait
Content-Type: application/json
X-Webhook-Signature: sha256=abc123...  (if secret configured)

{
  "event": "quota.exceeded",
  "timestamp": "2024-01-15T10:30:00Z",
  "tenantId": "tnt_xyz789",
  "payload": {
    "limit": 10000,
    "used": 10001,
    "period": "2024-01"
  }
}
```

### 18.5 Webhook Endpoints

```bash
# List available event types
GET /api/webhooks/events

# Register webhook
POST /api/webhooks
{
  "url": "https://your-app.com/webhooks/orkait",
  "events": ["quota.exceeded", "subscription.upgraded"],
  "secret": "whsec_abc123"  # Optional, for HMAC validation
}

# List your webhooks
GET /api/webhooks

# Update webhook
PATCH /api/webhooks/{id}
{ "events": ["*"], "active": true }

# Delete webhook
DELETE /api/webhooks/{id}
```

### 18.6 Real-World Use Cases

| Use Case | Events to Subscribe |
|----------|---------------------|
| Billing sync | `subscription.upgraded`, `subscription.downgraded` |
| Usage alerts | `quota.warning`, `quota.exceeded` |
| Audit logging | `*` (all events) |
| User lifecycle | `user.added_to_tenant`, `user.removed_from_tenant` |
| Security monitoring | `api_key.created`, `api_key.revoked` |

---

## 19. Complete Integration: How Everything Works Together

Here's how all features integrate during a typical API request:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     AUTHORIZATION REQUEST                                │
│  POST /api/authorize                                                     │
│  {tenantId, userId, service, requiredFeature, quantity, apiKeyId}       │
└───────────────────────────────────────┬─────────────────────────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 1. SESSION CHECK                                                       │
│    Is JWT valid? Is session active?                                    │
└───────────────────────────────────────┬───────────────────────────────┘
                                        │ ✓
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 2. FETCH OVERRIDES                                                     │
│    Get active overrides for tenant (tier_upgrade, quota_boost, etc)   │
└───────────────────────────────────────┬───────────────────────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 3. SUBSCRIPTION CHECK                                                  │
│    Is subscription active?                                             │
│    Apply tier_upgrade override if present                              │
└───────────────────────────────────────┬───────────────────────────────┘
                                        │ ✓
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 4. SERVICE CHECK                                                       │
│    Is this service enabled for subscription?                           │
└───────────────────────────────────────┬───────────────────────────────┘
                                        │ ✓
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 5. FEATURE FLAG CHECK                                                  │
│    Is requiredFeature enabled for this tier?                          │
│    Check feature_grant overrides                                       │
│    Check deterministic rollout percentage                              │
└───────────────────────────────────────┬───────────────────────────────┘
                                        │ ✓
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 6. QUOTA CHECK                                                         │
│    Check API key limit (if apiKeyId provided)                         │
│    Check tenant global limit                                           │
│    Apply quota_boost overrides                                         │
│    Record usage if allowed                                             │
│    If at 80%: emit quota.warning webhook                              │
│    If exceeded: emit quota.exceeded webhook                            │
└───────────────────────────────────────┬───────────────────────────────┘
                                        │ ✓
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 7. ROLE CHECK                                                          │
│    Does user have requiredRole in this tenant?                        │
└───────────────────────────────────────┬───────────────────────────────┘
                                        │ ✓
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                           ✅ ALLOWED                                   │
│  Response: {allowed: true, tier, role, quotaRemaining, ...}           │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 20. Quick Reference: Admin vs User Operations

| Operation | Who Can Do It | Endpoint |
|-----------|--------------|----------|
| **Subscriptions** | | |
| View subscription | Tenant member | `GET /api/subscriptions/{tenantId}` |
| Upgrade tier | Tenant admin/owner | `POST /api/subscriptions/{tenantId}/upgrade` |
| Downgrade tier | Tenant admin/owner | `POST /api/subscriptions/{tenantId}/downgrade` |
| **Usage** | | |
| View usage | Tenant member | `GET /api/subscriptions/usage/{tenantId}` |
| Check quota | Any authenticated | `GET /api/subscriptions/usage/{tenantId}/quota` |
| Record usage | Internal only | `POST /api/subscriptions/usage/record` |
| **Feature Flags** | | |
| Create/Update/Delete flags | System admin | `/api/admin/flags/*` |
| Check if enabled | Internal (authorization) | via `AuthorizationService` |
| **Overrides** | | |
| Create/Update/Delete | System admin | `/api/admin/overrides/*` |
| View active | System admin | `GET /api/admin/overrides/{tenantId}/active` |
| **Webhooks** | | |
| Register/Update/Delete | Tenant admin/owner | `/api/webhooks/*` |
| List event types | Any authenticated | `GET /api/webhooks/events` |

---

That's the core of Orkait Auth! 🎉
