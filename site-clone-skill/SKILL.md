---
name: site-clone-skill
description: Clone a target website page or page cluster into the current project with high visual and interaction fidelity. Use when Codex needs to reproduce a target route's structure, styling, navigation, content flow, and backend loop, while allowing brand information to be replaced for the local product.
---

# Site Clone Skill

Use this skill when we need to clone one page or a small group of related pages from a target website into the current project.

Scale the workflow to the task:

- For one small static page, use the basic workflow and skip page-cluster planning.
- For a product area with parent and child routes, use the page-cluster workflow.
- For a protected or data-driven page, treat data access as a first-class workstream.

The goal is not "make something similar". The goal is:

- keep the target page structure, spacing, card hierarchy, interaction flow, and data flow as close as possible
- replace target-site brand information with the local user's brand
- make the local page testable end-to-end

## Core rule

Clone everything you can from the target page:

- page structure
- component hierarchy
- navigation flow
- visual rhythm
- button placement
- interaction states
- content organization
- backend loop

Brand information is the one explicit exception. Replace target-site branding with the local user's brand:

- logo
- product name
- slogan
- brand-specific copy in the shell
- recognizable brand marks, icons, mascots, QR codes, watermark-like assets, and favicon-style assets
- image `alt`, link `title`, document title, metadata, and aria labels that expose the source brand
- hard-coded source-brand references inside templates, examples, empty states, toasts, dialogs, and footer/header text

These may be replaced with the local product brand while keeping the rest of the page faithful to the target.

## Workflow

1. Identify whether the target page is mostly static or mostly data-driven.
2. Collect the target page assets before changing local code.
3. Rebuild the local DOM structure to match the target page.
4. Apply visual fidelity using real target CSS values where possible.
5. Recreate the route flow and backend loop.
6. Verify in the browser, not just in code.
7. Record what was cloned exactly and what could not be cloned.

## High-efficiency page-cluster workflow

When cloning a product area rather than a single isolated route, do not start with pixel tweaks on the first page. Move in this order:

1. Map the route cluster.
   - parent route
   - child routes
   - modal/detail routes
   - shared shell routes
   - API endpoints used by each route
2. Decide which layer is shared.
   - top navigation and brand shell
   - page background and width
   - sidebars
   - repeated cards/forms/buttons
   - data loaders and response shapes
3. Decide whether the target shell should be cloned or only accounted for.
   - Clone it when the first viewport, navigation, or layout rhythm depends on it.
   - Do not clone it when the local product must keep an existing app shell.
   - If not cloning it, record the shell differences and compensate only where they affect the route body.
4. Clone the shared shell once before tuning individual pages when the shell is part of the target experience.
5. Clone one representative page deeply.
   - use it to prove the shell
   - prove authenticated data access
   - prove local submit/save loop
   - prove visual measurement workflow
6. Promote reusable pieces only after the representative page works.
7. Apply the same renderer/style pattern to sibling pages.
8. Run a route-by-route browser verification pass.

This avoids a common failure mode: cloning each child page separately while every page continues to fight the old local shell, old spacing, or old data model.

For an AI product/app marketplace cluster, a good order is:

1. Shell/navigation and brand replacement.
2. Parent marketplace/list page.
3. One core creation child page end to end.
4. Shared creation-page template for remaining child pages.
5. Data-driven profile/questionnaire pages.
6. Backend loop and local test path.
7. Visual pass using real target DOM/CSS values.

Treat the first successful child page as the reference implementation. In this project, the questionnaire clone became reliable only after the target payload, DOM shape, shell CSS, and live geometry checks were all handled together.

## Step 1: Classify the page

Before implementing, decide which kind of page it is:

- Static structure page: most of the page can be inferred from JS chunks, CSS, and visible DOM.
- Dynamic data page: critical content comes from runtime APIs, often behind login.

This determines whether the bottleneck is styling or data access.

## Step 2: Collect target evidence

Always collect evidence from the real target before coding.

Preferred sources:

- target route chunk JS
- route-specific CSS
- global CSS that affects the route
- browser DOM snapshot
- computed styles for key containers
- network/API requests
- runtime geometry from `getBoundingClientRect()` for key containers

If the page requires authentication, inspect whether:

- structure is available from public JS/CSS
- content templates require logged-in APIs

For a page cluster, keep a small evidence matrix before editing:

| Route | Purpose | Target JS/CSS | API/data source | Auth needed | Local route | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `/user/creation` | parent hub | chunk/CSS/DOM | hub/list API | maybe | `/workspace` or matching route | shell/list/body |
| `/user/apps/:id/create` | creation child | chunk/CSS/DOM | app config + generation API | maybe | `/apps/...` | form/backend |
| `/user/thinking` | profile page | chunk/CSS/DOM | thinking/status API | yes/no | `/thinking` | profile/status |
| `/user/questionnaire` | dynamic form | chunk/CSS/DOM | questionnaire API | yes | `/questionnaire` | payload/form |

The exact route names will differ by project; the point is to prevent hidden second-level pages from being "remembered" only after styling work has already started.

When screenshots and code disagree, trust the live browser geometry. Measure at least:

- outer shell/header position and height
- page content top position
- sidebar top position
- main content top position
- sticky/fixed header bottom position
- first repeated item top position

If a header bottom is below the first item top, the page has an overlap problem even if the CSS "looks" correct.

## Step 3: Rebuild structure first

Do not start by tweaking spacing on the old local page.

If the local structure differs from the target:

- replace the local structure
- rename or reorganize containers to mirror the target shape
- remove local-only cards, forms, or sections that do not exist on the target

Visual fidelity improves much faster once the DOM shape matches.

Also separate the page into two layers before rebuilding:

- global shell: top nav, brand area, side app frame, global page width, background
- route body: page-specific columns, cards, forms, tables, tabs, actions

Many failed clones happen because the route body was copied while the old local global shell kept controlling the visible rhythm. If the first viewport still feels wrong after body work, inspect the global shell before continuing to tune route components.

## Step 4: Apply styling from real values

Use real values from the target wherever possible:

- page width
- paddings
- gaps
- border radius
- shadows
- font sizes
- sticky offsets
- button sizes
- card header/content spacing

Do not rely on screenshots alone when CSS or computed styles are available.

Before adding more CSS, check whether an older parent rule is still winning:

- global shell rules such as `.appHeader`, `.main`, `.shellBody`
- page-family rules such as `.creationShell .main`
- later duplicate selectors in global CSS
- `position: sticky` or `position: fixed` offsets inherited from another page
- card/shadow/radius rules applied to an ancestor instead of the current component

If a change "does nothing", verify the computed style in the browser. Do not keep adding visual tweaks until the browser confirms the intended rule is winning.

## Step 5: Recreate behavior and flow

The route is only truly cloned when the user flow works.

Typical flow items:

- landing page button opens the right child page
- form state persists where the target persists it
- submit returns to the right page
- data refreshes in the right place
- empty, draft, complete, loading states exist

If a target child page exists, wire the local parent page to it instead of simulating the behavior inline.

For form-heavy pages, verify layout behavior as part of flow:

- first input is not covered by a sticky header
- sidebar starts at the same vertical rhythm as the main panel
- section header and first field have visible breathing room
- scrolling does not cause duplicated headers or unexpected overlay
- disabled submit state matches the target state model

## Step 6: Treat data separately from structure

A page can be structurally cloned while still having placeholder content.

For each target page, explicitly separate:

- structure cloned
- styling cloned
- route flow cloned
- real content template cloned
- backend response shape cloned

If a target API is login-protected and inaccessible, say so clearly and preserve a clean replacement point locally.

## Step 6A: Login-protected pages

Many high-value second-level pages are not fully clonable from public assets alone.

When the target page is behind login:

- first inspect whether the page shell can still be recovered from public JS/CSS
- then determine whether the question set, cards, tabs, or content list come from authenticated APIs
- do not assume visible text from screenshots is the real source of truth

Preferred order for authenticated pages:

1. Read the page chunk to identify likely API paths.
2. Try to access those APIs through a logged-in browser session.
3. If browser access is unavailable, mark the page as:
   - structure cloned
   - real content template not yet cloned
4. Leave one clean local replacement point for the future API payload.

For dynamic forms, surveys, or creation flows, the actual question text usually lives in API responses, not in bundled JS.

### Authenticated browser extraction

When the user already has the target site open and logged in, use the live browser page as the source of truth before asking the user to manually export data.

Fastest path for real dynamic content:

1. Read the target route chunk and search for API path strings.
2. Try the API unauthenticated to confirm whether it is protected.
3. If it returns `401`, switch to the user's logged-in browser session.
4. Extract only the credential needed for the read operation.
5. Request the API directly with that credential.
6. Identify the response shape and create a small local adapter.
7. Store the resulting JSON as the local source of truth.
8. Keep the renderer generic so later payload updates do not require UI rewrites.

Use a data adapter between target payloads and local UI state:

- normalize target field names into local component props
- keep target ids if they matter for drafts/submission
- map optional/required/type metadata explicitly
- preserve raw payload nearby when future parity checks may need it
- avoid spreading target response objects directly through components

Practical sequence:

1. Confirm the active browser tab URL is the target route.
2. Read visible page text to verify the page is authenticated and fully loaded.
3. Inspect storage keys in the page context:
   - `localStorage`
   - `sessionStorage`
   - cookies when accessible
4. Look for auth-bearing values such as:
   - `token`
   - `access_token`
   - `user`
   - app-specific auth/session keys
5. Call the target API with the discovered credential from the local shell or page context.
6. Save the exact API payload into a local template/config file instead of hard-coding text in the component.
7. If direct API requests still return `401`, extract what is visible from the hydrated DOM/runtime state and keep the API path documented for a later pass.

Example patterns that worked during the questionnaire clone:

```sh
osascript -e 'tell application "Google Chrome" to get URL of active tab of front window'
```

```applescript
tell application "Google Chrome"
  tell front window's active tab
    execute javascript "JSON.stringify({href: location.href, ready: document.readyState, title: document.title})"
  end tell
end tell
```

```applescript
tell application "Google Chrome"
  tell front window's active tab
    execute javascript "JSON.stringify({ls:Object.keys(localStorage), ss:Object.keys(sessionStorage)})"
  end tell
end tell
```

```applescript
tell application "Google Chrome"
  tell front window's active tab
    execute javascript "localStorage.getItem('token')"
  end tell
end tell
```

Then use the token against the authenticated API:

```sh
curl -sS 'https://target.example.com/api/path' \
  -H "authorization: Bearer $TOKEN" \
  -H 'accept: application/json'
```

If the page's `fetch()` call does not return through browser scripting because it is async, use synchronous `XMLHttpRequest` only for read-only inspection:

```applescript
tell application "Google Chrome"
  tell front window's active tab
    execute javascript "(function(){var xhr=new XMLHttpRequest();xhr.open('GET','/api/path',false);xhr.withCredentials=true;xhr.send(null);return JSON.stringify({status:xhr.status,text:xhr.responseText});})()"
  end tell
end tell
```

Important safety and accuracy notes:

- Treat browser-extracted tokens as sensitive. Use them only for the requested target-site read operation and do not commit them.
- Do not paste tokens into source files, logs, docs, or final answers.
- Prefer authenticated API payloads over visible screenshots for dynamic questionnaires, templates, card lists, and user-specific content.
- After cloning the payload, isolate it in one local data file so the UI remains generic and easy to replace later.
- When the target API is user-specific, record that cloned content came from the logged-in account's current payload.

The examples above are macOS Chrome patterns. In other environments, use the best available browser-control path:

- in-app browser or Playwright for DOM, screenshots, and computed styles
- Chrome DevTools Protocol when available
- exported HAR/network logs when browser control is unavailable
- manual JSON export from the user only as a fallback

## Step 6B: Build local replacement points

If the real content template is temporarily unavailable, do not hard-wire placeholder content deeply into the UI.

Instead:

- isolate the template data into one local constant, config object, or loader
- keep rendering logic generic
- make it easy to swap the real payload in later

This reduces rework once authenticated data becomes available.

## Step 7: Brand replacement rule

When cloning into the local product, replace all target-site brand information with the local user's brand:

- top-left product name
- shell slogan
- local logo assets
- global product wording that would otherwise expose the source brand
- page title and document metadata
- favicon/app icon references
- image `alt` text, `title` text, `aria-label`, and tooltip copy
- visible brand names in page body, form hints, examples, button labels, banners, modals, and toasts
- source-brand-specific mascot/icon assets, watermarks, QR codes, contact cards, and embedded images
- sample payload text that names the source brand but is not essential to the target workflow

Run a brand leak scan before finishing:

- search source files for the target brand name and common aliases
- inspect visible text in the browser
- inspect image `alt` and `src` values for source-brand assets
- inspect `<title>`, metadata, favicon, Open Graph, and PWA manifest where present
- inspect local template/config data copied from authenticated APIs

Do not use brand replacement as an excuse to redesign the page.

The page should still feel like the target page under a different brand shell.

## Verification checklist

Always verify in a browser after implementation.

Check at least:

- correct route opens
- parent page links to child page correctly
- card count matches the target
- input count matches the target
- main columns and sticky panels match the target
- top navigation does not wrap incorrectly
- loading, empty, draft, and complete states render
- local API round-trip works
- no panel or sticky header covers the first field/card
- route-specific overrides are not being defeated by global shell styles

For data-driven pages, also check:

- whether the local content source is real target data or temporary placeholder data
- whether the real target API is authenticated
- whether the page shell would survive a future data swap without structural rewrites

Use a three-pass browser verification rhythm:

1. Content pass:
   - route opens
   - visible text matches target
   - counts match target
   - dynamic payload is real or clearly marked as placeholder
2. Structure/style pass:
   - compare DOM class structure against target
   - compare computed styles for key nodes
   - compare first viewport geometry
   - check global shell and route body separately
   - capture screenshots of target and local at the same viewport
3. Interaction pass:
   - click tabs/sections
   - type into fields
   - save draft
   - submit or simulate submit
   - navigate back to parent route

Do not wait until the final pass to open the browser. After each structural edit, refresh and measure the relevant nodes before moving on.

For visual parity work, use screenshots as acceptance evidence, not as the primary source of truth:

- set the same viewport for target and local
- capture first viewport and one scrolled state
- compare large layout blocks first: shell, columns, major cards, first repeated item
- use computed styles and geometry to explain visible differences
- if screenshots look unchanged, run the "why does it look unchanged?" audit before editing more CSS

## Fast diagnosis: style issue or structure issue?

Use this quick rule before doing another styling pass.

It is probably a structure issue when:

- card count differs from the target
- input count differs from the target
- the target has a child route but local keeps the flow inline
- one column in the target is a separate card or rail, but local merged it into the main content
- the target shows status blocks while local shows full editable form fields

It is probably a styling issue when:

- DOM sections already match
- card count already matches
- buttons are in the right place but proportions look off
- typography, spacing, radius, or shadow are the main differences

When in doubt, compare:

- number of major cards
- number of inputs
- number of columns
- number of distinct action areas

If those counts are wrong, stop adjusting CSS and rebuild structure first.

## Fast diagnosis: why does it look unchanged?

When the user says "it did not change", do a computed-style audit before making another design pass.

Check in this order:

1. Is the edited file actually imported by the route?
2. Is the dev server serving the new build, or does the page need a hard reload?
3. Is a later global selector overriding the rule?
4. Is a parent shell rule controlling the visible layout instead of the child component?
5. Is the issue caused by `position: sticky`, `fixed`, transforms, or scroll containers?
6. Do browser coordinates prove the visual problem still exists?

Use measurements, not vibes. For example, compare `fixedHeader.bottom` with `firstQuestion.top`; if the header bottom is larger, there is real overlap.

## Acceptable vs unacceptable differences

Acceptable differences:

- local brand name, logo, and slogan are replaced
- backend-generated sample content differs while shell and response shape match
- local auth, billing, or quota text uses the local system wording

Usually unacceptable differences:

- different card grouping from the target
- different route flow from the target
- different empty or draft state model from the target
- placeholder questions left in place after real question payload becomes available
- keeping an old local layout and only repainting it

## Failure patterns to watch for

- The page still uses the old local structure, but with new colors.
- The route body was cloned, but the old global shell still controls the first viewport.
- The CSS looks close, but the interaction flow is wrong.
- Content differs because the real template comes from a protected API.
- The page "looks empty" because the local state path differs from the target state path.
- The top shell is cloned too literally and leaks the target brand.
- A dynamic page was treated as a static page, so the structure is right but the real content template is wrong.
- Placeholder data quietly stayed in production-looking UI and was mistaken for a completed clone.
- Sticky or fixed headers create hidden overlap with the first card/input.
- Repeated global CSS blocks override newer route-specific rules and make changes appear ineffective.

## Output expectations

When finishing a cloning pass, report:

- what matched the target
- what was intentionally rebranded
- what still differs
- whether the remaining gap is visual, structural, or data/auth related

## References

- Read `references/checklist.md` for the compact execution checklist.
