# Project Guidelines

This project ships a Figma plugin. Keep changes practical and avoid splitting files only to reduce line count.

## Source Map

- `src/plugin/`: Figma main-thread code. Put Figma API calls, node creation, import validation, and import positioning here.
- `src/ui/app.js`: UI bootstrap and workflow orchestration. It may stay large when a flow is only used once.
- `src/ui/api/`: Browser-side API wrappers, provider config helpers, storage, and workspace draft calls.
- `src/ui/state/`: Reusable UI state rules and state transitions.
- `src/ui/services/`: Reusable business logic that does not belong to a single DOM view.
- `src/ui/renderers/`: Reusable DOM rendering helpers for panels, dialogs, lists, menus, and controls.
- `src/ui/ui.template.html`: Source UI shell. Keep script placeholders here.
- `src/ui/styles.css`: UI styles.
- `src/vendor/`: Third-party or Figma-provided browser scripts. Keep them local and build-time inlined.
- `dist/ui.html`: Generated Figma UI artifact. Do not edit it directly.
- `server.js`: Local backend for config, workspace drafts, AI proxy requests, progress, and image processing.

## How To Add Features

1. Search for an existing helper, API wrapper, renderer, or state helper before adding new code.
2. If code is used once, it can stay near the workflow in `src/ui/app.js`.
3. If request, state, rendering, or service logic is reused or likely to be reused, put it in the matching module folder.
4. Do not duplicate backend request logic inside event handlers. Use `fetchBackend()` and existing API helpers.
5. Do not put Figma API code in UI files.
6. Do not dynamically load third-party scripts from remote URLs in the plugin UI. Put them in `src/vendor/`.
7. Do not hand-edit `dist/ui.html`; run `npm run build:ui` after UI source changes.

## Verification

Prefer the full check before committing:

```bash
npm test
npm run build
git diff --check
```

For small UI-only edits, at minimum run:

```bash
npm run build:ui
node --check scripts/build-ui-html.js
git diff --check
```
