# Video Reliability Follow-Up

Status: implemented locally; not deployed and no customer job resubmitted.

## Changes

- Compute subtitle and presenter safe areas in one coordinate model. FFmpeg SRT
  margins use a 288-high ASS canvas, while video overlays use output pixels.
  Reserve two subtitle lines, scale the gap with resolution, and omit the PIP
  when the frame cannot accommodate it.
- Render semantic evidence and explanation beats fullscreen by default. Retain
  presenter-led anchor beats. Knowledge-card repairs no longer reintroduce PIP.
- Accept structured `layoutFixes` from QA. Layout-only repair preserves artwork;
  overlap reports from older QA output also trigger conservative fullscreen
  repair. Later prominence suggestions cannot undo that repair.
- Reuse job-local clips by master/material content hashes, timing and layout.
  Publish cache entries atomically after successful rendering. Changes to source,
  timing or geometry invalidate the clip. Final compositing and QA still run.
- Require concrete, source-grounded diagram repair instructions; consistent
  styling alone is advisory. Explicit failed QA is never converted to success.

## Verification

Final scoped regression: 60 tests passed, 0 failed, including real FFmpeg renders,
voice/checkpoint reuse and failed-delivery billing guards. Syntax checks and
`git diff --check` passed. No live model calls or customer charges were incurred.

- Real FFmpeg tests scan rendered PIP and subtitle pixels for both aspect ratios,
  including maximum supported subtitle sizes, and check cache reuse by timestamps.
- An 18-beat financial timeline fixture preserves all narration and repairs only
  its rejected beat. This is deterministic regression coverage, not a live model
  quality benchmark or an estimate of first-attempt success rate.
- Existing failure-to-delivery and charging gates remain unchanged.

## Boundaries

The clip cache lasts for one job working directory; this change does not add a
durable cross-task material cache. It does not implement a new financial diagram
engine or a pre-generation model review. Those require separate validation.
Production rollout and an authorized real-video acceptance run are still needed
before claiming the original customer incident resolved in production.
