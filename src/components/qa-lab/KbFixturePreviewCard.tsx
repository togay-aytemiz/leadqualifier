'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { Button } from '@/design'

const PREVIEW_LINE_LIMIT = 8

interface KbFixturePreviewCardProps {
    sectionTitle: string
    lineCountText: string
    fixtureTitle: string
    fixtureLines: string[]
    emptyText: string
    previewLabel: string
    viewFullText: string
    modalTitle: string
    closeText: string
}

export default function KbFixturePreviewCard({
    sectionTitle,
    lineCountText,
    fixtureTitle,
    fixtureLines,
    emptyText,
    previewLabel,
    viewFullText,
    modalTitle,
    closeText
}: KbFixturePreviewCardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const previewLines = useMemo(
        () => fixtureLines.slice(0, PREVIEW_LINE_LIMIT),
        [fixtureLines]
    )

    const modal = isModalOpen ? (
        <div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setIsModalOpen(false)}
        >
            <div
                className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                    <h3 className="text-base font-semibold text-gray-900">{modalTitle}</h3>
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        aria-label={closeText}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="max-h-[calc(88vh-58px)] overflow-auto p-4">
                    {fixtureLines.length === 0 ? (
                        <p className="text-sm text-gray-500">{emptyText}</p>
                    ) : (
                        <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-gray-50">
                            {fixtureLines.map((line, index) => (
                                <li key={`${index}-${line.slice(0, 24)}`} className="grid grid-cols-[auto,1fr] gap-3 px-3 py-2">
                                    <span className="mt-0.5 rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-500">
                                        {index + 1}
                                    </span>
                                    <span className="font-mono text-xs whitespace-pre-wrap break-words text-gray-700">
                                        {line}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </div>
    ) : null

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-900">{sectionTitle}</h2>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
                    {lineCountText}
                </span>
            </div>

            <p className="mt-2 text-sm text-gray-600">{fixtureTitle || '-'}</p>

            <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">{previewLabel}</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsModalOpen(true)}
                    disabled={fixtureLines.length === 0}
                >
                    {viewFullText}
                </Button>
            </div>

            {previewLines.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">{emptyText}</p>
            ) : (
                <div className="mt-3 max-h-[220px] overflow-auto rounded-lg border border-gray-200 bg-gray-50">
                    <ol className="divide-y divide-gray-100">
                        {previewLines.map((line, index) => (
                            <li key={`${index}-${line.slice(0, 24)}`} className="grid grid-cols-[auto,1fr] gap-3 px-3 py-2">
                                <span className="mt-0.5 rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-500">
                                    {index + 1}
                                </span>
                                <span className="font-mono text-xs whitespace-pre-wrap break-words text-gray-700">
                                    {line}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {isModalOpen && typeof document !== 'undefined' ? createPortal(modal, document.body) : null}
        </div>
    )
}
