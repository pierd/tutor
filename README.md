# Tutor

A language-learning app where **the learner drives and AI teaches**. Each
profile is one language pair with its own progress. Everything you learn is
tracked as items (words, phrases, grammar points, letters) with spaced
repetition. You practise them through flashcards, reading, translation
challenges and voice. An AI coach builds lessons and units toward your goal,
and your own AI assistant can do the same through an MCP server.

Live at https://tutor.lessismore.studio (sign-up goes onto a wishlist that an
admin approves).

## Stack

Vite + React 19 + Tailwind 4 (`src/`), [Convex](https://convex.dev) backend
with Convex Auth and the Convex AI Gateway for LLM, speech and images
(`convex/`), PostHog analytics, i18next UI in English, Spanish and Polish.

## Running locally

Requires Node (version in `.nvmrc`) and access to the Convex project.

```sh
npm install
npx convex dev      # pushes functions to your dev deployment, writes .env.local
npm run dev         # in another terminal: Vite on http://localhost:5173
```

Copy the PostHog keys from `.env.example` into `.env.local` if you want
analytics locally. Backend secrets are set on the deployment with
`npx convex env set`, not in `.env.local`.

To use the app you need an approved account: sign up, then approve yourself
from an admin account, or grant admin from the CLI with
`npx convex run admin:grant '{"email":"…"}'`.

## Checks

```sh
npm test            # vitest + convex-test (convex/*.test.ts)
npx tsc -p convex   # typecheck the backend
npm run lint
npm run build       # typecheck the frontend and build
```

## Deploying

Every push to `main` deploys to production through
`.github/workflows/deploy.yml`: tests, then
`npx convex deploy --cmd 'npm run build'` (Convex prod functions, then the
frontend), then GitHub Pages. See the Deployments section of
[docs/architecture.md](docs/architecture.md).

## Documentation

- [docs/architecture.md](docs/architecture.md): data model, features and
  where their code lives, conventions, localization, deployments, product
  decisions.
- [docs/roadmap.md](docs/roadmap.md): what's done, known gaps, next steps.
- [docs/voice.md](docs/voice.md): speech models and AI Gateway quirks.
- [AGENTS.md](AGENTS.md): instructions for AI coding agents.
