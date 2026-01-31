import { Conversation } from '@/types/database'
import { formatDistanceToNow } from 'date-fns'

interface ConversationListProps {
    conversations: Conversation[]
    selectedId: string | null
    onSelect: (id: string) => void
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
    return (
        <aside className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="font-bold text-lg text-gray-800">Inbox</h2>
                <div className="flex space-x-1">
                    <button className="p-1 rounded hover:bg-gray-100 text-gray-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                    <button className="p-1 rounded hover:bg-gray-100 text-gray-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {conversations.map((conv) => (
                    <div
                        key={conv.id}
                        onClick={() => onSelect(conv.id)}
                        className={`p-3 border-l-4 cursor-pointer hover:bg-gray-50 transition-colors ${selectedId === conv.id
                                ? 'bg-blue-50 border-blue-500'
                                : 'border-transparent border-b border-gray-100'
                            }`}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center space-x-2">
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${conv.platform === 'whatsapp' ? 'bg-green-500' :
                                        conv.platform === 'telegram' ? 'bg-blue-400' : 'bg-purple-500'
                                    }`}>
                                    {conv.contact_name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <span className="font-semibold text-sm text-gray-900 block">{conv.contact_name}</span>
                                    {conv.platform !== 'simulator' && (
                                        <span className="text-[10px] text-gray-400 capitalize">{conv.platform}</span>
                                    )}
                                </div>
                            </div>
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                                {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false }).replace('about ', '')}
                            </span>
                        </div>
                        {conv.unread_count > 0 && (
                            <div className="flex justify-end mt-1">
                                <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                    {conv.unread_count}
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </aside>
    )
}
