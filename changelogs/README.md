# Changelogs

This folder contains short, PR-scoped changelog entries used to track user-facing changes.

## When to add an entry

Add a changelog entry when your change affects:

- Product behavior (new feature, UX change, breaking change)
- API behavior (new endpoint/fields, behavior changes)
- Operational concerns (migrations, config changes)

Skip changelogs for:

- Pure refactors with no behavior change
- Internal tooling changes with no product impact
- Test-only changes

## How to add an entry

1. Copy `changelogs/_template.md` to a new file.
1. Name it like: `changelogs/pr-<PR_NUMBER>.md` (preferred) or `changelogs/<short-topic>.md`.
1. Fill it out with concise, user-facing language.

## Style

- Use present tense, user-facing phrasing.
- Prefer concrete behavior descriptions over implementation details.
- Call out breaking changes and required actions explicitly.
