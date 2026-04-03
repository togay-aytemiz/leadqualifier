'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { Button, Modal } from '@/design'
import { Link } from '@/i18n/navigation'
import { buildWorkspaceIntroStorageKey, type WorkspaceIntroSurface } from '@/lib/workspace-intro'

interface WorkspaceIntroItem {
  id: string
  icon: ReactNode
  title: string
  body: string
}

interface WorkspaceIntroModalProps {
  storageScope: WorkspaceIntroSurface
  userId: string
  organizationId: string
  title: string
  description: string
  primaryCta: string
  secondaryCta?: string
  secondaryHref?: string
  items: WorkspaceIntroItem[]
}

function persistWorkspaceIntroSeen(storageKey: string) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(storageKey, new Date().toISOString())
}

export function WorkspaceIntroModal({
  storageScope,
  userId,
  organizationId,
  title,
  description,
  primaryCta,
  secondaryCta,
  secondaryHref,
  items,
}: WorkspaceIntroModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const storageKey = useMemo(
    () => buildWorkspaceIntroStorageKey({ userId, organizationId, surface: storageScope }),
    [organizationId, storageScope, userId]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hasSeenIntro = window.localStorage.getItem(storageKey)
    if (!hasSeenIntro) {
      setIsOpen(true)
    }
  }, [storageKey])

  function handleClose() {
    persistWorkspaceIntroSeen(storageKey)
    setIsOpen(false)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      panelClassName="max-w-2xl rounded-[28px]"
      bodyClassName="p-5 sm:p-6"
    >
      <div className="space-y-5">
        <p className="text-sm leading-7 text-slate-600">{description}</p>

        <div className="space-y-2.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3.5 py-3"
            >
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 shadow-[0_12px_26px_-22px_rgba(124,58,237,0.8)]">
                {item.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {secondaryCta && secondaryHref ? (
            <Link
              href={secondaryHref}
              onClick={handleClose}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-violet-200 bg-white px-4 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50"
            >
              {secondaryCta}
            </Link>
          ) : null}

          <Button
            type="button"
            onClick={handleClose}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {primaryCta}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
