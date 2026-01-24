# Ralph Loop Instructions for Claude Code

You are operating in an autonomous development loop. Each iteration you:
1. Complete ONE user story from `prd.json`
2. Run quality checks
3. Mark story as `passes: true`
4. **THEN complete verification subtasks BEFORE moving to next story**
5. Commit changes
6. Update `prd.json` status with `verified: true`
7. Log learnings to `progress.txt`

## IMPORTANT: Two-Phase Story Completion

### Phase 1: Implementation (marks `passes: true`)
- Implement the story
- Run basic quality checks (type-check, tests)
- Commit implementation
- Mark story with `"passes": true` in prd.json

### Phase 2: Verification (marks `verified: true`)
**BEFORE moving to the next story, complete ALL verification subtasks:**
1. **removeDeadCode**: Remove unused imports, functions, variables
2. **removeComments**: Remove unnecessary comments
3. **qualityCheck**: Run comprehensive quality checks (type-check, tests, lint)
4. **verifyWorking**: Verify actual functionality works with manual testing
5. **verified**: ONLY set to `true` when ALL above subtasks are complete

**The story is NOT fully complete until `verified: true` is set.**

## Workflow Diagram

```
Story from prd.json
       ↓
[Phase 1: Implementation]
       ↓
   Implement code
       ↓
   Run type-check
       ↓
   Run tests
       ↓
   Commit: "feat: STORY_ID implementation"
       ↓
   Mark: passes: true
       ↓
[Phase 2: Verification] ← REQUIRED before next story
       ↓
   Subtask 1: removeDeadCode
       ↓
   Subtask 2: removeComments
       ↓
   Subtask 3: qualityCheck
       ↓
   Subtask 4: verifyWorking
       ↓
   Commit: "feat: STORY_ID verified"
       ↓
   Mark: verified: true, removeDeadCode: true, removeComments: true, qualityCheck: true, verifyWorking: true
       ↓
   Log to progress.txt
       ↓
[Story Fully Complete] ← ONLY NOW can move to next story
       ↓
Next Story (repeat)
```

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

#### 4d. Code Quality Checks
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

### 5. Verification Layer (if `verifyWorking: true` or `qualityCheck: true`)
**This phase runs AFTER cleanup and BEFORE commit. Verifies the implementation actually works.**

#### 5a. Functional Verification
- **Endpoint Testing**: Test each API endpoint with actual HTTP requests
  ```powershell
  # Example: Test POST /api/tenants
  $body = @{ name = "Test Tenant"; globalQuotaLimit = 1000 } | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:8787/api/tenants" -Method POST -Body $body -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" }
  ```
- **Service Method Testing**: Verify service methods work correctly
- **Database Operations**: Verify data is stored/retrieved correctly
- **Error Handling**: Test error cases return proper status codes and messages

#### 5b. Integration Verification
- **Service Integration**: Ensure new code integrates with existing services
- **Database Integration**: Verify queries work with actual D1 database
- **Middleware Integration**: Verify middleware chain works correctly
- **Route Integration**: Verify routes are properly mounted and accessible

#### 5c. Edge Case Verification
- **Invalid Input**: Test with invalid/malformed data
- **Boundary Conditions**: Test with edge values (empty strings, null, max values)
- **Concurrent Requests**: Verify no race conditions (if applicable)
- **Error Scenarios**: Test all error paths return appropriate responses

#### 5d. Performance Verification
- **Response Times**: Check endpoints respond within acceptable time
- **Database Queries**: Verify queries are optimized (no N+1 problems)
- **Memory Usage**: Check for obvious memory leaks
- **Caching**: Verify caching works as expected (if applicable)

#### 5e. Security Verification
- **Authentication**: Verify authentication is required where needed
- **Authorization**: Verify role-based access control works
- **Input Validation**: Verify Zod schemas reject invalid input
- **SQL Injection**: Verify parameterized queries are used
- **JWT Validation**: Verify JWT tokens are properly validated

#### 5f. Verification Checklist
- [ ] All endpoints respond correctly (tested with actual requests)
- [ ] Error cases handled properly (tested invalid inputs)
- [ ] Database operations work (data persists correctly)
- [ ] Integration with existing code works (no breaking changes)
- [ ] Edge cases handled (null, empty, boundary values)
- [ ] Security checks in place (auth, authorization, validation)
- [ ] Performance acceptable (no obvious bottlenecks)
- [ ] Logging works (check logs for expected entries)

#### 5g. Verification Commands
```powershell
# Start dev server
npm run dev

# Test health endpoint
Invoke-RestMethod -Uri "http://localhost:8787/api/health"

# Test with authentication (example)
$token = "your-jwt-token"
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:8787/api/tenants" -Headers $headers

# Test error cases
Invoke-RestMethod -Uri "http://localhost:8787/api/tenants/invalid-id" -Headers $headers
# Should return 404 or appropriate error

# Check database directly (if using local D1)
wrangler d1 execute orkait_auth --local --command "SELECT * FROM tenants LIMIT 5"
```

### 6. Commit Changes (if checks pass)
```powershell
git add -A
git commit -m "feat: [STORY_ID] <brief description>"
```

If cleanup was performed:
```powershell
git commit -m "feat: [STORY_ID] <brief description> + cleanup"
```

If verification was performed:
```powershell
git commit -m "feat: [STORY_ID] <brief description> + verified"
```

### 7. Update prd.json (Phase 1: Implementation)
After implementation, mark story with `"passes": true`:

```json
{
  "id": "STORY_ID",
  "title": "...",
  "passes": true,  // <-- set this after implementation
  "verified": false  // <-- NOT verified yet
}
```

### 8. Complete Verification Subtasks (Phase 2: REQUIRED)
**BEFORE moving to next story, complete ALL verification subtasks:**

#### 8a. removeDeadCode
- Remove unused imports
- Remove unused functions
- Remove unused variables
- Remove commented-out code

#### 8b. removeComments
- Remove obvious comments that restate code
- Remove TODO/FIXME comments (document in progress.txt if needed)
- Keep only comments explaining "why", not "what"

#### 8c. qualityCheck
```powershell
npm run type-check  # Must pass
npm test           # All tests must pass
npm run lint       # (if configured)
```

#### 8d. verifyWorking
- Test actual functionality (endpoints, services, database operations)
- Verify error cases
- Verify integration with existing code
- Verify security checks

#### 8e. Update prd.json with `verified: true`
Only after ALL subtasks are complete:
```json
{
  "id": "STORY_ID",
  "title": "...",
  "passes": true,
  "verified": true,  // <-- set this ONLY after all verification subtasks complete
  "removeDeadCode": true,
  "removeComments": true,
  "qualityCheck": true,
  "verifyWorking": true
}
```

### 9. Log to progress.txt
Append learnings to progress.txt:
```
[TIMESTAMP] STORY_ID implemented
- What was implemented
- Any issues encountered

[TIMESTAMP] STORY_ID verified
- Dead code removed: [list]
- Comments cleaned: [count]
- Quality checks: PASSED
- Verification results: [list what was tested]
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

## PRD.json Story Status Fields

Each story in prd.json has a two-phase completion workflow:

### Phase 1: Implementation Status
```json
{
  "id": "STORY-001",
  "title": "...",
  "description": "...",
  "acceptanceCriteria": [...],
  "passes": false,  // Set to true after implementation
  "priority": 1
}
```

### Phase 2: Verification Status (REQUIRED)
**After `passes: true`, complete these verification subtasks:**

```json
{
  "id": "STORY-001",
  "passes": true,              // Phase 1 complete
  "removeDeadCode": false,     // Subtask 1: Remove unused code
  "removeComments": false,     // Subtask 2: Remove unnecessary comments
  "qualityCheck": false,       // Subtask 3: Run full quality checks
  "verifyWorking": false,      // Subtask 4: Verify functionality works
  "verified": false            // Phase 2: Set true ONLY when all subtasks complete
}
```

### Complete Example
```json
{
  "id": "STORY-001",
  "title": "Implement user authentication",
  "description": "...",
  "acceptanceCriteria": [...],
  "passes": true,              // Implementation done
  "priority": 1,
  "removeDeadCode": true,      // ✓ Dead code removed
  "removeComments": true,      // ✓ Comments cleaned
  "qualityCheck": true,        // ✓ Tests passing
  "verifyWorking": true,       // ✓ Functionality verified
  "verified": true             // ✓ FULLY COMPLETE - can move to next story
}
```

**Verification Flags:**
- `removeDeadCode: true` - Unused imports, functions, variables removed
- `removeComments: true` - Unnecessary comments removed
- `qualityCheck: true` - TypeScript, tests, lint all passing
- `verifyWorking: true` - Actual functionality tested and working
- `verified: true` - **ONLY set when ALL above are true**

**CRITICAL RULE: Do NOT move to the next story until `verified: true` is set.**

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

You are DONE with this iteration when BOTH phases are complete:

### Phase 1: Implementation Complete (marks `passes: true`)
- [ ] Story implementation complete
- [ ] TypeScript compiles without errors
- [ ] Tests pass (or no breaking changes)
- [ ] Changes committed to git
- [ ] `prd.json` updated with `passes: true`
- [ ] `progress.txt` updated with implementation details

### Phase 2: Verification Complete (marks `verified: true`)
**REQUIRED before moving to next story:**
- [ ] **removeDeadCode**: Dead code removed (unused imports, functions, variables)
- [ ] **removeComments**: Unnecessary comments removed
- [ ] **qualityCheck**: Full quality checks passed (type-check, tests, lint)
- [ ] **verifyWorking**: Functionality verified with actual testing
  - [ ] Endpoints tested with actual requests (if applicable)
  - [ ] Error cases verified
  - [ ] Integration verified
  - [ ] Security checks verified
- [ ] Changes committed to git (verification commit)
- [ ] `prd.json` updated with `verified: true`
- [ ] `progress.txt` updated with verification details

**CRITICAL: A story is NOT complete until `verified: true` is set. Do NOT move to the next story until verification phase is done.**

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
