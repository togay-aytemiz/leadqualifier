'use client'

import { EmptyState } from '@/design'
import { HiOutlineUser } from 'react-icons/hi2'

interface LeadsEmptyStateProps {
    title: string
    description: string
}

export function LeadsEmptyState({ title, description }: LeadsEmptyStateProps) {
    return (
        <EmptyState
            icon={HiOutlineUser}
            title={title}
            description={description}
        />
    )
}
