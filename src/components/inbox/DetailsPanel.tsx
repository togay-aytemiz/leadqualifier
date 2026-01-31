import { Conversation } from '@/types/database'

interface DetailsPanelProps {
    conversation: Conversation
}

export function DetailsPanel({ conversation }: DetailsPanelProps) {
    return (
        <aside className="w-80 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto hidden lg:block">
            <div className="flex border-b border-gray-200 px-4 py-3 items-center space-x-4">
                <button className="text-sm font-semibold text-blue-600 border-b-2 border-blue-600 pb-3 -mb-3.5">Details</button>
                <button className="text-sm font-medium text-gray-500 hover:text-gray-700 pb-3 -mb-3.5 flex items-center space-x-1">
                    <span>AI Copilot</span>
                </button>
            </div>

            <div className="p-5 space-y-6">
                <div className="text-center">
                    <div className="h-20 w-20 mx-auto rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-600 mb-3">
                        {conversation.contact_name.charAt(0).toUpperCase()}
                    </div>
                    <h3 className="font-bold text-gray-900">{conversation.contact_name}</h3>
                    <p className="text-sm text-gray-500">{conversation.contact_phone || 'No phone'}</p>
                </div>

                <hr className="border-gray-100" />

                <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Conversation Attributes</h4>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500">ID</span>
                            <span className="text-gray-800 font-mono text-xs">{conversation.id.slice(0, 8)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Platform</span>
                            <span className="text-gray-800 capitalize">{conversation.platform}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Status</span>
                            <span className="text-gray-800 capitalize bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs">
                                {conversation.status}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Created</span>
                            <span className="text-gray-800">{new Date(conversation.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>

                <hr className="border-gray-100" />

                <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                        {conversation.tags?.map(tag => (
                            <span key={tag} className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{tag}</span>
                        )) || <span className="text-sm text-gray-400">No tags</span>}
                        <button className="text-xs text-blue-600 hover:text-blue-700">+ Add</button>
                    </div>
                </div>
            </div>
        </aside>
    )
}
