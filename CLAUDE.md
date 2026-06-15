---

## Code Quality Standards

### General
- Prioritize correctness and clarity over speed of writing.
  Take as long as needed — bad code is not acceptable.
- Every function does one thing only (Single Responsibility Principle).
- If a function is longer than 40 lines, split it.
- No magic numbers or hardcoded strings — use constants or config.
- Delete unused code immediately. Do not leave commented-out code.

### TypeScript
- Strict mode enabled in tsconfig.json at all times.
- No `any` type — ever. Use `unknown` and narrow it properly.
- All function parameters and return types must be explicitly typed.
- Use interfaces for object shapes, enums for fixed sets of values.
- Prefer `readonly` where data should not be mutated.

### Error Handling
- Never swallow errors silently (no empty catch blocks).
- All async functions must handle errors with try/catch.
- Return meaningful error messages — never expose raw DB errors to the client.
- Use a centralized error handler in middleware, not scattered try/catch everywhere.
- Always validate and sanitize input before it touches the database.

### Database
- Never write raw SQL or Cypher by concatenating strings.
  Always use parameterized queries — no exceptions.
- Every DB query must have a timeout set.
- Use transactions for operations that touch multiple tables.
- Never fetch more data than needed — always limit query results.
- Close sessions and connections properly — no leaks.

### Security
- Never log passwords, tokens, or sensitive user data.
- Never trust client input — validate everything on the server side.
- JWT secrets must come from environment variables — never hardcoded.
- Rate limit all public endpoints.
- Use HTTPS only in production.

### API Design
- RESTful naming: nouns not verbs (/users not /getUsers).
- Consistent response shape for all endpoints:
  { success: true, data: {...} } or { success: false, error: "message" }
- Use proper HTTP status codes:
  200 OK, 201 Created, 400 Bad Request, 401 Unauthorized,
  403 Forbidden, 404 Not Found, 500 Internal Server Error.
- Never return 200 with an error inside the body.

### Testing
- Every service function must have a unit test.
- Every API endpoint must have an integration test.
- Test both the happy path and the error cases.
- Tests must be deterministic — no random behavior, no time dependencies.

### Code Review Checklist (before finishing any feature)
- [ ] All inputs validated
- [ ] All errors handled
- [ ] No hardcoded secrets or strings
- [ ] No unused imports or variables
- [ ] All types explicit
- [ ] Tests written and passing
- [ ] No console.log left in production code (use a logger)
- [ ] Run `npm run lint` before finishing any feature. Zero warnings allowed.