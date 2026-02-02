'use client'

import { useState } from 'react'
import { Modal, Input, TextArea, Button } from '@/design'

interface CreateContentModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (title: string, content: string) => Promise<void>
}

export function CreateContentModal({ isOpen, onClose, onSubmit }: CreateContentModalProps) {
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
        <Modal isOpen={isOpen} onClose={onClose} title="Add New Content">
            <div className="space-y-4">
                <Input
                    label="Title"
                    value={title}
                    onChange={setTitle}
                    placeholder="e.g. Return Policy"
                    autoFocus
                />
                <TextArea
                    label="Content"
                    value={content}
                    onChange={setContent}
                    rows={6}
                    placeholder="Paste relevant text content here..."
                />
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={loading || !title.trim() || !content.trim()}>
                        {loading ? 'Adding...' : 'Add Content'}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
