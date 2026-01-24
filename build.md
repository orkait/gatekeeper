# What We Are Building (Final Plan)

## One-line definition

> **A serverless control plane that centralizes authentication, per-service sessions, subscriptions, quotas, and authorization decisions for multi-service products.**

---

## The core problem we solve

Modern products have:

* multiple services
* shared users and tenants
* paid plans
* quotas
* permissions that change over time

Most systems either:

* hardcode this logic into every service, or
* stuff it into JWTs, or
* put auth on the hot path

All of these break at scale.

**We solve this by separating identity from policy.**

---

## The mental model (simple)

* **JWT answers:** *Who is this and which service is this token for?*
* **authorize() answers:** *Is this action allowed right now under current business rules?*

Identity is stable.
Policy is dynamic.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Cloudflare Workers | Sub-ms cold starts, global edge, serverless-native |
| Language | TypeScript | Type safety for auth logic, portable |
| Framework | Hono | ~14kb, built for edge/serverless |
| Database | Cloudflare D1 | Zero connection pooling, native Workers integration, cost-effective |
| Database Access | Raw D1 + Typed Repository | Explicit SQL, full D1 control (consistency, batch), no ORM overhead |
| JWT | jose | Works everywhere, handles JWKs |
| Cache/Fallback | Cloudflare KV | Auth decision cache, JWKS cache, D1 outage fallback |
| Secrets | Workers Secrets | Signing keys, API credentials |
| Webhooks | Cloudflare Queues | Reliable delivery with retries |
| Backups | Cloudflare R2 | Daily D1 exports |
| Monitoring | Workers Analytics / Axiom | Serverless-native observability |

---

## Database Access: No ORM

We use raw D1 API with typed repository wrappers. No ORM.

**Why:**

1. Queries are simple — 90% are single-table lookups
2. Auth code should be explicit and auditable
3. D1-specific features (strong consistency, batch) need direct access
4. No dependencies, no magic

**D1 Native API:**

```typescript
const db = env.DB; // D1Database binding

// Single row
const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();

// Multiple rows  
const sessions = await db.prepare('SELECT * FROM sessions WHERE tenant_id = ?').bind(tenantId).all();

// Mutations
await db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').bind(Date.now(), sessionId).run();

// Batch (atomic)
await db.batch([
  db.prepare('INSERT INTO sessions ...').bind(...),
  db.prepare('INSERT INTO refresh_tokens ...').bind(...),
]);
```

| Method | Returns | Use For |
|--------|---------|---------|
| `.first<T>()` | `T \| null` | Single row |
| `.all<T>()` | `{ results: T[] }` | Multiple rows |
| `.run()` | `{ meta }` | INSERT/UPDATE/DELETE |
| `db.batch([...])` | `[...]` | Atomic multi-statement |

**Typed Repository Pattern:**

```typescript
// types.ts
interface Session {
  id: string;
  user_id: string;
  tenant_id: string;
  service: string;
  expires_at: number;
  revoked_at: number | null;
}

// repository.ts
class AuthRepository {
  constructor(private db: D1Database) {}

  async getSession(id: string): Promise<Session | null> {
    return this.db
      .prepare('SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL')
      .bind(id)
      .first<Session>({ consistency: 'strong' });
  }

  async createSessionWithToken(session: NewSession, token: NewRefreshToken): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        'INSERT INTO sessions (id, user_id, tenant_id, service, expires_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(session.id, session.user_id, session.tenant_id, session.service, session.expires_at),
      this.db.prepare(
        'INSERT INTO refresh_tokens (id, session_id, token_hash) VALUES (?, ?, ?)'
      ).bind(token.id, token.session_id, token.token_hash),
    ]);
  }

  async revokeSession(id: string): Promise<void> {
    await this.db
      .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
      .bind(Date.now(), id)
      .run();
  }
}
```

This gives us type safety, explicit SQL, full D1 control, and a testable/swappable interface — without ORM complexity.

---

## Architecture (high level)

### Control Plane (this system)

Authoritative, low-QPS, serverless.

It owns:

* Users and tenants
* Per-service sessions
* Refresh tokens
* JWT issuance + JWKS
* Subscriptions and tiers
* Quotas and usage (hierarchical)
* Role-based access control
* Authorization decisions
* **API keys** (credential type)
* **Feature flags** (per-tenant enablement)
* **Admin overrides** (support exceptions)
* **Webhook events** (state change notifications)

It decides **if** something is allowed.

---

### Data Plane (each service)

High-QPS, stateless, independent.

It owns:

* Business logic
* Data storage
* Request execution

It:

* verifies JWTs locally
* calls authorize() only for gated actions
* executes or rejects
* **receives webhooks** from control plane

It decides **how** something happens.

---

## D1 Database: Constraints & Mitigations

D1 is a distributed SQLite database. Using it for auth requires understanding its behavior.

### Consistency Model

D1 uses single-writer primary with read replicas. Default reads may hit stale replicas.

**Risk:** Revoked API key still works for ~100-500ms during replication lag.

**Mitigation:** All auth-path reads use strong consistency.

```typescript
// REQUIRED: Strong consistency wrapper for all auth reads
function createAuthDB(env: Env) {
  return {
    async query<T>(sql: string, params: any[]): Promise<T> {
      return env.DB.prepare(sql)
        .bind(...params)
        .all({ consistency: 'strong' });
    }
  };
}
```

**Rule:** Never use default reads in authorize(), session validation, or quota checks.

---

### D1 Outage Handling

**Strategy:** Cache last-known-good auth decisions in KV.

```typescript
async function authorize(ctx: AuthContext): Promise<AuthResult> {
  const cacheKey = `auth:${ctx.tenantId}:${ctx.action}`;
  
  try {
    const result = await doAuthorize(ctx);
    // Cache successful decisions for 60s
    await env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 });
    return result;
  } catch (e) {
    // D1 down - check cache
    const cached = await env.KV.get(cacheKey, 'json');
    if (cached) {
      return { ...cached, degraded: true };
    }
    return { allowed: false, reason: 'service_unavailable' };
  }
}
```

---

### Backup & Recovery

**Daily automated backups to R2:**

```typescript
// Scheduled worker - runs daily
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    const tables = ['users', 'tenants', 'subscriptions', 'api_keys', 'sessions'];
    
    for (const table of tables) {
      const data = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      await env.BACKUP_BUCKET.put(
        `backups/${table}/${new Date().toISOString()}.json`,
        JSON.stringify(data.results)
      );
    }
  }
};
```

**Test restore process before you need it.**

---

### D1 Limits

| Limit | Value | Our Risk |
|-------|-------|----------|
| Max DB size | 10GB | Low (auth data is small) |
| Rows read/query | 1M | Low |
| Rows written/query | 100K | Low |
| Max bound parameters | 100 | Medium (batch operations) |

**Mitigation for batch operations:**

```typescript
async function batchGet<T>(db: D1Database, table: string, ids: string[]): Promise<T[]> {
  const results: T[] = [];
  const CHUNK_SIZE = 50;
  
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db
      .prepare(`SELECT * FROM ${table} WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all();
    results.push(...rows.results as T[]);
  }
  return results;
}
```

---

### Atomic Operations

D1 doesn't support transactions across queries. Use batch for atomicity.

```typescript
// WRONG - not atomic
await db.prepare('INSERT INTO sessions ...').run();
await db.prepare('INSERT INTO refresh_tokens ...').run(); // If this fails, inconsistent state

// CORRECT - atomic
await db.batch([
  db.prepare('INSERT INTO sessions (id, user_id, tenant_id) VALUES (?, ?, ?)')
    .bind(sessionId, userId, tenantId),
  db.prepare('INSERT INTO refresh_tokens (id, session_id, token_hash) VALUES (?, ?, ?)')
    .bind(tokenId, sessionId, tokenHash),
]);
```

---

### Quota Race Conditions

Concurrent requests may exceed quota slightly due to read-check-write races.

**Mitigation:** Enforce at 99% to absorb races.

```typescript
const QUOTA_BUFFER = 0.99;

function checkQuota(used: number, limit: number): boolean {
  return used < (limit * QUOTA_BUFFER);
}
```

This is acceptable for quota enforcement (not payment processing).

---

## Sessions & identity model

* One tenant
* One user
* **Multiple sessions**
* **One session per service**

This gives:

* per-service logout
* safe isolation
* clean audit trails
* no cross-service leaks

---

## Credential types

All credentials produce the same output: **a valid JWT**.

### User Sessions
- Created on login
- Auto-rotate on refresh
- Tied to specific service
- Expire in hours/days

### API Keys
- Machine-to-machine auth
- Long-lived (months)
- Explicitly scoped
- Optional per-key quotas

**Flow:**
```
1. Client sends API key
2. Control plane validates + issues JWT (15 min)
3. Client uses JWT for requests
4. Services verify JWT (same as session JWT)
```

---

## JWT design (frozen)

JWTs are:

* short-lived
* thin
* globally consistent
* policy-free

They contain only:

* user identity (or API key ID)
* tenant
* service audience
* session/credential reference

Optional context may exist, but never grants access.

**Session JWT:**
```json
{
  "sub": "user_123",
  "tenant_id": "tenant_xyz",
  "session_id": "sess_abc",
  "aud": "documents-service",
  "exp": 1234567890
}
```

**API Key JWT:**
```json
{
  "sub": "tenant_xyz",
  "api_key_id": "key_456",
  "scope": ["documents:read", "ai:write"],
  "aud": "ai-service",
  "exp": 1234567890
}
```

---

## Authorization model

`authorize()` is called **only** when:

* an action is paid
* an action consumes quota
* permissions matter
* subscription state matters
* feature flags need checking

Inside authorize():

1. validate session/API key
2. validate subscription
3. validate service enabled
4. **check feature flags**
5. **check quota (hierarchical)**
6. check RBAC
7. **apply admin overrides**
8. return allow/deny + usage metadata

Quota is checked **before** RBAC.

---

## Usage & quotas (hierarchical)

* Quotas are contractual
* Usage is tracked durably at **multiple levels**
* Increments are idempotent
* No in-memory counters
* No rate limiting

### Quota levels (checked in order):

1. **Per-API-key quota** (if key has limit)
   - Example: Dev key limited to 1,000 requests/month
   
2. **Global tenant quota** (always enforced)
   - Example: Tenant has 10,000 requests/month total
   - Sum of all keys can exceed global (oversubscription OK)

**Example:**
```
Tenant ABC (global: 10,000/month):
├─ API Key #1: 500/1,000 used
├─ API Key #2: 3,200/no limit
└─ API Key #3: 1,000/1,000 used (blocked)

Total: 4,700/10,000 global
```

Usage is metadata, not control flow.

---

## Feature Flags

Control feature availability per-tenant or tier.

**Use cases:**
- Beta testing with select customers
- Gradual rollouts
- Tier-based feature access
- A/B experiments

**Implementation:**
```javascript
// In authorize()
if (!featureEnabled("ai_assistant", tenant)) {
  return { allowed: false, reason: "feature_disabled" }
}

// Configuration
features: {
  ai_assistant: {
    enabled_for: ["tenant_abc", "tenant_xyz"],
    or_tier: ["pro", "enterprise"],
    rollout_percentage: 25
  }
}
```

**Why here:** Feature access is an entitlement. Belongs in the same authorization decision.

---

## Admin Overrides

Support team can bypass normal rules with full audit trail.

**Use cases:**
- Compensate for outages (extra quota)
- Sales demos (temporary tier upgrade)
- Emergency access restoration
- Beta access grants

**Implementation:**
```javascript
// Support dashboard creates
{
  tenant_id: "xyz",
  type: "quota_boost",
  amount: 10000,
  expires_at: "2025-02-01",
  reason: "Compensation for Jan 15 outage",
  granted_by: "support_agent_123"
}

// In authorize()
const overrides = getActiveOverrides(tenant_id);
const effectiveLimit = baseLimit + overrides.quota_boost;
```

**Audit:** Every override logged with who, what, why, when.

---

## Webhook Events

Notify services when control plane state changes.

**Events:**
- `subscription.upgraded`
- `subscription.downgraded`
- `user.added_to_tenant`
- `user.removed_from_tenant`
- `api_key.revoked`
- `quota.exceeded`
- `feature.enabled`
- `override.applied`

**Example flow:**
```
1. User downgrades Pro → Free
2. Control plane fires webhook:
   POST https://documents-service/webhooks
   { event: "subscription.downgraded", tenant_id: "xyz" }
3. Document service enforces new 5GB limit
```

**Why:** Keeps services in sync without polling. Critical for quota enforcement and feature cleanup.

---

## What this system is NOT

* Not an API gateway
* Not a rate limiter
* Not a traffic manager
* Not a business logic engine
* Not a fat auth service

---

## Why this design scales

* JWT keeps identity off the hot path
* authorize() is low-QPS
* Control Plane stays thin
* Policy stays centralized
* Services stay simple
* Serverless friendly
* Survives 10×, 100× growth

---

## The invariant that defines everything

> **Identity is proven locally.
> Entitlement is decided centrally.
> Execution happens at the service.**

If this stays true, the system stays correct.

---

## Database Schema (core tables)

```sql
-- Identity
users (id, email, ...)
tenants (id, name, global_quota_limit, ...)
tenant_users (tenant_id, user_id, role)

-- Sessions
sessions (id, user_id, tenant_id, service, expires_at, revoked_at)
refresh_tokens (id, session_id, token_hash, ...)

-- API Keys
api_keys (
  id, tenant_id, key_hash, name,
  scopes, quota_limit, quota_period,
  created_by, last_used_at, expires_at, revoked_at
)

-- Subscriptions
subscriptions (id, tenant_id, tier, status, current_period_end)
subscription_items (id, subscription_id, service, enabled)

-- Usage
usage_events (
  tenant_id, api_key_id, user_id,
  service, action, quantity, period, timestamp,
  idempotency_key
)

-- Features
feature_flags (
  id, name, enabled_tiers, enabled_tenants,
  rollout_percentage, active
)

-- Overrides
admin_overrides (
  id, tenant_id, type, value,
  reason, granted_by, expires_at, created_at
)

-- Webhooks
webhook_endpoints (id, tenant_id, url, events, active)
webhook_events (id, endpoint_id, event_type, payload, delivered_at)
```

---

## Day 1 Operational Requirements

Before shipping, implement:

| Requirement | Purpose |
|-------------|---------|
| Strong consistency wrapper | Prevent stale auth reads |
| KV fallback cache | Survive D1 outages |
| Structured logging | Debug "access denied" issues |
| Daily R2 backups | Disaster recovery |
| Restore runbook | Tested recovery process |

---

## What you actually built (truth)

You didn't build "auth".

You built:

> **An identity-aware entitlement and quota control plane for multi-service systems with hierarchical usage limits, feature gating, and programmatic policy overrides.**

That's a real platform.
