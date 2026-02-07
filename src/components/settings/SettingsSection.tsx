import type { ReactNode } from 'react'

interface SettingsSectionProps {
    title: string
    description?: string
    descriptionAddon?: ReactNode
    summary?: string
    layout?: 'default' | 'wide'
    showTopDivider?: boolean
    showBottomDivider?: boolean
    children: ReactNode
}

const layoutClasses = {
    default: {
        left: 'lg:col-span-4 w-full lg:max-w-[300px]',
        right: 'lg:col-span-8 w-full lg:max-w-[720px]'
    },
    wide: {
        left: 'lg:col-span-3 w-full lg:max-w-[300px]',
        right: 'lg:col-span-9 w-full lg:max-w-[840px]'
    }
}

export function SettingsSection({
    title,
    description,
    descriptionAddon,
    summary,
    layout = 'default',
    showTopDivider = false,
    showBottomDivider = true,
    children
}: SettingsSectionProps) {
    const columns = layoutClasses[layout] ?? layoutClasses.default
    const dividerClasses = [
        showTopDivider ? 'border-t border-gray-200' : '',
        showBottomDivider ? 'border-b border-gray-200 last:border-b-0' : ''
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <div className={`py-6 ${dividerClasses}`}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className={columns.left}>
                    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                    {description && (
                        <p className="mt-2 text-sm text-gray-500 whitespace-pre-line">{description}</p>
                    )}
                    {descriptionAddon && (
                        <div className="mt-2">
                            {descriptionAddon}
                        </div>
                    )}
                </div>
                <div className={columns.right}>
                    {summary && <p className="text-xs font-semibold text-gray-500 mb-3">{summary}</p>}
                    {children}
                </div>
            </div>
        </div>
    )
}
