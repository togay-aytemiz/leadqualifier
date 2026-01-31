# Release Notes

> Track completed work after each iteration.

---

## [Unreleased]

### Added
- Next.js 14 project with App Router and TypeScript
- Strict TypeScript configuration (`noUncheckedIndexedAccess`, `noImplicitReturns`)
- Prettier + ESLint with strict rules
- Supabase client/server setup (`src/lib/supabase/`)
- i18n support with next-intl (Turkish + English)
- Locale-aware routing (`/[locale]/`)
- Environment variables template (`.env.local.example`)
- Comprehensive README with setup instructions
- Project documentation (PRD, Roadmap, AGENTS.md)
- **Phase 1: Multi-Tenant Infrastructure**
  - Supabase migrations (schema, RLS policies, auth triggers)
  - Database types (`src/types/database.ts`)
  - Organizations, profiles, organization_members tables
  - Auth pages (login, register) with i18n
  - Protected dashboard with organization display
  - OrganizationContext for client-side org management
  - Sign out API route

### Changed
- N/A

### Fixed
- N/A

---

## Version History

| Version | Date | Summary |
|---------|------|---------|
| 0.2.0 | 2026-01-31 | Phase 1: Multi-tenant infrastructure + auth |
| 0.1.0 | 2026-01-31 | Phase 0: Project setup complete |
| 0.0.0 | 2026-01-31 | Project kickoff, documentation created |
