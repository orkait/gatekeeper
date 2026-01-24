# Orkait Auth

A modern authentication and subscription management microservice built on Cloudflare Workers with TypeScript.

## Features

- **Email/Password Authentication** - Secure registration and login with PBKDF2 password hashing
- **Google OAuth** - Seamless Google Sign-In integration with automatic account linking
- **JWT Token Management** - Access tokens (15 min) and refresh tokens (7 days) with rotation
- **Multi-device Logout** - Single session or all sessions logout support
- **Subscription Management** - Multi-tenant SaaS subscription tiers (infrastructure ready)
- **API Key Generation** - Programmatic access credentials (infrastructure ready)
- **Usage Tracking** - Quota tracking per billing period (infrastructure ready)
- **Webhook System** - Event notification delivery (infrastructure ready)

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (serverless edge computing)
- **Framework**: [Hono](https://hono.dev/) (lightweight web framework)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite-based distributed database)
- **Language**: TypeScript (strict mode)
- **Validation**: [Zod](https://zod.dev/) (runtime schema validation)

## Project Structure

```
orka-auth/
├── src/
│   ├── adapters/           # Storage abstraction layer
│   │   ├── adapter.ts      # Interface & factory pattern
│   │   ├── d1_adapter.ts   # Cloudflare D1 implementation
│   │   └── memory_adapter.ts # In-memory storage (testing)
│   ├── middleware/         # Request middleware
│   │   ├── auth.ts         # JWT verification
│   │   ├── cors.ts         # CORS configuration
│   │   ├── error-handler.ts # Centralized error handling
│   │   ├── logger.ts       # Request logging
│   │   └── service-injector.ts # Dependency injection
│   ├── routes/             # API route handlers
│   │   ├── index.ts        # Route aggregation
│   │   └── auth.routes.ts  # Authentication endpoints
│   ├── services/           # Business logic
│   │   └── auth.service.ts # Core authentication service
│   ├── schemas/            # Input validation
│   │   └── auth.schema.ts  # Zod validation schemas
│   ├── types.ts            # TypeScript interfaces
│   ├── env.ts              # Environment configuration
│   ├── server.ts           # App setup & middleware chain
│   └── index.ts            # Entry point
├── migrations/
│   └── 0001_init.sql       # Database schema (8 tables)
├── wrangler.toml           # Cloudflare Workers config
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- Cloudflare account (for deployment)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd orka-auth

# Install dependencies
npm install
```

### Configuration

Create environment variables in `wrangler.toml` or via Cloudflare dashboard:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret key for JWT signing |
| `INTERNAL_SECRET` | Yes | - | Internal API validation key |
| `ENVIRONMENT` | No | `production` | Environment (production/development/staging/test) |
| `JWT_EXPIRES_IN` | No | `900` | Access token expiry in seconds (15 min) |
| `REFRESH_TOKEN_EXPIRES_IN` | No | `604800` | Refresh token expiry in seconds (7 days) |
| `GOOGLE_CLIENT_ID` | No | - | Google OAuth client ID |
| `ALLOWED_ORIGINS` | No | `*` | CORS allowed origins (comma-separated) |
| `STORAGE_ADAPTER` | No | `auto` | Storage adapter (memory/d1/auto) |

### Local Development

```bash
# Initialize local D1 database
npm run db:init:local

# Start development server
npm run dev
```

### Deployment

```bash
# Initialize production D1 database
npm run db:init:prod

# Deploy to Cloudflare Workers
npm run deploy
```

## API Reference

### Base URL

```
Production: https://orkait-auth.<your-subdomain>.workers.dev
Local: http://localhost:8787
```

### Endpoints

#### Health Check

```http
GET /api/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "service": "orkait-auth"
}
```

#### Sign Up

```http
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"  // optional
}
```

Response (201):

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "rt_...",
    "expiresIn": 900,
    "user": {
      "id": "usr_...",
      "email": "user@example.com",
      "name": "John Doe",
      "status": "active"
    }
  }
}
```

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

Response (200): Same as signup

#### Google OAuth

```http
POST /api/auth/google
Content-Type: application/json

{
  "idToken": "<JWT from Google Sign-In SDK>"
}
```

Response (200): Same as signup

#### Refresh Token

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "rt_..."
}
```

Response (200): Same as signup (new token pair)

#### Logout (Single Session)

```http
POST /api/auth/logout
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "refreshToken": "rt_..."
}
```

Response (200):

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### Logout All Sessions

```http
POST /api/auth/logout-all
Authorization: Bearer <accessToken>
```

Response (200):

```json
{
  "success": true,
  "message": "Logged out from all devices"
}
```

### Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "details": {},  // optional, for validation errors
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/auth/login"
}
```

| Status | Description |
|--------|-------------|
| 400 | Bad Request (validation error, duplicate email) |
| 401 | Unauthorized (invalid credentials, expired token) |
| 404 | Not Found |
| 500 | Internal Server Error |

## Authentication Flow

### Email/Password Flow

1. Client calls `POST /api/auth/signup` with email, password
2. Server hashes password with PBKDF2 (100k iterations)
3. Server creates user and generates JWT access token + refresh token
4. Client stores tokens and uses access token for authenticated requests

### Token Refresh Flow

1. Access token expires after 15 minutes
2. Client calls `POST /api/auth/refresh` with refresh token
3. Server validates refresh token and issues new token pair
4. Old refresh token is revoked (single-use)

### Google OAuth Flow

1. Client obtains ID token from Google Sign-In SDK
2. Client calls `POST /api/auth/google` with ID token
3. Server validates token (audience, issuer, expiration)
4. Server creates/links user account and returns token pair

## Database Schema

The database includes 8 tables:

- **users** - User accounts and profiles
- **api_products** - SaaS product definitions
- **subscription_tiers** - Pricing tiers per product
- **subscriptions** - User subscriptions to products
- **api_keys** - Generated API credentials
- **usage** - Quota tracking per billing period
- **webhook_configs** - User webhook subscriptions
- **webhook_deliveries** - Webhook delivery attempts
- **refresh_tokens** - Session token management

## Security Features

- **Password Hashing**: PBKDF2-SHA256 with 100,000 iterations and random salt
- **JWT Tokens**: HS256 HMAC signatures with Web Crypto API
- **Token Rotation**: Refresh tokens are single-use (revoked after each use)
- **Hash Storage**: Tokens stored as SHA-256 hashes (not plaintext)
- **Input Validation**: Zod schemas validate all inputs

## Development

### Scripts

```bash
npm run dev          # Start local development server
npm run deploy       # Deploy to Cloudflare Workers
npm run db:init:local # Initialize local D1 database
npm run db:init:prod  # Initialize production D1 database
```

### Testing

The project uses Vitest for testing. The memory adapter enables testing without a database connection.

```bash
npm test
```

## Architecture

### Design Patterns

- **Adapter Pattern** - Storage abstraction with D1 and memory implementations
- **Dependency Injection** - Services injected via middleware
- **Middleware Chain** - Error handling, logging, CORS, service injection
- **Service Layer** - Business logic isolated in services

### Middleware Stack

1. Error Handler (catches all exceptions)
2. Request Logger (logs method, path, status, duration)
3. CORS Middleware (configurable origins)
4. Service Injector (provides AuthService)
5. Auth Middleware (on protected routes only)

## License

MIT
