# Main Sidebar Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the compact GlobalRail with a crisp-inspired MainSidebar that supports collapse/expand, a Netlify-style toggle, and Plus Jakarta Sans as the global font.

**Architecture:** Introduce a new design component `MainSidebar` that controls layout, nav items, and collapse state (persisted in `localStorage`). Wire it into the dashboard layout and export via the design index. Update global typography in `globals.css`.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS v4, next-intl, lucide-react.

---

### Task 0: Create Dedicated Worktree (Prereq)

**Files:**
- Create: N/A
- Modify: N/A
- Test: N/A

**Step 1: Create worktree**

Run:
```bash
git worktree add -b codex/main-sidebar ../leadqualifier-main-sidebar
```
Expected: worktree created on `codex/main-sidebar`.

**Step 2: Enter worktree**

Run:
```bash
cd ../leadqualifier-main-sidebar
```
Expected: working directory is the new worktree.

**Step 3: Commit**

Skip (no code changes).

---

### Task 1: Add Font Smoke Test + Apply Plus Jakarta Sans Globally

**Files:**
- Create: `scripts/tests/main-sidebar.test.js`
- Modify: `src/app/globals.css`
- Test: `scripts/tests/main-sidebar.test.js`

**Step 1: Write the failing test**

Create `scripts/tests/main-sidebar.test.js`:
```javascript
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..', '..')
const globalsPath = path.join(root, 'src', 'app', 'globals.css')
const globals = fs.readFileSync(globalsPath, 'utf8')

assert.ok(
    globals.includes('Plus Jakarta Sans'),
    'globals.css should include Plus Jakarta Sans'
)
```

**Step 2: Run test to verify it fails**

Run:
```bash
node scripts/tests/main-sidebar.test.js
```
Expected: FAIL with assertion about missing Plus Jakarta Sans.

**Step 3: Write minimal implementation**

Update `src/app/globals.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
@import 'tailwindcss';

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
node scripts/tests/main-sidebar.test.js
```
Expected: PASS (no output).

**Step 5: Commit**

```bash
git add scripts/tests/main-sidebar.test.js src/app/globals.css
git commit -m "feat(phase-1): apply Plus Jakarta Sans globally"
```

---

### Task 2: Add MainSidebar Component + Toggle i18n Keys

**Files:**
- Create: `src/design/MainSidebar.tsx`
- Modify: `scripts/tests/main-sidebar.test.js`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Test: `scripts/tests/main-sidebar.test.js`

**Step 1: Write the failing test**

Update `scripts/tests/main-sidebar.test.js`:
```javascript
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..', '..')
const globalsPath = path.join(root, 'src', 'app', 'globals.css')
const globals = fs.readFileSync(globalsPath, 'utf8')

assert.ok(
    globals.includes('Plus Jakarta Sans'),
    'globals.css should include Plus Jakarta Sans'
)

const sidebarPath = path.join(root, 'src', 'design', 'MainSidebar.tsx')
assert.ok(fs.existsSync(sidebarPath), 'MainSidebar.tsx should exist')
const sidebarContent = fs.readFileSync(sidebarPath, 'utf8')
assert.ok(
    sidebarContent.includes('export function MainSidebar'),
    'MainSidebar should export a component'
)
```

**Step 2: Run test to verify it fails**

Run:
```bash
node scripts/tests/main-sidebar.test.js
```
Expected: FAIL because `MainSidebar.tsx` does not exist.

**Step 3: Write minimal implementation**

Create `src/design/MainSidebar.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { BookOpen, Bot, Inbox, LogOut, MessageSquare, Settings, Sparkles } from 'lucide-react'

const STORAGE_KEY = 'leadqualifier.sidebarCollapsed'

interface MainSidebarProps {
    userName?: string
}

export function MainSidebar({ userName }: MainSidebarProps) {
    const pathname = usePathname()
    const pathWithoutLocale = pathname.replace(/^\/[[a-z]]{2}\//, '/')
    const tNav = useTranslations('nav')
    const tCommon = useTranslations('common')

    const [collapsed, setCollapsed] = useState(false)

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            setCollapsed(stored === 'true')
        } catch {
            setCollapsed(false)
        }
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false')
        } catch {
            // ignore persistence errors
        }
    }, [collapsed])

    const navItems = useMemo(() => [
        { id: 'inbox', href: '/inbox', label: tNav('inbox'), icon: Inbox },
        { id: 'simulator', href: '/simulator', label: tNav('simulator'), icon: MessageSquare },
        { id: 'skills', href: '/skills', label: tNav('skills'), icon: Sparkles },
        { id: 'knowledge', href: '/knowledge', label: tNav('knowledgeBase'), icon: BookOpen },
    ], [tNav])

    const bottomItems = useMemo(() => [
        { id: 'settings', href: '/settings/channels', label: tNav('settings'), icon: Settings },
    ], [tNav])

    const toggleLabel = collapsed ? tCommon('expandSidebar') : tCommon('collapseSidebar')

    return (
        <aside
            className={cn(
                'relative flex h-screen shrink-0 flex-col border-r border-slate-200/80 bg-slate-50/70 text-slate-900 transition-[width] duration-200 motion-reduce:transition-none',
                collapsed ? 'w-[76px]' : 'w-[264px]'
            )}
            data-collapsed={collapsed ? 'true' : 'false'}
        >
            <div className="px-4 pt-4 pb-3">
                <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
                        <Bot size={20} />
                    </div>
                    <div className={cn(
                        'flex flex-col transition-all duration-200 motion-reduce:transition-none',
                        collapsed ? 'w-0 translate-x-2 overflow-hidden opacity-0' : 'opacity-100'
                    )}
                    >
                        <span className="text-sm font-semibold tracking-tight">{tCommon('appName')}</span>
                    </div>
                </div>
                <div className={cn('mt-3 flex', collapsed ? 'justify-center' : 'justify-start')}>
                    <button
                        type="button"
                        onClick={() => setCollapsed(prev => !prev)}
                        className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-900 hover:ring-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200',
                            'motion-reduce:transition-none'
                        )}
                        aria-label={toggleLabel}
                        aria-expanded={!collapsed}
                        title={toggleLabel}
                    >
                        <span className="relative block h-3 w-3">
                            <span className="absolute left-0 top-0 h-3 w-[2px] rounded-full bg-current" />
                            <span className="absolute right-0 top-0 h-3 w-[2px] rounded-full bg-current" />
                        </span>
                    </button>
                </div>
            </div>

            <nav className="flex-1 px-3">
                <div className="space-y-1">
                    {navItems.map(item => {
                        const isActive = pathWithoutLocale.startsWith(item.href)
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.id}
                                href={item.href}
                                prefetch={false}
                                title={item.label}
                                aria-label={item.label}
                                className={cn(
                                    'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none',
                                    collapsed && 'justify-center px-2',
                                    isActive
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                )}
                            >
                                <Icon
                                    size={18}
                                    className={cn(
                                        'shrink-0',
                                        isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-900'
                                    )}
                                />
                                <span
                                    className={cn(
                                        'whitespace-nowrap transition-all duration-200 motion-reduce:transition-none',
                                        collapsed ? 'w-0 translate-x-2 overflow-hidden opacity-0' : 'opacity-100'
                                    )}
                                >
                                    {item.label}
                                </span>
                            </Link>
                        )
                    })}
                </div>
            </nav>

            <div className="px-3 pb-3">
                <div className="space-y-1">
                    {bottomItems.map(item => {
                        const isActive = pathWithoutLocale.startsWith(item.href)
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.id}
                                href={item.href}
                                prefetch={false}
                                title={item.label}
                                aria-label={item.label}
                                className={cn(
                                    'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none',
                                    collapsed && 'justify-center px-2',
                                    isActive
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                )}
                            >
                                <Icon
                                    size={18}
                                    className={cn(
                                        'shrink-0',
                                        isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-900'
                                    )}
                                />
                                <span
                                    className={cn(
                                        'whitespace-nowrap transition-all duration-200 motion-reduce:transition-none',
                                        collapsed ? 'w-0 translate-x-2 overflow-hidden opacity-0' : 'opacity-100'
                                    )}
                                >
                                    {item.label}
                                </span>
                            </Link>
                        )
                    })}
                </div>
            </div>

            <div className="px-3 pb-4">
                <div className="relative group">
                    <button
                        className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white hover:text-slate-900',
                            collapsed && 'justify-center px-2'
                        )}
                        title={userName}
                        type="button"
                    >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                            {(userName?.[0] || tCommon('defaultUserInitial')).toUpperCase()}
                        </div>
                        <div
                            className={cn(
                                'min-w-0 flex-1 transition-all duration-200 motion-reduce:transition-none',
                                collapsed ? 'w-0 translate-x-2 overflow-hidden opacity-0' : 'opacity-100'
                            )}
                        >
                            <p className="truncate text-sm font-semibold text-slate-900">
                                {userName || tCommon('defaultUserName')}
                            </p>
                        </div>
                    </button>

                    <div className="absolute left-full bottom-0 ml-2 w-52 rounded-lg border border-gray-100 bg-white py-1 shadow-lg invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-all duration-200 motion-reduce:transition-none z-50">
                        <div className="px-3 py-2 border-b border-gray-50">
                            <p className="text-xs text-gray-500 truncate">{tCommon('loggedInAs')}</p>
                            <p className="text-sm font-medium text-gray-900 truncate" title={userName}>
                                {userName || tCommon('defaultUserName')}
                            </p>
                        </div>
                        <div className="p-1">
                            <form action="/api/auth/signout" method="POST">
                                <button
                                    type="submit"
                                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors flex items-center gap-2"
                                >
                                    <LogOut size={16} />
                                    {tNav('signout')}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    )
}
```

Add i18n keys:
- `messages/en.json` (under `common`):
```json
"collapseSidebar": "Collapse sidebar",
"expandSidebar": "Expand sidebar"
```
- `messages/tr.json` (under `common`):
```json
"collapseSidebar": "Kenar çubuğunu daralt",
"expandSidebar": "Kenar çubuğunu genişlet"
```

**Step 4: Run test to verify it passes**

Run:
```bash
node scripts/tests/main-sidebar.test.js
```
Expected: PASS (no output).

**Step 5: Commit**

```bash
git add src/design/MainSidebar.tsx scripts/tests/main-sidebar.test.js messages/en.json messages/tr.json
git commit -m "feat(phase-1): add main sidebar component"
```

---

### Task 3: Wire MainSidebar + Update Design Docs

**Files:**
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`
- Modify: `src/design/index.ts`
- Modify: `src/design/README.md`
- Modify: `scripts/tests/main-sidebar.test.js`
- Test: `scripts/tests/main-sidebar.test.js`

**Step 1: Write the failing test**

Update `scripts/tests/main-sidebar.test.js`:
```javascript
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..', '..')
const globalsPath = path.join(root, 'src', 'app', 'globals.css')
const globals = fs.readFileSync(globalsPath, 'utf8')

assert.ok(
    globals.includes('Plus Jakarta Sans'),
    'globals.css should include Plus Jakarta Sans'
)

const sidebarPath = path.join(root, 'src', 'design', 'MainSidebar.tsx')
assert.ok(fs.existsSync(sidebarPath), 'MainSidebar.tsx should exist')
const sidebarContent = fs.readFileSync(sidebarPath, 'utf8')
assert.ok(
    sidebarContent.includes('export function MainSidebar'),
    'MainSidebar should export a component'
)

const designIndex = fs.readFileSync(path.join(root, 'src', 'design', 'index.ts'), 'utf8')
assert.ok(
    designIndex.includes('MainSidebar'),
    'design index should export MainSidebar'
)

const dashboardLayout = fs.readFileSync(path.join(root, 'src', 'app', '[locale]', '(dashboard)', 'layout.tsx'), 'utf8')
assert.ok(
    dashboardLayout.includes('MainSidebar'),
    'dashboard layout should use MainSidebar'
)
```

**Step 2: Run test to verify it fails**

Run:
```bash
node scripts/tests/main-sidebar.test.js
```
Expected: FAIL because layout/index are not updated.

**Step 3: Write minimal implementation**

Update `src/app/[locale]/(dashboard)/layout.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { MainSidebar } from '@/design'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user?.id)
        .single()

    const userName = profile?.full_name || profile?.email || 'User'

    return (
        <div className="flex h-screen w-full bg-gray-50 overflow-hidden">
            <MainSidebar userName={userName} />
            <div className="flex-1 flex min-w-0 overflow-hidden">
                {children}
            </div>
        </div>
    )
}
```

Update `src/design/index.ts`:
```ts
// Design System Exports

export {
    Button,
    Badge,
    Avatar,
    PageHeader,
    DataTable,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableToolbar,
    SearchInput,
    EmptyState,
    StatCard,
    StatusDot,
    Input,
    TextArea,
    Modal,
    IconButton,
    Alert,
    Skeleton,
    PageSkeleton,
    ConfirmDialog
} from './primitives'
export { GlobalRail } from './GlobalRail'
export { MainSidebar } from './MainSidebar'
export { Sidebar, SidebarGroup, SidebarItem } from './Sidebar'
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './Dropdown'
```

Update `src/design/README.md` typography + layout sections:
```markdown
## Typography
- Font: Plus Jakarta Sans (system fallback)
- Sizes: xs(12px), sm(14px), base(16px), lg(18px), xl(20px), 2xl(24px)
- Weights: normal(400), medium(500), semibold(600), bold(700)

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ [MAIN SIDEBAR] │ [INNER SIDEBAR]  │  [MAIN CONTENT]             │
│ 264px/76px     │ 280px            │  flex-1                      │
│ Collapsible    │ Context-specific │  Scrollable                  │
│ Logo + Nav     │                  │                              │
└─────────────────────────────────────────────────────────────────┘
```

### MainSidebar
- Width: 264px (expanded) / 76px (collapsed)
- Background: slate-50/70
- Border-right: 1px slate-200/80
- Items: Icon + label; active pill uses primary blue
- Toggle: Netlify-style chip button under logo
```

**Step 4: Run test to verify it passes**

Run:
```bash
node scripts/tests/main-sidebar.test.js
```
Expected: PASS (no output).

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/layout.tsx src/design/index.ts src/design/README.md scripts/tests/main-sidebar.test.js
git commit -m "feat(phase-1): wire main sidebar into dashboard"
```

---

### Task 4: Update Product Docs + Verify Build

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`
- Test: N/A

**Step 1: Update ROADMAP**

Add a checked item under the most relevant phase (Phase 1 or Phase 3.6) describing the new MainSidebar and update the "Last Updated" date to today (2026-02-04).

**Step 2: Update PRD**

Append a Tech Decision noting the switch to Plus Jakarta Sans and that it uses a web font (call out the previous system-font decision and why this change is acceptable).
Update "Last Updated" to today (2026-02-04).

**Step 3: Update RELEASE**

Under `[Unreleased]` → `Added`, add an entry for the Crisp-inspired MainSidebar and collapse toggle. Under `Changed`, note the global font change to Plus Jakarta Sans.

**Step 4: Run build verification**

Run:
```bash
npm run build
```
Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: document main sidebar + font update"
```

---

### Manual Verification Checklist
- Sidebar defaults expanded; toggle collapses and expands with smooth animation.
- Collapsed state persists after refresh.
- Active route highlight matches current page.
- Hover/focus styles visible on nav items and toggle.
- i18n keys present in both `messages/en.json` and `messages/tr.json`.
- No layout overflow in dashboard pages.
