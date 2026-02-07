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
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)

    // Sync name when modal opens
    // Using a simple effect to reset name when isOpen becomes true
    const [prevOpen, setPrevOpen] = useState(false)
    if (isOpen && !prevOpen) {
        setPrevOpen(true)
        setName(initialName)
    } else if (!isOpen && prevOpen) {
        setPrevOpen(false)
    }

    async function handleSubmit() {
        if (!name.trim()) return
        setLoading(true)
        try {
            await onSubmit(name)
            setName('')
            onClose()
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const isEdit = !!initialName

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? t('editTitle') : t('title')}>
            <div className="space-y-4">
                <Input
                    label={t('nameLabel')}
                    value={name}
                    onChange={setName}
                    placeholder={t('namePlaceholder')}
                    autoFocus
                />
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || !name.trim()}
                        className="bg-[#242A40] hover:bg-[#1B2033] border-transparent text-white"
                    >
                        {loading ? (isEdit ? t('saving') : t('creating')) : (isEdit ? t('save') : t('create'))}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
