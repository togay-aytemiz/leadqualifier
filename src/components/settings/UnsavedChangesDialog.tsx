'use client'

import { Modal, Button } from '@/design'

interface UnsavedChangesDialogProps {
    isOpen: boolean
    title: string
    description: string
    stayText: string
    discardText: string
    saveText: string
    isSaving?: boolean
    onStay: () => void
    onDiscard: () => void
    onSave: () => void
}

export function UnsavedChangesDialog({
    isOpen,
    title,
    description,
    stayText,
    discardText,
    saveText,
    isSaving = false,
    onStay,
    onDiscard,
    onSave
}: UnsavedChangesDialogProps) {
    return (
        <Modal isOpen={isOpen} onClose={onStay} title={title}>
            <p className="text-sm text-gray-600">{description}</p>
            <div className="mt-6 flex flex-col sm:flex-row sm:justify-end gap-2">
                <Button
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={onStay}
                    disabled={isSaving}
                >
                    {stayText}
                </Button>
                <Button
                    variant="danger"
                    className="w-full sm:w-auto"
                    onClick={onDiscard}
                    disabled={isSaving}
                >
                    {discardText}
                </Button>
                <Button
                    className="w-full sm:w-auto whitespace-nowrap"
                    onClick={onSave}
                    disabled={isSaving}
                >
                    {saveText}
                </Button>
            </div>
        </Modal>
    )
}
