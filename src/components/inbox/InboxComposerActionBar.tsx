'use client'

import { Loader2, Send } from 'lucide-react'
import { HiOutlineDocumentText } from 'react-icons/hi2'
import { cn } from '@/lib/utils'

interface InboxComposerActionBarProps {
  templateLabel: string
  sendLabel: string
  isTemplateDisabled: boolean
  isSendDisabled: boolean
  isSending: boolean
  onTemplateClick: () => void
  onSendClick: () => void
  sendTitle?: string
  sendAriaLabel?: string
}

const COMPOSER_ACTION_CLASSNAME =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl px-0 text-sm font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-3'

export function InboxComposerActionBar({
  templateLabel,
  sendLabel,
  isTemplateDisabled,
  isSendDisabled,
  isSending,
  onTemplateClick,
  onSendClick,
  sendTitle,
  sendAriaLabel,
}: InboxComposerActionBarProps) {
  return (
    <div className="flex shrink-0 items-stretch gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={onTemplateClick}
        disabled={isTemplateDisabled}
        aria-label={templateLabel}
        title={templateLabel}
        className={cn(
          COMPOSER_ACTION_CLASSNAME,
          'border border-gray-200 bg-white text-emerald-700 hover:bg-emerald-50'
        )}
      >
        <HiOutlineDocumentText size={16} />
        <span className="hidden sm:inline">{templateLabel}</span>
      </button>

      <button
        type="button"
        onClick={onSendClick}
        disabled={isSendDisabled}
        aria-label={sendAriaLabel ?? sendLabel}
        title={sendTitle}
        className={cn(
          COMPOSER_ACTION_CLASSNAME,
          isSendDisabled
            ? 'bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-700'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        )}
      >
        {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        <span className="hidden sm:inline">{sendLabel}</span>
      </button>
    </div>
  )
}
