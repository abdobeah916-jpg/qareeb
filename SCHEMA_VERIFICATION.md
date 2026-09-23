# Qareeb database schema verification

The reusable verifier at `scripts/verify-schema.mjs` compares the live MySQL schema with the canonical definitions in `drizzle/schema.ts`. It checks all table and column names, required versus nullable fields, timestamp and scalar defaults, enum values through `COLUMN_TYPE`, primary keys, and the two unique indexes on `users`.

The verification completed successfully on 27 August 2026:

| Check | Result |
|---|---:|
| Tables checked | 15 |
| Columns checked | 136 |
| Problems found | 0 |
| Overall status | PASS |

The cloud database also passed a real MySQL `joinRoom` smoke test against room `6VQ-E4J` after the `ensureRoom` change. The join path returned the expected room snapshot and no new `Failed query` entry appeared in the server log after the test.
