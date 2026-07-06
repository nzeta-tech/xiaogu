# Xiaogu Deploy Checklist

## 1. Inspect deployment shape

- Confirm production host and project directory.
- Confirm whether the live app runs from repository source or a runtime/standalone export.
- Confirm compose file, service names, mounted paths, and listening port.
- Confirm whether the runtime expects `.next/standalone`, `.next/static`, and `public/`.

## 2. Local validation

- Run local typecheck.
- Run local production build.
- Inspect build output shape before syncing.
- If package-manager metadata is broken, prefer direct binaries from `node_modules/.bin`.

## 3. Publish artifacts

- Sync only the files the runtime actually consumes.
- Avoid overwriting unrelated server config during application deploys.
- Re-check whether the server runtime embeds a base path or asset prefix before copying fresh output.

## 4. Restart production app

- Restart the app service only.
- Confirm the container is `Up` after restart.
- Check readiness or a simple internal HTTP path immediately.

## 5. Smoke-test release

- Test the root entry route.
- Test the login route.
- Test one authenticated API route.
- Test one model-backed chat route when agent behavior changed.
- Check recent app logs for startup errors and repeated warnings.

## 6. Report clearly

- Say what changed locally.
- Say what was deployed.
- Say which checks passed.
- Say what still needs follow-up.
