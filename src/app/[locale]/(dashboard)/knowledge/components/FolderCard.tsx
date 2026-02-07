import { Folder, MoreVertical } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { FolderActions } from './FolderActions'
import { useTranslations } from 'next-intl'

interface FolderCardProps {
    id: string
    name: string
    count?: number
    onRefresh?: () => void
    isReadOnly?: boolean
}

export function FolderCard({ id, name, count = 0, onRefresh, isReadOnly = false }: FolderCardProps) {
    const t = useTranslations('knowledge')
    const router = useRouter()

    const handleRefresh = () => {
        if (onRefresh) onRefresh()
        else router.refresh()
    }

    return (
        <div
            onClick={() => router.push(`/knowledge?collectionId=${id}`)}
            className="flex flex-col p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all group"
        >
            <div className="flex justify-between items-start mb-3">
                <div className="bg-blue-50 text-blue-500 p-2 rounded-lg">
                    <Folder size={24} fill="currentColor" className="opacity-20" />
                </div>
                {!isReadOnly && (
                    <div onClick={(e) => e.stopPropagation()}>
                        <FolderActions
                            collection={{ id, name, count }}
                            trigger={
                                <button className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                    <MoreVertical size={16} />
                                </button>
                            }
                            onDeleteSuccess={handleRefresh}
                            onUpdate={handleRefresh}
                        />
                    </div>
                )}
            </div>
            <h3 className="font-semibold text-gray-900 truncate" title={name}>{name}</h3>
            <p className="text-xs text-gray-500 mt-1">{t('itemsCount', { count })}</p>
        </div>
    )
}
