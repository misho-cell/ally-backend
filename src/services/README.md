Service layer directory. Add business logic modules here, for example:
- `userService.ts` — user-related operations (vouches, profiles)
- `graphService.ts` — graph queries against Neo4j

These modules should import DB clients from `src/db/*`.
