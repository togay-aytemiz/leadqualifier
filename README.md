# Qualy

WhatsApp AI Qualy for Turkish SMBs.

## Tech Stack

- **Frontend:** Next.js 14 (App Router)
- **Backend:** Supabase Edge Functions
- **Database:** Supabase (PostgreSQL + pgvector + RLS)
- **Auth:** Supabase Auth (Email/Password)
- **AI/LLM:** OpenAI GPT-4o-mini
- **WhatsApp:** Meta Cloud API
- **Hosting:** Netlify
- **i18n:** next-intl (TR + EN)

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase account
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd leadqualifier

# Install dependencies
npm install

# Create environment file
cp .env.local.example .env.local

# Fill in your credentials in .env.local
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - OPENAI_API_KEY
# - NEXT_PUBLIC_APP_URL
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
# - GOOGLE_CALENDAR_REDIRECT_URI
# - GOOGLE_CALENDAR_STATE_SECRET

# Run development server
npm run dev
```

### Calendar Integration Environment

Calendar / booking works without Google, but Google Calendar connection requires:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_CALENDAR_STATE_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` for encrypted provider-secret storage in the private schema

The implemented v1 model keeps Qualy as the internal booking source of truth and uses Google as an optional busy overlay plus controlled write-through mirror.

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
npm run format   # Format code with Prettier
```

## Project Structure

```
src/
├── app/
│   └── [locale]/        # Locale-aware pages
│       ├── layout.tsx
│       └── page.tsx
├── i18n/
│   ├── request.ts       # next-intl request config
│   └── routing.ts       # Locale routing config
├── lib/
│   └── supabase/
│       ├── client.ts    # Browser client
│       └── server.ts    # Server client
└── middleware.ts        # Locale routing middleware

messages/
├── en.json              # English translations
└── tr.json              # Turkish translations

docs/
├── PRD.md               # Product requirements
├── ROADMAP.md           # Development roadmap
├── RELEASE.md           # Release notes
└── plans/               # Implementation plans
```

## Documentation

- [PRD](./docs/PRD.md) — Product requirements
- [Roadmap](./docs/ROADMAP.md) — Development phases
- [Release Notes](./docs/RELEASE.md) — Changelog
- [Agent Guidelines](./AGENTS.md) — AI coding assistant workflow

## License

Private — All rights reserved.
