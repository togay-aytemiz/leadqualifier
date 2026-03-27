export type DashboardTypographyScope = 'content' | 'sidebar'

export type DashboardTypographyVariables = Record<`--${string}`, string>

const DASHBOARD_TYPOGRAPHY_TOKENS = {
    content: {
        'text-xs': '0.71875rem',
        'text-xs--line-height': 'calc(1 / 0.71875)',
        'text-sm': '0.84375rem',
        'text-sm--line-height': 'calc(1.25 / 0.84375)',
        'text-base': '0.9375rem',
        'text-base--line-height': 'calc(1.5 / 0.9375)',
        'text-lg': '1.0625rem',
        'text-lg--line-height': 'calc(1.75 / 1.0625)',
        'text-xl': '1.1875rem',
        'text-xl--line-height': 'calc(1.75 / 1.1875)',
        'text-2xl': '1.40625rem',
        'text-2xl--line-height': 'calc(2 / 1.40625)'
    },
    sidebar: {
        'text-xs': '0.78125rem',
        'text-xs--line-height': 'calc(1 / 0.78125)',
        'text-sm': '0.90625rem',
        'text-sm--line-height': 'calc(1.25 / 0.90625)',
        'text-base': '1.03125rem',
        'text-base--line-height': 'calc(1.5 / 1.03125)',
        'text-lg': '1.15625rem',
        'text-lg--line-height': 'calc(1.75 / 1.15625)'
    }
} as const satisfies Record<DashboardTypographyScope, Record<string, string>>

export function resolveDashboardTypographyVariables(
    scope: DashboardTypographyScope
): DashboardTypographyVariables {
    const prefix = scope === 'content'
        ? '--dashboard-content'
        : '--dashboard-sidebar'

    return Object.fromEntries(
        Object.entries(DASHBOARD_TYPOGRAPHY_TOKENS[scope]).map(([token, value]) => [`${prefix}-${token}`, value])
    ) as DashboardTypographyVariables
}
