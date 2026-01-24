# Ralph Loop Instructions for Claude Code

You are operating in an autonomous development loop. Each iteration you:
1. Complete ONE user story from `prd.json`
2. Run quality checks
3. Commit changes
4. Update `prd.json` status
5. Log learnings to `progress.txt`

## Your Context

**Project:** orka-auth - A serverless control plane for authentication, sessions, subscriptions, quotas, and authorization.

**Tech Stack:**
- Runtime: Cloudflare Workers
- Framework: Hono
- Database: Cloudflare D1 (SQLite)
- Language: TypeScript
- Validation: Zod
- JWT: jose library

## Workflow for Each Story

### 1. Read the Story
The story details are provided in the prompt. Focus only on the current story.

### 2. Implement the Story
- Write clean, typed TypeScript code
- Follow existing patterns in the codebase
- Use strong consistency for auth-path D1 reads
- Keep changes focused on the story scope
- Do NOT over-engineer

### 3. Run Quality Checks
```powershell
# Type check
npm run typecheck  # or: npx tsc --noEmit

# Run tests
npm test

# Lint (if configured)
npm run lint
```

### 4. Commit Changes (if checks pass)
```powershell
git add -A
git commit -m "feat: [STORY_ID] <brief description>"
```

### 5. Update prd.json
Read the current prd.json, find the story by ID, set `"passes": true`:

```typescript
// In prd.json, update the story:
{
  "id": "STORY_ID",
  "title": "...",
  "passes": true  // <-- set this to true
}
```

### 6. Log to progress.txt
Append learnings to progress.txt:
```
[TIMESTAMP] STORY_ID completed
- What was implemented
- Any issues encountered
- Patterns discovered
```

## Code Patterns for This Project

### D1 Strong Consistency (REQUIRED for auth paths)
```typescript
const result = await db.prepare(sql).bind(...params).first<T>({ consistency: 'strong' });
```

### Typed Repository Pattern
```typescript
class AuthRepository {
  constructor(private db: D1Database) {}

  async getUser(id: string): Promise<User | null> {
    return this.db.prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<User>({ consistency: 'strong' });
  }
}
```

### Atomic Batch Operations
```typescript
await db.batch([
  db.prepare('INSERT INTO sessions ...').bind(...),
  db.prepare('INSERT INTO refresh_tokens ...').bind(...),
]);
```

### Zod Validation
```typescript
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
```

## Important Rules

1. **One story at a time** - Focus only on the current story
2. **No partial commits** - Only commit if all checks pass
3. **Type safety** - All code must pass TypeScript checks
4. **Test coverage** - Add tests for new functionality
5. **Strong consistency** - Use for ALL auth-related D1 reads
6. **Keep it simple** - Minimal implementation that satisfies acceptance criteria

## File Structure Reference
```
orka-auth/
├── src/
│   ├── adapters/       # Storage abstraction
│   ├── middleware/     # Request middleware
│   ├── routes/         # API route handlers
│   ├── services/       # Business logic
│   ├── schemas/        # Zod validation
│   ├── types.ts        # TypeScript interfaces
│   └── index.ts        # Entry point
├── migrations/         # D1 schema migrations
├── prd.json           # Task list (UPDATE THIS)
└── progress.txt       # Learning log (APPEND TO THIS)
```

## Exit Condition

You are DONE with this iteration when:
- [ ] Story implementation complete
- [ ] TypeScript compiles without errors
- [ ] Tests pass (or no breaking changes)
- [ ] Changes committed to git
- [ ] `prd.json` updated with `passes: true`
- [ ] `progress.txt` updated with learnings

Then EXIT. The loop will start a fresh context for the next story.
