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
- Check if story has `cleanup` field in prd.json
- Note any `cleanupTasks`, `refactor`, `removeDeadCode`, `verifyWorking` flags

### 2. Implement the Story
- Write clean, typed TypeScript code
- Follow existing patterns in the codebase
- Use strong consistency for auth-path D1 reads
- Keep changes focused on the story scope
- Do NOT over-engineer
- **Avoid unnecessary comments** - code should be self-documenting

### 3. Run Quality Checks
```powershell
# Type check
npm run type-check  # or: npx tsc --noEmit

# Run tests
npm test

# Lint (if configured)
npm run lint
```

### 4. Cleanup & Refactor Phase (if `cleanup: true` or cleanup flags set)
**This phase runs AFTER implementation and BEFORE commit.**

#### 4a. Identify Dead Code
- Search for unused imports: `grep -r "import.*from"` and check if imported symbols are used
- Find unused functions: Search for function definitions that are never called
- Check for commented-out code blocks - remove them
- Look for duplicate code patterns that can be extracted

#### 4b. Refactor Logic
- Simplify complex conditionals
- Extract repeated patterns into helper functions
- Improve variable names for clarity
- Consolidate similar functions
- Remove redundant type assertions
- Optimize database queries (if applicable)

#### 4c. Remove Unnecessary Comments
- Remove obvious comments that just restate the code
- Keep only comments that explain "why", not "what"
- Remove TODO/FIXME comments if they're not actionable
- Remove commented-out code blocks

#### 4d. Verify Functionality
- **Manual verification**: Test the actual endpoint/function works
- **Integration check**: Ensure new code integrates with existing code
- **Edge cases**: Verify error handling works
- **Performance**: Check for obvious performance issues

#### 4e. Code Quality Checks
```powershell
# Check for unused exports
npm run type-check  # Will catch unused imports in strict mode

# Search for common dead code patterns
# - Unused variables
# - Unused functions
# - Duplicate code
```

#### 4f. Dead Code Detection Commands

Use these commands to find dead code:

```powershell
# Find unused imports (check TypeScript errors)
npm run type-check 2>&1 | Select-String "is declared but never used"

# Find TODO/FIXME comments
Select-String -Path "src/**/*.ts" -Pattern "TODO|FIXME|XXX" -Recurse

# Find commented-out code blocks (lines starting with // that look like code)
Select-String -Path "src/**/*.ts" -Pattern "^\\s*//\\s*(const|let|var|function|class|import|export)" -Recurse

# Find console.log/debug statements
Select-String -Path "src/**/*.ts" -Pattern "console\\.(log|debug|warn|error)" -Recurse

# Find duplicate function patterns (manual review)
# Look for similar function bodies that could be extracted
```

**Manual Review Checklist:**
- [ ] Check each import - is it actually used?
- [ ] Check each function - is it called anywhere?
- [ ] Check each variable - is it used after assignment?
- [ ] Review comments - do they add value or just restate code?
- [ ] Look for duplicate logic that could be extracted

### 5. Commit Changes (if checks pass)
```powershell
git add -A
git commit -m "feat: [STORY_ID] <brief description>"
```

If cleanup was performed:
```powershell
git commit -m "feat: [STORY_ID] <brief description> + cleanup"
```

### 6. Update prd.json
Read the current prd.json, find the story by ID, set `"passes": true`:

```typescript
// In prd.json, update the story:
{
  "id": "STORY_ID",
  "title": "...",
  "passes": true,  // <-- set this to true
  "cleaned": true  // <-- set this if cleanup was performed
}
```

### 7. Log to progress.txt
Append learnings to progress.txt:
```
[TIMESTAMP] STORY_ID completed
- What was implemented
- Any issues encountered
- Patterns discovered
- Cleanup performed: [list what was cleaned]
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

## Cleanup Patterns & Guidelines

### When to Cleanup
- **After each story** if `cleanup: true` is set in prd.json
- **Before major commits** - always do a quick cleanup pass
- **When refactoring** - cleanup is part of refactoring

### Dead Code Detection
1. **Unused Imports**
   ```typescript
   // BAD
   import { unusedFunction, usedFunction } from './utils';
   // Only usedFunction is used
   
   // GOOD
   import { usedFunction } from './utils';
   ```

2. **Unused Functions**
   - Search for function definitions
   - Check if they're exported and used elsewhere
   - Remove if only defined but never called

3. **Commented Code**
   ```typescript
   // BAD - remove commented code
   // const oldWay = doSomething();
   const newWay = doSomethingBetter();
   
   // GOOD - just the active code
   const newWay = doSomethingBetter();
   ```

4. **Redundant Comments**
   ```typescript
   // BAD
   // This function gets the user by ID
   async getUser(id: string) { ... }
   
   // GOOD - function name is self-explanatory
   async getUser(id: string) { ... }
   
   // GOOD - explains WHY, not WHAT
   // Uses strong consistency to prevent race conditions in auth checks
   async getUser(id: string) { ... }
   ```

### Refactoring Guidelines
1. **Extract Repeated Patterns**
   ```typescript
   // BAD - repeated pattern
   if (result.success && result.data) {
     return c.json({ success: true, data: result.data });
   }
   return c.json({ success: false, error: result.error }, 400);
   
   // GOOD - extracted helper
   return handleServiceResult(c, result);
   ```

2. **Simplify Conditionals**
   ```typescript
   // BAD
   if (user !== null && user !== undefined && user.active === true) { ... }
   
   // GOOD
   if (user?.active) { ... }
   ```

3. **Improve Variable Names**
   ```typescript
   // BAD
   const d = await getData();
   const r = process(d);
   
   // GOOD
   const userData = await getUserData();
   const processedResult = processUserData(userData);
   ```

### Verification Checklist
- [ ] Endpoint responds correctly (test with curl/Postman)
- [ ] Error cases handled properly
- [ ] TypeScript compiles without errors
- [ ] Tests pass
- [ ] No console.log or debug statements left
- [ ] No TODO/FIXME comments (unless documented in progress.txt)

## PRD.json Cleanup Fields

Each story in prd.json can have cleanup-related fields:

```json
{
  "id": "STORY-001",
  "title": "...",
  "description": "...",
  "acceptanceCriteria": [...],
  "passes": false,
  "priority": 1,
  "cleanup": true,                    // Enable cleanup phase
  "cleanupTasks": [                   // Specific cleanup tasks
    "removeDeadCode",
    "refactorLogic",
    "removeComments",
    "verifyWorking"
  ],
  "refactor": true,                   // Enable refactoring
  "removeDeadCode": true,             // Remove unused code
  "verifyWorking": true               // Verify functionality works
}
```

**Cleanup Flags:**
- `cleanup: true` - Enable full cleanup phase
- `cleanupTasks: []` - Array of specific cleanup tasks to perform
- `refactor: true` - Rewrite logic in better way
- `removeDeadCode: true` - Remove unused imports, functions, variables
- `removeComments: true` - Remove unnecessary comments
- `verifyWorking: true` - Verify the actual thing works (manual testing)

## Important Rules

1. **One story at a time** - Focus only on the current story
2. **No partial commits** - Only commit if all checks pass
3. **Type safety** - All code must pass TypeScript checks
4. **Test coverage** - Add tests for new functionality
5. **Strong consistency** - Use for ALL auth-related D1 reads
6. **Keep it simple** - Minimal implementation that satisfies acceptance criteria
7. **Cleanup before commit** - Always do cleanup pass if `cleanup: true` is set

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
- [ ] **Cleanup phase completed** (if `cleanup: true` or cleanup flags set)
  - [ ] Dead code removed
  - [ ] Logic refactored (if needed)
  - [ ] Unnecessary comments removed
  - [ ] Functionality verified to work
- [ ] Changes committed to git
- [ ] `prd.json` updated with `passes: true` (and `cleaned: true` if cleanup done)
- [ ] `progress.txt` updated with learnings

Then EXIT. The loop will start a fresh context for the next story.

## Cleanup Example

Example story with cleanup enabled:

```json
{
  "id": "FEATURE-001",
  "title": "Add new feature",
  "description": "...",
  "acceptanceCriteria": [...],
  "passes": false,
  "priority": 10,
  "cleanup": true,
  "cleanupTasks": [
    "removeDeadCode",
    "refactorLogic",
    "removeComments",
    "verifyWorking"
  ]
}
```

When processing this story:
1. Implement the feature
2. Run quality checks
3. **Perform cleanup phase:**
   - Remove unused imports/functions
   - Refactor complex logic
   - Remove unnecessary comments
   - Verify endpoint works with actual request
4. Commit with cleanup note
5. Mark `cleaned: true` in prd.json

## Adding Cleanup to Existing Stories

To add cleanup to an existing story in prd.json:

1. **Find the story** by ID
2. **Add cleanup fields:**
   ```json
   {
     "id": "EXISTING-STORY",
     "passes": false,
     "cleanup": true,  // Add this
     "cleanupTasks": ["removeDeadCode", "refactorLogic"]  // Add this
   }
   ```
3. **When story is processed**, cleanup phase will run automatically
4. **After cleanup**, set `"cleaned": true` in addition to `"passes": true`

### Quick Cleanup Flags

For quick cleanup without full phase:
```json
{
  "removeDeadCode": true,  // Just remove unused code
  "removeComments": true   // Just remove comments
}
```

For full refactoring:
```json
{
  "cleanup": true,
  "refactor": true,
  "verifyWorking": true
}
```
