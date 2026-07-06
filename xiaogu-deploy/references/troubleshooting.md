# Xiaogu Deploy Troubleshooting

## Route issues

- If a live route returns `404`, compare:
  - direct app response on the server
  - public domain response through the reverse proxy
- If the direct app route works but the domain route fails, inspect proxy path handling before changing app code.
- If the public site serves a route with the wrong prefix, verify base path assumptions in the built runtime.

## Chat issues

- If the UI shows an empty assistant reply, inspect the latest conversation in the database.
- If `assistant.content` is empty in storage, treat it as a backend generation or streaming problem, not a pure rendering bug.
- Compare non-streaming upstream model output with the app's streaming behavior to isolate SSE issues.

## Runtime issues

- If logs show missing `.next/cache`, treat that as runtime packaging noise unless user-facing behavior is broken.
- If the app starts but routes fail, inspect the built `server.js` or runtime config for baked-in base path and asset prefix values.

## Infra branch

- Only move into Nginx, CDN, or domain troubleshooting after confirming the application itself behaves correctly when called directly.
- Keep infra fixes small and reversible; verify syntax before reloads and retest the exact failing route afterward.
