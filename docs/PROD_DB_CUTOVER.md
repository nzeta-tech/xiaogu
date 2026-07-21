# Production DB Cutover Notes

## Current State

As of 2026-07-18, Xiaogu production traffic reads and writes the AWS RDS instance:

- Host: `insurance-content-agent-postgres.c9egy04qex1a.ap-southeast-2.rds.amazonaws.com`
- Database: `insurance_content_agent`
- Runtime env key: `RDS_DATABASE_URL`
- Required connection option for the current Node runtime: `sslmode=no-verify`

## Local Postgres Role

The local Docker Postgres on each EC2 host is now:

- rollback-only
- not part of the normal production write path
- kept temporarily for emergency comparison or rollback

Do not point `app` back to the local Postgres unless performing an explicit rollback.

## Decommission Checklist

Only remove the local Postgres service after all of the following are true:

1. RDS has run stably in production for multiple days.
2. Backups and restore drills for RDS are verified.
3. Monitoring and admin flows no longer depend on the local Postgres container.
4. No rollback is expected back to local Postgres.

Suggested decommission order:

1. Snapshot or dump the local Postgres data one last time.
2. Stop the local `postgres` service on followers first.
3. Verify production remains healthy.
4. Stop the local `postgres` service on the primary.
5. Remove the local Postgres volume only after a final explicit confirmation.
