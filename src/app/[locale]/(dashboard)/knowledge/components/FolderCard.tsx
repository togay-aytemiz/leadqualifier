import { Link } from '@/i18n/navigation'
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
        <article className="flex flex-col p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group">
            <div className="flex items-start justify-between gap-3">
                <Link
                    href={`/knowledge?collectionId=${id}`}
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/20"
                >
                    <div className="bg-blue-50 text-blue-500 p-2 rounded-lg">
                        <Folder size={24} fill="currentColor" className="opacity-20" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate" title={name}>{name}</h3>
                        <p className="text-xs text-gray-500 mt-1">{t('itemsCount', { count })}</p>
                    </div>
                </Link>
                {!isReadOnly && (
                    <FolderActions
                        collection={{ id, name, count }}
                        trigger={
                            <button
                                type="button"
                                className="p-1 text-gray-400 opacity-100 transition-opacity hover:text-gray-600 lg:opacity-0 lg:group-hover:opacity-100"
                            >
                                <MoreVertical size={16} />
                            </button>
                        }
                        onDeleteSuccess={handleRefresh}
                        onUpdate={handleRefresh}
                    />
                )}
            </div>
        </article>
    )
}
