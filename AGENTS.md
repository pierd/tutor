# Tutor

AI-assisted language-learning app (learner drives, AI teaches). Vite + React 19
+ Tailwind 4 frontend in `src/`, Convex backend in `convex/`. This file is the
single set of instructions for coding agents; `CLAUDE.md` only imports it.

## Read first

- `docs/architecture.md`: data model (profiles → items + evidence), every
  feature with the files it lives in, backend and frontend conventions,
  analytics, deployments, localization, product decisions to respect.
- `docs/roadmap.md`: what's done, known gaps, next steps.
- `docs/voice.md`: speech models and AI Gateway quirks (read before touching
  STT/TTS).
- `docs/suggested-lessons/`: archived content of the original hardcoded games.

## Where things are

- `convex/schema.ts`: all tables. `convex/lib/auth.ts`: `requireUserId`,
  `requireProfile`, `requireItem` (ownership + wishlist gate).
- `convex/items.ts` (items, evidence, `recordEvidence`), `units.ts`
  (curriculum, cards), `practice.ts`, `reading.ts`, `translation.ts`,
  `study.ts`, `coach.ts` (in-app coach), `mcp.ts` + `mcpData.ts` +
  `apiTokens.ts` (MCP server for external AI agents), `convex/ai/` (prompts
  and model calls), `convex/seeds/` (starter content).
- `src/lessons/` (lesson views and practice modes), `src/coach/`,
  `src/agents/` (MCP setup page), `src/voice/`, `src/profiles/`,
  `src/wishlist/`, `src/lib/useQuery.ts` (use instead of `convex/react`'s).
- UI strings: `src/i18n/locales/{en,es,pl}.json`.

## Commands

```sh
npm test            # vitest + convex-test
npx tsc -p convex   # backend typecheck
npm run lint
npm run build       # frontend typecheck + build
npx convex dev      # dev deployment (tangible-armadillo-223)
```

Run tests, the backend typecheck and the build before calling a change done.

## Rules

- **Pushing to `main` deploys to production** (GitHub Action: tests, Convex
  prod deploy, GitHub Pages). Don't push or run `npx convex deploy` unless
  asked. Never run commands with `--prod` without being asked.
- Every UI string goes into all three catalogs (en, es, pl).
- Public Convex functions check ownership through `convex/lib/auth.ts`; never
  take a user id as an argument. New features that touch user data get a
  convex-test test for the wrong-user case (see `convex/mcp.test.ts`).
- Keep `docs/architecture.md` and `docs/roadmap.md` current in the same
  change: new tables, features, conventions, decisions, finished roadmap
  items.
- Commits: do not add Claude/AI co-author or attribution lines.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
