# 0008. S3 for document storage, emulated locally with LocalStack

- **Status:** accepted
- **Date:** 2026-10-30

## Context

Uploaded documents have to live somewhere durable. The database is the wrong
place: a 20 MB PDF in a Postgres column bloats backups, pushes useful rows out
of the buffer pool, and has to be streamed through the API process on every
read. Object storage is what this data is for.

I also need the local setup to be honest. If storage is a local folder in
development and S3 in production, then the code path that runs on my machine is
not the code path that runs in production, and the first time I exercise the
real one is after deploying. Credential handling, path-style addressing, content
types and error shapes all differ.

Two further constraints matter more than they might look:

1. **The whole project must run with no cloud account.** Anyone cloning the
   repository should get a working demo from `docker compose`, an LLM key, and
   nothing else.
2. **The test suite must need no secrets at all**, so that CI stays free and
   contributors are not blocked.

## Decision

Store documents in **S3 through `@aws-sdk/client-s3`**, behind a
`StorageService` interface with two drivers selected by `STORAGE_DRIVER`:

- `s3` (default) talks to any S3-compatible endpoint. `S3_ENDPOINT` and
  `S3_FORCE_PATH_STYLE` point it at a local emulator in development and at real
  AWS, or any S3-compatible host, in production.
- `local` writes to disk. It exists as a fallback for environments where no
  container runtime is available, not as the normal path.

Locally and in container-backed tests, run **LocalStack pinned to `4.14.0`**,
with S3 as the only enabled service.

## The version pin is deliberate

LocalStack's release line changed during this project. From release
**`2026.04.0`** onward, the `localstack/localstack` image refuses to start
without a paid `LOCALSTACK_AUTH_TOKEN`:

```
License activation failed!
Reason: No credentials were found in the environment. Please set the
LOCALSTACK_AUTH_TOKEN variable to a valid auth token.
Localstack returning with exit code 55.
```

That is incompatible with both constraints above, so the newest tag is not an
option. **`4.14.0`** (released 2026-02-26) is the last version that starts with
no credentials, and it serves S3 completely, which is the only service this
project needs. The pin is exact rather than a floating major, so a future re-tag
cannot silently reintroduce the licence check.

This is a dependency that has to be watched rather than trusted. The mitigation
is that the dependency is shallow: `StorageService` talks to an S3 endpoint, so
replacing the emulator means changing one image tag and one environment
variable, with no application code touched.

## Alternatives considered

**MinIO.** The obvious S3-compatible alternative, and a Testcontainers module
exists for it. Its public images are no longer pullable: both `minio/minio` on
Docker Hub and `quay.io/minio/minio` now return an authorization error without
credentials. That is the same problem as the newer LocalStack line, so it solves
nothing. Rejected on availability, not on merit.

**Store files in Postgres (`bytea` or large objects).** One fewer service to
run, and transactional with the row that references it. It makes the database
carry binary data it is bad at: backups grow with the corpus, and every read
competes with query traffic for the same connections and cache. Rejected.

**Local disk only, with S3 as future work.** Simplest to build and would have
been fine for a demo. It would also mean the storage code path is never
exercised the way it runs in production, and switching later is the kind of
change that breaks on the first deploy. The `local` driver still exists as a
fallback, but it is not the default. Rejected as the primary path.

**Presigned uploads straight from the browser to storage.** Keeps large files
out of the API process entirely and is what I would do for a high-traffic
product. It also moves validation after the upload instead of before it: size
and MIME checks, SHA-256 dedupe and the rate limit all currently happen in the
API before a byte is stored. Worth doing later; noted as future work rather than
built now.

## Consequences

- Development, tests and production all run the same AWS SDK calls; only the
  endpoint changes.
- Deployment is not tied to AWS. Any S3-compatible host works by changing
  `S3_ENDPOINT`.
- `docker compose up` now starts three services. The LocalStack healthcheck
  gates on the document bucket existing, so `pnpm infra:up` returns only when
  storage is actually usable, which keeps the container-backed tests from racing
  a half-started emulator.
- The LocalStack image is pinned to a version that will stop receiving fixes.
  Because only S3 is used and the interface is one service wide, the migration
  path if that becomes a problem is small.
