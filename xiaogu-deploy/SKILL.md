---
name: xiaogu-deploy
description: Deploy and verify Xiaogu application changes with a repeatable local-build and production-release workflow. Use when Codex needs to publish Xiaogu frontend, API, or agent changes; sync standalone/runtime artifacts to the production server; restart the runtime container; validate login, homepage, chat streaming, and critical routes; or diagnose regressions introduced by a fresh deploy.
---

# Xiaogu Deploy

Use this skill for Xiaogu release iterations that follow the same core path: inspect the current deployment shape, validate changes locally, publish the runtime artifacts to production, restart the service, and run focused smoke tests.

Prefer this skill for day-to-day code deploys. Treat reverse proxy, DNS, CDN, or certificate debugging as a secondary branch; only read the infra troubleshooting reference when application-level deploy validation points there.

## Workflow

1. Confirm the deployment topology before touching production.
2. Validate the change locally.
3. Publish the runtime artifacts.
4. Restart the production app.
5. Run smoke tests against the live site.
6. Escalate to infra checks only if the deploy itself looks healthy.

## Step 1: Confirm topology

- Check how production is actually served before assuming source-to-server parity.
- Confirm whether the server runs repository source or a standalone/runtime export.
- For Xiaogu, inspect the production app directory, container compose file, and runtime mount before deploying.
- Use `references/checklist.md` for the exact discovery sequence.

## Step 2: Validate locally

- Run the smallest useful validation first, then the production build.
- Prefer local binaries when workspace package-manager setup is unreliable.
- For this repo, `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/next build` are the default release gates.
- Stop and fix build failures before syncing anything.

## Step 3: Publish runtime artifacts

- If production runs from a `runtime/` or standalone export, sync the built output instead of the entire repo.
- For Xiaogu, treat `.next/standalone`, `.next/static`, and `public/` as the primary deploy payload when the server runtime mirrors standalone output.
- Re-check path assumptions before overwriting server artifacts; base path and asset prefix mismatches can create false 404s.

## Step 4: Restart and verify runtime

- Restart only the affected application service unless the failure clearly requires broader intervention.
- Confirm container status, readiness endpoints, and recent logs immediately after restart.
- When verifying Xiaogu deploys, check at least:
  - homepage or login entry route
  - app readiness endpoint
  - one authenticated API path
  - one chat generation request if model behavior changed

## Step 5: Diagnose post-deploy regressions

- If the server is healthy but a route returns `404`, first test the app directly on the box to separate reverse proxy issues from app routing issues.
- If chat saves an empty assistant reply, inspect database messages and usage logs before blaming the frontend.
- If model calls succeed non-streaming but fail in chat UX, compare upstream streaming output with the app's SSE handling.
- Read `references/troubleshooting.md` when the normal deploy path completes but production behavior is still wrong.

## Output expectations

- State the local validation result before deploying.
- State exactly what was synced or rebuilt on the server.
- State which live checks passed.
- If something remains risky, name the risk directly instead of softening it.

## References

- Read `references/checklist.md` for the detailed release checklist and common command shapes.
- Read `references/troubleshooting.md` only when the normal deploy flow finishes but production is still incorrect.
