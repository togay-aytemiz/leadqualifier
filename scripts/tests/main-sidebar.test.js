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

const dashboardLayout = fs.readFileSync(
    path.join(root, 'src', 'app', '[locale]', '(dashboard)', 'layout.tsx'),
    'utf8'
)
assert.ok(
    dashboardLayout.includes('MainSidebar'),
    'dashboard layout should use MainSidebar'
)
