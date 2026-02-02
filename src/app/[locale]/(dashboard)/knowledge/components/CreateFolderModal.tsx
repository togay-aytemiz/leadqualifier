'use client'

import { useState } from 'react'
import { Modal, Input, Button } from '@/design'
import { useTranslations } from 'next-intl'

interface CreateFolderModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (name: string) => Promise<void>
}

export function CreateFolderModal({ isOpen, onClose, onSubmit }: CreateFolderModalProps) {
    const t = useTranslations('knowledge.folderModal')
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)

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

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('title')}>
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
                    <Button onClick={handleSubmit} disabled={loading || !name.trim()}>
                        {loading ? t('creating') : t('create')}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
