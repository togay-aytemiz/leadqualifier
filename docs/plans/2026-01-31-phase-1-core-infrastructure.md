# Phase 1: Core Infrastructure — Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up multi-tenant database schema with RLS policies and Supabase Auth with user-organization relationships.

**Architecture:** Organization-based multi-tenancy with Row Level Security. Users belong to organizations via a junction table with roles.

**Tech Stack:** Supabase (PostgreSQL + RLS), Supabase Auth, Next.js App Router

---

## Task 1: Create Supabase Project & Database Schema

**Files:**
- Create: `supabase/migrations/00001_initial_schema.sql`

**Step 1: Install Supabase CLI**

```bash
npm install -D supabase
npx supabase init
```

**Step 2: Create initial migration**

```sql
-- supabase/migrations/00001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User roles enum
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member');

-- Organization memberships (junction table)
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- User profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX idx_organizations_slug ON organizations(slug);
```

**Step 3: Commit**

```bash
git add supabase/
git commit -m "feat(phase-1): add initial database schema migration"
```

---

## Task 2: Set Up RLS Policies

**Files:**
- Create: `supabase/migrations/00002_rls_policies.sql`

**Step 1: Create RLS migration**

```sql
-- supabase/migrations/00002_rls_policies.sql

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper function: Get user's organizations
CREATE OR REPLACE FUNCTION get_user_organizations(user_uuid UUID)
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM organization_members WHERE user_id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: Check if user is org member
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members 
    WHERE organization_id = org_id AND user_id = user_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: Check if user is org admin/owner
CREATE OR REPLACE FUNCTION is_org_admin(org_id UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members 
    WHERE organization_id = org_id 
    AND user_id = user_uuid 
    AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Organizations policies
CREATE POLICY "Users can view their organizations" 
  ON organizations FOR SELECT 
  USING (id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Admins can update their organizations" 
  ON organizations FOR UPDATE 
  USING (is_org_admin(id, auth.uid()));

-- Organization members policies
CREATE POLICY "Users can view members of their organizations" 
  ON organization_members FOR SELECT 
  USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Admins can manage organization members" 
  ON organization_members FOR ALL 
  USING (is_org_admin(organization_id, auth.uid()));

-- Profiles policies
CREATE POLICY "Users can view their own profile" 
  ON profiles FOR SELECT 
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile" 
  ON profiles FOR UPDATE 
  USING (id = auth.uid());

CREATE POLICY "Profiles are created on signup" 
  ON profiles FOR INSERT 
  WITH CHECK (id = auth.uid());
```

**Step 2: Commit**

```bash
git add supabase/
git commit -m "feat(phase-1): add RLS policies for multi-tenancy"
```

---

## Task 3: Create Auth Trigger for Profile Creation

**Files:**
- Create: `supabase/migrations/00003_auth_trigger.sql`

**Step 1: Create trigger migration**

```sql
-- supabase/migrations/00003_auth_trigger.sql

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-create organization on first signup (for MVP)
CREATE OR REPLACE FUNCTION handle_new_user_org()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create default organization for new user
  INSERT INTO organizations (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'company_name', NEW.email || '''s Organization'),
    LOWER(REPLACE(NEW.id::text, '-', ''))
  )
  RETURNING id INTO new_org_id;
  
  -- Add user as owner
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_org
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_org();
```

**Step 2: Commit**

```bash
git add supabase/
git commit -m "feat(phase-1): add auth triggers for profile and org creation"
```

---

## Task 4: Create TypeScript Types

**Files:**
- Create: `src/types/database.ts`

**Step 1: Create database types**

```typescript
// src/types/database.ts

export type UserRole = 'owner' | 'admin' | 'member'

export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: UserRole
  created_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

// Extended types with relations
export interface OrganizationWithMembers extends Organization {
  members: OrganizationMember[]
}

export interface ProfileWithOrganizations extends Profile {
  organizations: Organization[]
}
```

**Step 2: Commit**

```bash
git add src/types/
git commit -m "feat(phase-1): add TypeScript types for database models"
```

---

## Task 5: Create Auth Pages

**Files:**
- Create: `src/app/[locale]/(auth)/login/page.tsx`
- Create: `src/app/[locale]/(auth)/register/page.tsx`
- Create: `src/app/[locale]/(auth)/layout.tsx`
- Create: `src/components/auth/LoginForm.tsx`
- Create: `src/components/auth/RegisterForm.tsx`

**Step 1: Create auth layout**

```typescript
// src/app/[locale]/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="w-full max-w-md p-8">
        {children}
      </div>
    </div>
  )
}
```

**Step 2: Create login page with form**

Server action for login, form component with email/password fields.

**Step 3: Create register page with form**

Server action for signup with name, email, password, company name.

**Step 4: Add translations**

Update `messages/en.json` and `messages/tr.json` with auth strings.

**Step 5: Commit**

```bash
git add .
git commit -m "feat(phase-1): add auth pages (login/register)"
```

---

## Task 6: Create Auth Middleware & Protected Routes

**Files:**
- Modify: `src/middleware.ts`
- Create: `src/app/[locale]/(dashboard)/layout.tsx`
- Create: `src/app/[locale]/(dashboard)/page.tsx`

**Step 1: Update middleware for auth**

Check Supabase session, redirect unauthenticated users to login.

**Step 2: Create dashboard layout**

Protected layout that shows user info and organization context.

**Step 3: Commit**

```bash
git add .
git commit -m "feat(phase-1): add auth middleware and protected dashboard"
```

---

## Task 7: Create Organization Context Provider

**Files:**
- Create: `src/contexts/OrganizationContext.tsx`
- Create: `src/hooks/useOrganization.ts`

**Step 1: Create organization context**

```typescript
// Context to provide current organization throughout the app
// - Fetch user's organizations on mount
// - Store current selected org in state
// - Persist selection in localStorage
```

**Step 2: Create useOrganization hook**

```typescript
// Hook for easy access to current organization
export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) throw new Error('useOrganization must be used within OrganizationProvider')
  return context
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat(phase-1): add organization context and hooks"
```

---

## Verification Plan

### Manual Verification (User Testing)

Since this is database schema and auth setup, manual testing is most appropriate:

1. **Apply migrations to Supabase**
   ```bash
   npx supabase db push
   ```

2. **Test registration flow**
   - Visit `/register`
   - Fill form with test data
   - Submit and verify:
     - User created in `auth.users`
     - Profile created in `profiles`
     - Organization created in `organizations`
     - Membership created in `organization_members` with role='owner'

3. **Test login flow**
   - Visit `/login`
   - Enter credentials
   - Verify redirect to dashboard
   - Verify user info displayed

4. **Test RLS policies**
   - Create second user
   - Verify user A cannot see user B's organization
   - Verify user A cannot access user B's data

### Automated Verification

```bash
npm run build   # TypeScript type checking
npm run lint    # ESLint checks
```

---

## Success Criteria

Phase 1 is complete when:
- [ ] Database schema deployed to Supabase
- [ ] RLS policies active and tested
- [ ] User can register and auto-gets organization
- [ ] User can login and see dashboard
- [ ] Organization context available throughout app
- [ ] TypeScript types match database schema
