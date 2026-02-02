'use client'

import { Folder, MoreVertical } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface FolderCardProps {
    id: string
    name: string
    count?: number
}

export function FolderCard({ id, name, count = 0 }: FolderCardProps) {
    const router = useRouter()

    return (
        <div
            onClick={() => router.push(`/knowledge?collectionId=${id}`)}
            className="flex flex-col p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all group"
        >
            <div className="flex justify-between items-start mb-3">
                <div className="bg-blue-50 text-blue-500 p-2 rounded-lg">
                    <Folder size={24} fill="currentColor" className="opacity-20" />
                </div>
                <button className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical size={16} />
                </button>
            </div>
            <h3 className="font-semibold text-gray-900 truncate" title={name}>{name}</h3>
            <p className="text-xs text-gray-500 mt-1">{count} items</p>
        </div>
    )
}
