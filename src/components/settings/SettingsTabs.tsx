'use client'

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface SettingsTabItem {
    id: string
    label: string
}

interface SettingsTabsProps {
    tabs: SettingsTabItem[]
    activeTabId?: string
    defaultTabId?: string
    onTabChange?: (tabId: string) => void
    children: (activeTabId: string) => ReactNode
}

function resolveInitialTabId(tabs: SettingsTabItem[], activeTabId?: string, defaultTabId?: string) {
    if (activeTabId && tabs.some(tab => tab.id === activeTabId)) {
        return activeTabId
    }
    if (defaultTabId && tabs.some(tab => tab.id === defaultTabId)) {
        return defaultTabId
    }
    return tabs[0]?.id ?? ''
}

export function SettingsTabs({
    tabs,
    activeTabId,
    defaultTabId,
    onTabChange,
    children
}: SettingsTabsProps) {
    const [internalActiveTabId, setInternalActiveTabId] = useState(() => resolveInitialTabId(tabs, activeTabId, defaultTabId))
    const resolvedActiveTabId = activeTabId ?? internalActiveTabId
    const contentRef = useRef<HTMLDivElement | null>(null)
    const [contentHeight, setContentHeight] = useState<number | null>(null)
    const tabButtonIdPrefix = 'settings-tab'
    const tabPanelIdPrefix = 'settings-tab-panel'

    useEffect(() => {
        if (activeTabId && tabs.some(tab => tab.id === activeTabId)) {
            setInternalActiveTabId(activeTabId)
        }
    }, [activeTabId, tabs])

    useLayoutEffect(() => {
        const element = contentRef.current
        if (!element) return

        const measureHeight = () => {
            const nextHeight = element.getBoundingClientRect().height
            setContentHeight((current) => {
                if (current === null) return nextHeight
                return Math.abs(current - nextHeight) < 1 ? current : nextHeight
            })
        }

        measureHeight()

        let observer: ResizeObserver | null = null
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => {
                measureHeight()
            })
            observer.observe(element)
        }

        const onWindowResize = () => {
            measureHeight()
        }
        window.addEventListener('resize', onWindowResize)

        return () => {
            observer?.disconnect()
            window.removeEventListener('resize', onWindowResize)
        }
    }, [resolvedActiveTabId])

    if (tabs.length === 0) return null

    return (
        <div className="space-y-4">
            <div className="border-b border-gray-200">
                <div role="tablist" aria-label={tabs.map(tab => tab.label).join(' / ')} className="flex items-end gap-4">
                    {tabs.map(tab => {
                        const isActive = tab.id === resolvedActiveTabId
                        return (
                            <button
                                key={tab.id}
                                id={`${tabButtonIdPrefix}-${tab.id}`}
                                role="tab"
                                type="button"
                                aria-selected={isActive}
                                aria-controls={`${tabPanelIdPrefix}-${tab.id}`}
                                onClick={() => {
                                    setInternalActiveTabId(tab.id)
                                    onTabChange?.(tab.id)
                                }}
                                className={`-mb-px flex-1 sm:flex-none border-b-2 px-1 pb-2.5 pt-1 text-center sm:text-left text-sm font-semibold transition-colors ${isActive ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                {tab.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            <div
                className="overflow-hidden transition-[height] duration-300 ease-out"
                style={contentHeight === null ? undefined : { height: `${contentHeight}px` }}
            >
                <div
                    ref={contentRef}
                    key={resolvedActiveTabId}
                    role="tabpanel"
                    id={`${tabPanelIdPrefix}-${resolvedActiveTabId}`}
                    aria-labelledby={`${tabButtonIdPrefix}-${resolvedActiveTabId}`}
                    className="pb-1"
                >
                    {children(resolvedActiveTabId)}
                </div>
            </div>
        </div>
    )
}
