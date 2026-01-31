'use client'

import { useState } from 'react'
import { Button, Modal, Input, Alert } from '@/design'

interface ConnectTelegramModalProps {
    isOpen: boolean
    onClose: () => void
    onConnect: (token: string) => Promise<void>
}

export function ConnectTelegramModal({ isOpen, onClose, onConnect }: ConnectTelegramModalProps) {
    const [token, setToken] = useState('')
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!token.trim()) return

        setIsConnecting(true)
        setError('')

        try {
            await onConnect(token)
            setToken('')
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect')
        } finally {
            setIsConnecting(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Connect Telegram Bot">
            <form onSubmit={handleSubmit} className="space-y-5">
                <Alert variant="info">
                    <p className="font-medium mb-2">How to get your Bot Token:</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-700">
                        <li>Open Telegram and search for <strong>@BotFather</strong></li>
                        <li>Send <code className="bg-blue-100 px-1 rounded">/newbot</code> to create a new bot</li>
                        <li>Copy the API token that looks like <code className="bg-blue-100 px-1 rounded">123456:ABC...</code></li>
                    </ol>
                </Alert>

                <div>
                    <Input
                        label="Bot Token"
                        value={token}
                        onChange={(val: string) => setToken(val)}
                        placeholder="123456789:ABCDEF..."
                        className="font-mono bg-white"
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
        </Modal>
    )
}
