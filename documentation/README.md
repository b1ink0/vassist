# VAssist Documentation Workspace

This folder contains the VitePress product documentation for VAssist.

## Purpose

- Keep the docs user-first, with install, setup, and usage guides separate from technical reference pages.
- Document platform differences for desktop, Android, and the browser extension.
- Document the browser-facing package surfaces for plain ESM and React hosts.
- Generate repository inventory pages from the current workspace instead of hand-maintaining file counts.

## Commands

Run these from the repository root:

```bash
bun install
bun run build:packages
bun run docs:dev
bun run docs:generate:tree
bun run docs:build
```

## Layout

- `site/getting-started/` contains installation and setup docs.
- `site/guide/` contains task-based usage guides.
- `site/platforms/` explains desktop, Android, and extension differences.
- `site/settings/` is the exact settings reference.
- `site/architecture/` is the technical reference, including package integration docs and generated repository inventory.
- `site/public/assets/` stores the shared screenshots and GIFs used across the docs.

## Generated content

- `scripts/generate-repository-tree.ts` updates `site/architecture/repository-tree.md`.
- The generated repository page includes the file tree plus repository totals and file-type line counts.
