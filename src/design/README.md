# LeadQualifier Design System

## Inspiration
- Intercom.com (clean, minimal, professional)
- Expo.dev (modern, developer-focused)
- TradingView.com (data-dense but elegant)

## Color Tokens

### Base
- `--color-white`: #FFFFFF
- `--color-gray-50`: #F9FAFB
- `--color-gray-100`: #F3F4F6
- `--color-gray-200`: #E5E7EB
- `--color-gray-300`: #D1D5DB
- `--color-gray-400`: #9CA3AF
- `--color-gray-500`: #6B7280
- `--color-gray-600`: #4B5563
- `--color-gray-700`: #374151
- `--color-gray-800`: #1F2937
- `--color-gray-900`: #111827

### Primary (Blue)
- `--color-primary-50`: #EFF6FF
- `--color-primary-100`: #DBEAFE
- `--color-primary-500`: #3B82F6
- `--color-primary-600`: #2563EB
- `--color-primary-700`: #1D4ED8

### Status
- Success: Green-500 (#22C55E)
- Warning: Yellow-500 (#EAB308)
- Error: Red-500 (#EF4444)
- Info: Blue-500 (#3B82F6)

## Typography
- Font: Inter (system fallback)
- Sizes: xs(12px), sm(14px), base(16px), lg(18px), xl(20px), 2xl(24px)
- Weights: normal(400), medium(500), semibold(600), bold(700)

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ [GLOBAL RAIL]  │ [INNER SIDEBAR]  │  [MAIN CONTENT]             │
│ 72px           │ 280px            │  flex-1                      │
│ Icons only     │ Search + Groups  │  PageHeader + Body           │
│ Logo on top    │ Context-specific │  Scrollable                  │
│ Avatar bottom  │                  │                              │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### GlobalRail
- Width: 72px
- Background: white
- Border-right: 1px gray-200
- Items: Icon buttons with tooltip on hover
- Active state: bg-primary-50, text-primary-600

### Sidebar
- Width: 280px
- Header: Title, optional search
- Groups with labels
- Items with icon, label, optional badge

### PageHeader
- Height: 64px (h-16)
- Sticky top
- Title on left, Actions on right
- Border-bottom

### Button Variants
- primary: bg-blue-500, text-white
- secondary: bg-white, border, text-gray-700
- ghost: transparent, text-gray-600
- outline: transparent, border, text-gray-700

### Badge Variants
- neutral: gray
- success: green
- warning: yellow
- error: red
- info: blue
- purple: purple

### Avatar
- Sizes: sm(24px), md(32px), lg(48px)
- Initials with random pastel background
