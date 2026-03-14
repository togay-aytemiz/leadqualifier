'use client'

import { useState } from 'react'
import { Avatar, Modal } from '@/design'

interface ProfileAvatarCardProps {
    name: string
    email: string
    avatarUrl: string | null
    title: string
    description: string
    formatHint: string
    uploadLabel: string
    replaceLabel: string
    savingLabel: string
    inputLabel: string
    previewLabel: string
    previewTitle: string
    onSelectFile: (file: File | null) => void
    isUploading?: boolean
    errorMessage?: string | null
    statusMessage?: string | null
    inputAccept?: string
}

export function ProfileAvatarCard({
    name,
    email,
    avatarUrl,
    title,
    description,
    formatHint,
    uploadLabel,
    replaceLabel,
    savingLabel,
    inputLabel,
    previewLabel,
    previewTitle,
    onSelectFile,
    isUploading = false,
    errorMessage = null,
    statusMessage = null,
    inputAccept
}: ProfileAvatarCardProps) {
    const fallbackName = name.trim() || email.trim() || 'User'
    const normalizedAvatarUrl = typeof avatarUrl === 'string' ? avatarUrl.trim() : ''
    const hasAvatar = normalizedAvatarUrl.length > 0
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)

    return (
        <>
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        {hasAvatar ? (
                            <button
                                type="button"
                                aria-label={previewLabel}
                                onClick={() => setIsPreviewOpen(true)}
                                className="group relative inline-flex shrink-0 cursor-zoom-in rounded-full focus:outline-none focus:ring-2 focus:ring-[#242A40]/15 focus:ring-offset-2"
                            >
                                <Avatar
                                    name={fallbackName}
                                    src={normalizedAvatarUrl}
                                    size="lg"
                                    className="h-16 w-16 text-lg ring-2 ring-white transition-transform duration-150 group-hover:scale-[1.02]"
                                />
                                <span className="sr-only">{previewLabel}</span>
                            </button>
                        ) : (
                            <Avatar
                                name={fallbackName}
                                src={normalizedAvatarUrl}
                                size="lg"
                                className="h-16 w-16 text-lg ring-2 ring-white"
                            />
                        )}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                            <p className="mt-1 text-sm text-gray-500">{description}</p>
                            <p className="mt-2 text-xs font-medium text-gray-400">{formatHint}</p>
                        </div>
                    </div>

                    <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                        <input
                            type="file"
                            accept={inputAccept}
                            aria-label={inputLabel}
                            className="sr-only"
                            disabled={isUploading}
                            onChange={(event) => {
                                const nextFile = event.currentTarget.files?.[0] ?? null
                                event.currentTarget.value = ''
                                onSelectFile(nextFile)
                            }}
                        />
                        {isUploading ? savingLabel : (hasAvatar ? replaceLabel : uploadLabel)}
                    </label>
                </div>

                {errorMessage && (
                    <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
                )}
                {statusMessage && !errorMessage && (
                    <p className="mt-3 text-sm text-green-600">{statusMessage}</p>
                )}
            </div>

            <Modal
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                title={previewTitle}
            >
                {hasAvatar && (
                    <div className="space-y-4">
                        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-slate-50">
                            <img
                                src={normalizedAvatarUrl}
                                alt={fallbackName}
                                className="h-auto w-full object-cover"
                            />
                        </div>
                        <p className="text-sm text-gray-500">{description}</p>
                    </div>
                )}
            </Modal>
        </>
    )
}
