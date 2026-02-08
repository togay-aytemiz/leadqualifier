import type { ChatMessage } from '@/lib/chat/actions'

export function getSimulatorShellClasses() {
    return 'lg:col-span-2 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm'
}

export function getSimulatorHeaderClasses() {
    return 'z-10 flex items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 shadow-sm'
}

export function getSimulatorMessagesPaneClasses() {
    return 'flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50 to-slate-100 p-4'
}

export function getSimulatorInputBarClasses() {
    return 'border-t border-slate-200 bg-white px-4 py-3'
}

export function getSimulatorInputClasses() {
    return 'flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100'
}

export function getSimulatorSendButtonClasses() {
    return 'rounded-xl bg-slate-900 p-2 text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50'
}

export function getSimulatorBubbleClasses(role: ChatMessage['role']) {
    return role === 'user'
        ? 'rounded-2xl rounded-br-md bg-indigo-600 text-white'
        : 'rounded-2xl rounded-bl-md border border-zinc-200 bg-white text-zinc-900'
}

export function getSimulatorTimestampClasses(role: ChatMessage['role']) {
    return role === 'user' ? 'text-indigo-100' : 'text-zinc-500'
}

export function getSimulatorTokenUsageClasses(role: ChatMessage['role']) {
    return role === 'user' ? 'text-indigo-100/90' : 'text-zinc-400'
}
