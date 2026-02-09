# Garden Development Guide

## Project Structure

- **core/** - Main Garden codebase (commands, config, graph, plugins, logger)
- **cli/** - CLI package that bundles core and plugins into the final executable
- **sdk/** - TypeScript plugin SDK for Garden plugin development
- **plugins/** - Bundled plugins (terraform, pulumi, jib, conftest, docker-compose)
- **docs/** - Documentation for docs.garden.io
- **scripts/** - Build, release, and dev automation scripts

## Development Workflow

Start watch-mode recompilation in the background (recommended):
```bash
npm run dev
```

Run Garden locally:
```bash
bin/garden
```

## Testing 

We use Mocha as our test framework.

Unit tests (from `core/` directory):
```bash
npm run test
npm run test -- -g "LoginCommand"  # filter by pattern
```

Integration tests (from `core/` directory):
```bash
npm run integ-local
npm run integ-local -- -g "pattern"  # filter by pattern
```

## Code Quality

Lint (errors only):
```bash
npm run lint -- --quiet
```

Type checking (from `core/` directory):
```bash
npm run check-types
```

If `npm run check-types` fails due to missing `tsc` binary, run directly:
```bash
node node_modules/typescript/lib/tsc.js -p core --noEmit
```

Fix formatting:
```bash
npm run fix-format
```

Pre-push checks (run before pushing):
```bash
npm run check-pre-push
```

## Commit Conventions

This repo uses conventional commits. Prefix commits with: `feat`, `fix`, `chore`, `docs`, `refactor`, `improvement`, `perf`, `test`, `ci`, `style`, `revert`, `tool`.

All source files require an MPL-2.0 license header (enforced by ESLint).