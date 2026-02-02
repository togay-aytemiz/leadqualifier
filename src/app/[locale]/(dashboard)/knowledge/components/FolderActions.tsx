'use client'

import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    ConfirmDialog,
    IconButton
} from '@/design'
import { useTranslations } from 'next-intl'
import { deleteCollection, updateCollection } from '@/lib/knowledge-base/actions'
import { useRouter } from 'next/navigation'
import { FolderModal } from './FolderModal'

interface FolderActionsProps {
    collection: { id: string, name: string, count?: number }
    trigger?: React.ReactNode
    onDeleteSuccess?: () => void
    onUpdate?: () => void
    redirectOnDelete?: boolean
}

export function FolderActions({ collection, trigger, onDeleteSuccess, onUpdate, redirectOnDelete }: FolderActionsProps) {
    const t = useTranslations('knowledge')
    const tDelete = useTranslations('deleteFolder')
    const tModal = useTranslations('folderModal')
    const router = useRouter()

    const [isEditOpen, setIsEditOpen] = useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    async function handleRename(name: string) {
        await updateCollection(collection.id, name)
        window.dispatchEvent(new Event('knowledge-updated'))
        router.refresh()
        if (onUpdate) onUpdate()
    }

    async function handleDelete() {
        setIsDeleting(true)
        try {
            await deleteCollection(collection.id)
            if (redirectOnDelete) {
                router.push('/knowledge')
            } else {
                router.refresh()
            }
            if (onDeleteSuccess) onDeleteSuccess()
            setIsDeleteOpen(false)
        } catch (error) {
            console.error(error)
            alert(t('failedToDelete'))
        } finally {
            setIsDeleting(false)
        }
    }

    const count = collection.count || 0
    const deleteMessage = count > 0
        ? tDelete('description', { count })
        : tDelete('descriptionEmpty')

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    {trigger || (
                        <IconButton
                            icon={MoreHorizontal}
                            variant="ghost"
                            size="sm"
                            className="text-gray-400 hover:text-gray-600"
                        />
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); setIsEditOpen(true) }}>
                        <Pencil size={14} className="mr-2" />
                        {tModal('editTitle')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); setIsDeleteOpen(true) }}
                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                        <Trash2 size={14} className="mr-2" />
                        {tDelete('title')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <FolderModal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                onSubmit={handleRename}
                initialName={collection.name}
            />

            <ConfirmDialog
                isOpen={isDeleteOpen}
                onCancel={() => setIsDeleteOpen(false)}
                onConfirm={handleDelete}
                title={tDelete('title')}
                description={deleteMessage}
                confirmText={tDelete('confirm')}
                cancelText={tDelete('cancel')}
                isDestructive
                isLoading={isDeleting}
            />
        </>
    )
}
