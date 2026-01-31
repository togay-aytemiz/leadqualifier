'use client'

import { useState } from 'react'
import { Button } from '@/design'
import { X } from 'lucide-react'

interface ConnectTelegramModalProps {
    isOpen: boolean
    onClose: () => void
    onConnect: (token: string) => Promise<void>
}

export function ConnectTelegramModal({ isOpen, onClose, onConnect }: ConnectTelegramModalProps) {
    const [token, setToken] = useState('')
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState('')

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!token.trim()) return

        setIsConnecting(true)
        setError('')

        try {
            await onConnect(token)
            setToken('')
            onClose()
        } catch (err: any) {
            setError(err.message || 'Failed to connect')
        } finally {
            setIsConnecting(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white">
                    <h3 className="font-bold text-gray-900">Connect Telegram Bot</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700">
                        <p className="font-medium mb-2">How to get your Bot Token:</p>
                        <ol className="list-decimal list-inside space-y-1 text-blue-600">
                            <li>Open Telegram and search for <strong>@BotFather</strong></li>
                            <li>Send <code className="bg-blue-100 px-1 rounded">/newbot</code> to create a new bot</li>
                            <li>Copy the API token that looks like <code className="bg-blue-100 px-1 rounded">123456:ABC...</code></li>
                        </ol>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase">Bot Token</label>
                        <input
                            type="text"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="123456789:ABCDEF..."
                            className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm font-mono"
                            autoFocus
                        />
                        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={!token.trim() || isConnecting}>
                            {isConnecting ? 'Validating...' : 'Connect Bot'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}
