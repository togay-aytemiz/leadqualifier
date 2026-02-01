'use client'

import { Channel } from '@/types/database'
import { useState } from 'react'
import { Bug } from 'lucide-react'
import { debugTelegramChannel, disconnectChannel } from '@/lib/channels/actions'
import { Button, Badge } from '@/design'
import { ConfirmDialog } from '@/design/primitives'

interface ChannelCardProps {
    channel?: Channel
    type: 'telegram' | 'whatsapp'
    onConnect: () => void
}

export function ChannelCard({ channel, type, onConnect }: ChannelCardProps) {
    const [isDisconnecting, setIsDisconnecting] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const handleDebug = async () => {
        if (!channel) return
        const result = await debugTelegramChannel(channel.id)
        if (result.success) {
            alert(`Webhook Info:\n${JSON.stringify(result.info, null, 2)}`)
        } else {
            alert(`Debug Failed: ${result.error}`)
        }
    }

    const handleDisconnect = async () => {
        if (!channel) return

        setIsDisconnecting(true)
        try {
            await disconnectChannel(channel.id)
            setShowConfirm(false)
        } catch {
            console.error('Failed to disconnect')
        } finally {
            setIsDisconnecting(false)
        }
    }

    const isConnected = !!channel

    return (
        <>
            <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center text-center relative overflow-hidden group shadow-sm hover:shadow-md transition-shadow">
                {isConnected && (
                    <button onClick={handleDebug} className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 p-1" title="Debug Webhook">
                        <Bug size={16} />
                    </button>
                )}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-3xl transition-transform group-hover:scale-110 ${type === 'telegram' ? 'bg-blue-50 text-blue-500' : 'bg-green-50 text-green-500'
                    }`}>
                    {type === 'telegram' ? (
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.4-1.08.39-.35-.01-1.04-.2-1.55-.37-.62-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" /></svg>
                    ) : (
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                    )}
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-1 capitalize">{type}</h3>

                {isConnected ? (
                    <>
                        <p className="text-gray-500 text-sm mb-4 truncate w-full px-4">{channel.name}</p>
                        <div className="mt-auto">
                            <Badge variant="success">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
                                Active
                            </Badge>
                            <div className="mt-4 w-full">
                                <Button
                                    onClick={() => setShowConfirm(true)}
                                    disabled={isDisconnecting}
                                    variant="danger"
                                    className="w-full"
                                >
                                    Disconnect
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-gray-400 text-sm mb-6">Not connected</p>
                        <Button onClick={onConnect} variant="secondary" className="mt-auto w-full">
                            Connect
                        </Button>
                    </>
                )}
            </div>

            <ConfirmDialog
                isOpen={showConfirm}
                title="Disconnect Channel?"
                description="Are you sure you want to disconnect this channel? The bot will stop responding to messages."
                confirmText="Disconnect"
                cancelText="Cancel"
                isDestructive
                isLoading={isDisconnecting}
                onConfirm={handleDisconnect}
                onCancel={() => setShowConfirm(false)}
            />
        </>
    )
}
