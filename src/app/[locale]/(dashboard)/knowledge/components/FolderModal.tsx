'use client'

import { useState } from 'react'
import { Modal, Input, Button } from '@/design'
import { useTranslations } from 'next-intl'

interface FolderModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (name: string) => Promise<void>
    initialName?: string
}

export function FolderModal({ isOpen, onClose, onSubmit, initialName = '' }: FolderModalProps) {
    const t = useTranslations('folderModal')
    const isEdit = !!initialName

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? t('editTitle') : t('title')}>
            <FolderModalForm
                key={`${isOpen ? 'open' : 'closed'}:${initialName}`}
                initialName={initialName}
                isEdit={isEdit}
                onClose={onClose}
                onSubmit={onSubmit}
                labels={{
                    cancel: t('cancel'),
                    create: t('create'),
                    creating: t('creating'),
                    editTitle: t('editTitle'),
                    nameLabel: t('nameLabel'),
                    namePlaceholder: t('namePlaceholder'),
                    save: t('save'),
                    saving: t('saving')
                }}
            />
        </Modal>
    )
}

interface FolderModalFormProps {
    initialName: string
    isEdit: boolean
    onClose: () => void
    onSubmit: (name: string) => Promise<void>
    labels: {
        cancel: string
        create: string
        creating: string
        editTitle: string
        nameLabel: string
        namePlaceholder: string
        save: string
        saving: string
    }
}

function FolderModalForm({ initialName, isEdit, onClose, onSubmit, labels }: FolderModalFormProps) {
    const [name, setName] = useState(() => initialName)
    const [loading, setLoading] = useState(false)

    async function handleSubmit() {
        const trimmedName = name.trim()
        if (!trimmedName) return

        setLoading(true)
        try {
            await onSubmit(trimmedName)
            onClose()
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-4">
            <Input
                label={labels.nameLabel}
                value={name}
                onChange={setName}
                placeholder={labels.namePlaceholder}
                autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={onClose}>{labels.cancel}</Button>
                <Button
                    onClick={handleSubmit}
                    disabled={loading || !name.trim()}
                    className="bg-[#242A40] hover:bg-[#1B2033] border-transparent text-white"
                >
                    {loading ? (isEdit ? labels.saving : labels.creating) : (isEdit ? labels.save : labels.create)}
                </Button>
            </div>
        </div>
    )
}
