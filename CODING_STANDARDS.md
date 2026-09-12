# Revora coding standards

## Daily commands

```text
npm run format        Format TypeScript, Vue, SCSS, and documentation
npm run format:check  Verify formatting without changing files
npm run lint          Check TypeScript and Vue conventions
npm run typecheck     Check frontend and backend types
```

These commands do not execute tests. Test execution remains paused until requested.

## TypeScript and domain contracts

- Use two-space indentation, one declaration per statement, braces for control flow, and blank lines between functions and class methods.
- Keep TypeScript strict. Do not introduce explicit `any`, `unknown`, `never`, suppression comments, or unchecked response casts.
- Use domain enums from `shared/enums.ts` for roles, statuses, commands, payment methods, communication channels, and import kinds. Use `src/config/ui.enums.ts` for navigation and dialog discriminants.
- Define Zod schemas from enums. Preserve enum values that are persisted or exchanged with the API; display-label changes should not silently change stored data.
- Give shared financial results named interfaces. Keep currency, money limits, session durations, and scheduling limits in `shared/constants.ts`.
- Keep currency calculations in integer paisa. Convert editable rupee input at the command boundary, then validate it.
- Literal text belongs in copy and configuration. Do not turn arbitrary customer names, form placeholders, HTTP protocol strings, or CSS class names into domain enums.

## Frontend ownership

- `src/pages/`: page composition, page-specific computed views, and scoped page styles.
- `src/components/forms/`: focused form sections with explicit `defineModel` contracts.
- `src/components/ui/`: reusable presentation components such as icons, badges, dialogs, skeletons, and empty states.
- `src/config/`: typed navigation metadata, dialog copy, and UI enums.
- `src/stores/`: workspace state and mutations.
- `src/composables/`: reusable reactive behavior.
- `src/lib/`: HTTP and browser utilities without page markup.

Keep page headings and labels in typed metadata instead of nested template ternaries. A form component edits its model; its parent validates and submits the command. A presentational component does not issue financial mutations.

## Styling

Indent the contents of Vue `<script>`, `<template>`, and `<style>` blocks by two spaces. Prettier enforces script and style indentation through `vueIndentScriptAndStyle`.

Keep component-specific SCSS in the component's own `<style scoped lang="scss">` block, below its template. Do not add global selectors for one page or a dialog subsection.

Only genuinely shared rules belong in `src/styles/`: design tokens, reset, typography, buttons, form controls, reusable panels and tables, accessibility utilities, and reduced-motion behavior. Components can import Sass tokens without emitting global styles.

Use a consistent spacing scale, readable labels, and sufficient line height. Preserve table scrolling within the table container on mobile. Prefer subtle opacity and position transitions, and honor reduced-motion preferences.

## Backend ownership

The NestJS application has explicit `auth`, `workspace`, `collections`, `database`, and `health` boundaries. Each class has its own file. Modules declare their dependencies and exports; `app.module.ts` composes them.

HTTP handlers validate request bodies. Shared financial logic implements deterministic rules; persistence checks organization identity and revision before committing the ledger and audit together. Session guards determine the tenant. Submitted customer or invoice IDs do not determine organization access.

Keep all routes in `server/controllers/` and all orchestration in `server/services/`. Database queries and transactions belong in `server/repositories/`; all persisted models belong in `server/models/`. Do not create repeated layer directories inside feature folders. Controllers must not import database code or implement financial rules. See [server/README.md](server/README.md) for the complete request flow and relational schema.

Use versioned migrations for schema changes; keep automatic schema synchronization disabled. Tenant relationships must include the organization ID. Money columns store integer paisa and use the safe bigint transformer. Financial row changes, concurrency revision updates, and audit entries must commit in one transaction.

Keep `server/tsconfig.json` discoverable by editor language servers and inherit its decorator settings from `tsconfig.api.json`. Do not fix backend decorator diagnostics by weakening the frontend compiler settings or adding suppression comments.

Keep tests aligned with changed contracts, even while test execution is paused. Report lint/type-check results separately from test results.
