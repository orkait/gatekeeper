# Orkait Auth

A serverless control plane for authentication, per-service sessions, subscriptions, quotas, and authorization decisions for multi-service products. Built on Cloudflare Workers with TypeScript.

## Features

### Authentication & Sessions
- **Email/Password Authentication** - Secure registration and login with PBKDF2 password hashing
- **Google OAuth** - Seamless Google Sign-In integration with automatic account linking
- **Per-Service Sessions** - One session per user+tenant+service combination
- **JWT Token Management** - Access tokens with service-scoped audiences
- **JWKS Endpoint** - Public key distribution for external JWT verification

### Multi-Tenancy
- **Tenant Management** - Full CRUD for tenants with quota limits
- **Role-Based Access** - Owner, admin, and member roles per tenant
- **User Management** - Add/remove users, update roles

### API Keys
- **Secure Generation** - SHA-256 hashed storage, plaintext shown once
- **Scoped Access** - Per-key scopes and quota limits
- **JWT Exchange** - Exchange API keys for short-lived JWTs

### Subscriptions & Quotas
- **Tier Management** - Free, pro, enterprise subscription tiers
- **Per-Service Enablement** - Enable/disable services per subscription
- **Hierarchical Quotas** - Per-key limits, then global tenant limits
- **Usage Tracking** - Idempotent usage recording with events

### Feature Flags & Overrides
- **Feature Flags** - Tier-based, tenant-specific, and rollout percentage
- **Admin Overrides** - Quota boosts, tier upgrades, feature grants
- **Deterministic Rollouts** - Consistent results based on tenant ID

### Authorization
- **Central authorize()** - Single function for all authorization decisions
- **Multi-Factor Checks** - Session, subscription, service, feature, quota, RBAC
- **KV Caching** - Cached decisions with D1 fallback support

### Webhooks
- **Endpoint Registration** - Per-tenant webhook URLs
- **Event Emission** - subscription.*, user.*, api_key.*, quota.*
- **Delivery Tracking** - Pending, delivered, failed statuses

### Operations
- **Structured Logging** - JSON logs with request correlation
- **R2 Backups** - Scheduled daily backups to R2
- **Strong Consistency** - D1 sessions for auth-critical reads

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (serverless edge computing)
- **Framework**: [Hono](https://hono.dev/) (lightweight web framework)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite-based distributed database)
- **Cache**: [Cloudflare KV](https://developers.cloudflare.com/kv/) (auth decision caching)
- **Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) (backup storage)
- **Language**: TypeScript (strict mode)
- **Validation**: [Zod](https://zod.dev/) (runtime schema validation)
- **JWT**: [jose](https://github.com/panva/jose) (JWT signing/verification)

## Project Structure

```
orka-auth/
├── src/
│   ├── adapters/           # Storage abstraction layer
│   ├── middleware/         # Request middleware
│   │   ├── auth.ts         # JWT verification
│   │   ├── cors.ts         # CORS configuration
│   │   ├── error-handler.ts # Centralized error handling
│   │   ├── logger.ts       # Structured JSON logging
│   │   └── service-injector.ts
│   ├── repositories/       # Database access layer
│   │   └── auth.repository.ts # Typed SQL queries
│   ├── routes/             # API route handlers
│   │   ├── admin.routes.ts # Feature flags & overrides
│   │   ├── auth.routes.ts  # Authentication
│   │   ├── authorize.routes.ts # Authorization endpoint
│   │   ├── keys.routes.ts  # API key management
│   │   ├── subscription.routes.ts # Subscriptions & usage
│   │   ├── tenant.routes.ts # Tenant management
│   │   └── webhook.routes.ts # Webhook management
│   ├── scheduled/          # Scheduled workers
│   │   └── backup.ts       # R2 backup worker
│   ├── services/           # Business logic
│   │   ├── apikey.service.ts
│   │   ├── auth.service.ts
│   │   ├── authorization.service.ts # Central authorize()
│   │   ├── featureflag.service.ts
│   │   ├── jwt.service.ts
│   │   ├── override.service.ts
│   │   ├── quota.service.ts
│   │   ├── session.service.ts
│   │   ├── subscription.service.ts
│   │   ├── tenant.service.ts
│   │   └── webhook.service.ts
│   ├── schemas/            # Zod validation schemas
│   ├── utils/              # Utilities
│   │   ├── cache.ts        # KV cache helpers
│   │   └── db.ts           # D1 strong consistency
│   ├── types.ts
│   ├── env.ts
│   ├── server.ts
│   └── index.ts
├── migrations/             # D1 schema migrations
│   ├── 0001_init.sql
│   ├── 0002_core_tables.sql
│   ├── 0003_api_keys_usage.sql
│   ├── 0004_features_webhooks.sql
│   ├── 0005_tenant_subscriptions.sql
│   └── 0006_tenant_subscription_items.sql
├── wrangler.toml           # Cloudflare Workers config
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account

### Installation

```bash
git clone <repository-url>
cd orka-auth
npm install
```

### Configuration

Create secrets via Wrangler:

```bash
wrangler secret put JWT_SECRET
wrangler secret put INTERNAL_SECRET
```

Environment variables in `wrangler.toml`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret for JWT signing |
| `INTERNAL_SECRET` | Yes | - | Internal API authentication |
| `ENVIRONMENT` | No | `production` | Environment mode |
| `JWT_EXPIRES_IN` | No | `900` | Access token expiry (seconds) |
| `REFRESH_TOKEN_EXPIRES_IN` | No | `604800` | Refresh token expiry (seconds) |
| `GOOGLE_CLIENT_ID` | No | - | Google OAuth client ID |
| `ALLOWED_ORIGINS` | No | `*` | CORS origins (comma-separated) |
| `RSA_PRIVATE_KEY` | No | - | RSA private key for JWKS |
| `RSA_PUBLIC_KEY` | No | - | RSA public key for JWKS |

### Local Development

```bash
# Initialize local D1 database
npm run db:init:local

# Start development server
npm run dev
```

### Deployment

```bash
# Create D1 database
wrangler d1 create orkait_auth

# Create KV namespace
wrangler kv:namespace create AUTH_CACHE

# Create R2 bucket
wrangler r2 bucket create orkait-auth-backups

# Update wrangler.toml with IDs

# Deploy
npm run deploy
```

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/signup` | POST | Register new user |
| `/api/auth/login` | POST | Email/password login |
| `/api/auth/google` | POST | Google OAuth login |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/logout` | POST | Logout single session |
| `/api/auth/logout-all` | POST | Logout all sessions |
| `/api/auth/apikey` | POST | Exchange API key for JWT |

### Authorization

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/authorize` | POST | Central authorization check |

Request:
```json
{
  "action": "read",
  "resource": "documents/123",
  "context": {
    "tenantId": "tenant_xxx",
    "service": "documents",
    "requiredFeature": "advanced_export",
    "requiredRole": "admin"
  }
}
```

### Tenants

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tenants` | POST | Create tenant |
| `/api/tenants/:id` | GET | Get tenant |
| `/api/tenants/:id` | PATCH | Update tenant |
| `/api/tenants/:id` | DELETE | Delete tenant |
| `/api/tenants/:id/users` | GET | List tenant users |
| `/api/tenants/:id/users` | POST | Add user to tenant |
| `/api/tenants/:id/users/:userId` | PATCH | Update user role |
| `/api/tenants/:id/users/:userId` | DELETE | Remove user |
| `/api/tenants/me/list` | GET | List user's tenants |

### API Keys

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/keys` | POST | Create API key |
| `/api/keys` | GET | List API keys |
| `/api/keys/:id` | GET | Get API key |
| `/api/keys/:id` | PATCH | Update API key |
| `/api/keys/:id` | DELETE | Revoke API key |

### Subscriptions & Usage

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/subscriptions/:tenantId` | GET | Get subscription |
| `/api/subscriptions/:tenantId/upgrade` | POST | Upgrade tier |
| `/api/subscriptions/:tenantId/downgrade` | POST | Downgrade tier |
| `/api/usage/:tenantId` | GET | Get usage summary |
| `/api/usage/:tenantId/events` | GET | Get usage events |
| `/api/usage/:tenantId/quota` | GET | Check quota status |
| `/api/usage/record` | POST | Record usage (internal) |

### Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhooks` | POST | Register webhook |
| `/api/webhooks` | GET | List webhooks |
| `/api/webhooks/:id` | GET | Get webhook |
| `/api/webhooks/:id` | PATCH | Update webhook |
| `/api/webhooks/:id` | DELETE | Delete webhook |
| `/api/webhooks/events` | GET | List event types |

### Admin (Feature Flags & Overrides)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/flags` | GET | List feature flags |
| `/api/admin/flags` | POST | Create feature flag |
| `/api/admin/flags/:id` | GET | Get feature flag |
| `/api/admin/flags/:id` | PATCH | Update feature flag |
| `/api/admin/flags/:id` | DELETE | Delete feature flag |
| `/api/admin/flags/:id/toggle` | POST | Toggle flag |
| `/api/admin/overrides` | GET | List overrides |
| `/api/admin/overrides` | POST | Create override |
| `/api/admin/overrides/:id` | DELETE | Delete override |
| `/api/admin/overrides/:id/expire` | POST | Expire override |

### JWKS

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/jwks.json` | GET | Get public keys |

## Database Schema

### Core Tables
- **users** - User accounts and profiles
- **tenants** - Multi-tenant organizations
- **tenant_users** - User-tenant relationships with roles
- **sessions** - Per-service sessions with refresh tokens

### Subscription Tables
- **subscriptions** - Tenant subscriptions with tiers
- **tenant_subscription_items** - Per-service enablement

### API & Usage Tables
- **api_keys** - Hashed API keys with scopes/quotas
- **usage_events** - Idempotent usage tracking

### Feature & Admin Tables
- **feature_flags** - Feature flag configurations
- **admin_overrides** - Quota/tier/feature overrides

### Webhook Tables
- **webhook_endpoints** - Registered webhook URLs
- **webhook_events** - Event delivery tracking

## Backup & Restore

### Automated Backups

Backups run daily at 2 AM UTC via scheduled trigger:
- Tables: users, tenants, subscriptions, api_keys, sessions, etc.
- Location: `backups/{table}/{timestamp}.json` in R2

### Manual Restore

```typescript
import { restoreFromBackup } from './src/scheduled/backup';

// Restore a specific table
await restoreFromBackup(bucket, db, 'backups/users/2026-01-25T02-00-00-000Z.json');
```

**Warning**: Restore deletes existing data before inserting backup data.

## Testing

Comprehensive test suite with Vitest covering services, repositories, adapters, and integration flows.

### Quick Start

```bash
# Run all tests in watch mode (development)
npm test -- --watch

# Run all tests once
npm run test:run

# Run with coverage report
npm run test:coverage

# Run specific test file
npm test src/services/__tests__/tenant.service.test.ts

# Type check
npm run type-check
```

### Test Structure

```
src/
├── __tests__/
│   ├── helpers/            # Mock factories and fixtures
│   ├── integration.test.ts # Cross-service tests
│   └── services.test.ts    # Service layer tests
└── services/
    └── __tests__/
        └── *.test.ts       # Unit tests co-located with code
```

### Current Coverage

```
Overall: 33.49% (Target: 75%)
Services: 32.06%
  - TenantService: 53.65% ✅
  - QuotaService: 52%
  - Utils: 80% ✅
```

### Documentation

- **[VITEST_SETUP.md](./VITEST_SETUP.md)** - Setup summary and getting started
- **[TESTING.md](./TESTING.md)** - Comprehensive testing strategy
- **[TEST_PLAN.md](./TEST_PLAN.md)** - Phased implementation plan
- **[TESTING_QUICKREF.md](./TESTING_QUICKREF.md)** - Quick reference guide

### Test Priorities

**HIGH PRIORITY** (Start here):
1. AuthService - Core authentication
2. SessionService - Session management
3. JWTService - Token handling
4. QuotaService - Usage tracking
5. AuthorizationService - Permissions

See [TEST_PLAN.md](./TEST_PLAN.md) for complete implementation roadmap.

## Security

- **Password Hashing**: PBKDF2-SHA256, 100k iterations
- **JWT Signing**: HS256 (symmetric) or RS256 (asymmetric via JWKS)
- **API Key Hashing**: SHA-256, plaintext never stored
- **Token Rotation**: Refresh tokens are single-use
- **Strong Consistency**: D1 sessions for auth-critical reads
- **KV Fallback**: Degraded mode with cached decisions on D1 outage

## License

MIT
