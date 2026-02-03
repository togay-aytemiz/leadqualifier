'use client'

import { useState } from 'react'
import { Modal, Input, TextArea, Button } from '@/design'
import { useTranslations } from 'next-intl'

interface CreateContentModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (title: string, content: string) => Promise<void>
}

export function CreateContentModal({ isOpen, onClose, onSubmit }: CreateContentModalProps) {
    const t = useTranslations('knowledge')
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit() {
        if (!title.trim() || !content.trim()) return
        setLoading(true)
        try {
            await onSubmit(title, content)
            setTitle('')
            setContent('')
            onClose()
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('createTitle')}>
            <div className="space-y-4">
                <Input
                    label={t('form.title')}
                    value={title}
                    onChange={setTitle}
                    placeholder={t('form.titlePlaceholder')}
                    autoFocus
                />
                <TextArea
                    label={t('form.content')}
                    value={content}
                    onChange={setContent}
                    rows={6}
                    placeholder={t('form.contentPlaceholder')}
                />
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={onClose}>{t('form.cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={loading || !title.trim() || !content.trim()}>
                        {loading ? t('form.saving') : t('form.save')}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
