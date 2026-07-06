# Site Clone Checklist

Use this when cloning a new target page.

1. Find the target route and its child routes.
2. Capture the route-specific JS chunk and CSS.
3. Determine whether page content comes from a logged-in API.
4. Choose workflow scale:
   - single static page
   - page cluster
   - protected/data-driven page
5. Build a route evidence matrix:
   - route
   - purpose
   - JS/CSS source
   - API/data source
   - auth requirement
   - local route
   - clone status
6. Decide whether to clone the shared shell or preserve the local shell:
   - clone shell when target first viewport depends on it
   - preserve local shell when product consistency requires it
   - record shell differences either way
7. Clone the shared shell before individual child pages when needed:
   - top nav
   - brand replacement
   - page width/background
   - shared card/form/button primitives
8. Rebuild local DOM structure before fine styling.
9. Split the clone into global shell and route body:
   - top nav/header/background/page width
   - route-specific columns/cards/forms/actions
10. Reuse target spacing, radius, shadow, and typography values.
11. Audit parent/global CSS before assuming a component-level style is wrong:
   - `.appHeader`
   - `.main`
   - `.shellBody`
   - page-family wrappers such as `.creationShell`
   - later duplicate selectors in global CSS
12. Wire the actual route flow, not just the visual shell.
13. For login pages or protected pages:
   - identify authenticated API paths
   - decide whether you have a usable logged-in browser session
   - if not, keep content templates isolated for later replacement
14. If the user has the target open in a logged-in Chrome session:
   - confirm the active tab URL
   - read visible page text to confirm login state
   - inspect `localStorage` and `sessionStorage` keys
   - extract auth token only for the requested read operation
   - call the authenticated API with `Authorization: Bearer ...`
   - if API still returns `401`, extract visible DOM/runtime data and document the API path
   - never commit or report the token
15. Store real dynamic payloads in a local replacement point:
   - template/config/data file
   - adapter from target response to local props/state
   - generic renderer
   - no deeply hard-coded component text
16. Replace target-site brand information with the local user's brand:
   - logo
   - product name
   - slogan
   - favicon/app icon
   - page title and metadata
   - image `alt` / `title` / `aria-label`
   - brand marks, mascots, QR codes, watermarks, contact cards
   - visible brand names in examples, hints, modals, banners, empty states, and toasts
17. Verify with a browser:
   - route
   - nav
   - card count
   - input count
   - sticky behavior
   - submit loop
18. Run the three browser verification passes:
   - content pass
   - structure/style pass
   - interaction pass
19. Capture same-viewport screenshots:
   - target first viewport
   - local first viewport
   - target scrolled state
   - local scrolled state
20. Measure live geometry with `getBoundingClientRect()`:
   - header bottom
   - content top
   - sidebar top
   - main panel top
   - section header bottom
   - first card/input top
21. Confirm no sticky/fixed element covers content:
   - first input starts below section header
   - sidebar does not have unexplained top whitespace
   - scroll does not create duplicate or floating headers
22. If the user says "nothing changed", check:
   - edited file is imported
   - browser hard reload happened
   - computed styles show the intended rule winning
   - a global shell rule is not overriding route-specific CSS
23. Decide whether the remaining difference is:
   - structure
   - styling
   - auth/data
24. Run a brand leak scan:
   - source search for target brand names and aliases
   - visible browser text
   - copied template/config payloads
   - image paths and alt text
   - metadata/favicons/manifests
25. Record whether remaining differences are:
   - visual
   - structural
   - auth/data related
