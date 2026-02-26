'use client'

import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface DropdownContextType {
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    toggle: () => void
}

const DropdownContext = createContext<DropdownContextType | undefined>(undefined)

export function DropdownMenu({
    children,
    fullWidth = false,
    onOpenChange
}: {
    children: React.ReactNode
    fullWidth?: boolean
    onOpenChange?: (open: boolean) => void
}) {
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const setOpen = (open: boolean) => {
        setIsOpen(open)
        onOpenChange?.(open)
    }
    const toggle = () => setOpen(!isOpen)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [])

    return (
        <DropdownContext.Provider value={{ isOpen, setIsOpen: setOpen, toggle }}>
            <div
                className={cn(
                    'relative text-left',
                    fullWidth ? 'block w-full' : 'inline-block'
                )}
                data-dropdown-open={isOpen ? 'true' : 'false'}
                ref={dropdownRef}
            >
                {children}
            </div>
        </DropdownContext.Provider>
    )
}

export function DropdownMenuTrigger({ asChild, children, onClick, ...props }: React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) {
    const context = useContext(DropdownContext)
    if (!context) throw new Error('DropdownMenuTrigger must be used within a DropdownMenu')

    const handleClick = (e: React.MouseEvent) => {
        // e.stopPropagation() handled by caller if needed, but usually trigger should toggle
        // If we stop prop here, it might block other things. 
        // But for a dropdown trigger, we usually want to toggle.
        context.toggle()
        if (onClick) onClick(e as React.MouseEvent<HTMLDivElement>)
    }

    if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            onClick: handleClick,
            ...props
        })
    }

    return (
        <div onClick={handleClick} {...props} className={cn("cursor-pointer", props.className)}>
            {children}
        </div>
    )
}

export function DropdownMenuContent({ children, align = 'end', className }: { children: React.ReactNode, align?: 'start' | 'end', className?: string }) {
    const context = useContext(DropdownContext)
    if (!context) throw new Error('DropdownMenuContent must be used within a DropdownMenu')
    const [isRendered, setIsRendered] = useState(false)
    const [visualState, setVisualState] = useState<'opening' | 'open' | 'closing'>('closing')

    useEffect(() => {
        if (context.isOpen) {
            setIsRendered(true)
            setVisualState('opening')

            let raf1 = 0
            let raf2 = 0
            raf1 = window.requestAnimationFrame(() => {
                raf2 = window.requestAnimationFrame(() => {
                    setVisualState('open')
                })
            })

            return () => {
                window.cancelAnimationFrame(raf1)
                window.cancelAnimationFrame(raf2)
            }
        }

        if (!isRendered) return

        setVisualState('closing')
        const timeoutId = window.setTimeout(() => {
            setIsRendered(false)
        }, 220)

        return () => window.clearTimeout(timeoutId)
    }, [context.isOpen, isRendered])

    if (!isRendered) return null

    return (
        <div
            className={cn(
                'absolute z-50 mt-2 w-48 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none transform-gpu transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
                visualState === 'open'
                    ? 'translate-y-0 scale-100 opacity-100'
                    : visualState === 'opening'
                        ? 'translate-y-3 scale-[0.955] opacity-0'
                        : '-translate-y-2 scale-[0.985] opacity-0',
                context.isOpen ? 'pointer-events-auto' : 'pointer-events-none',
                className
            )}
        >
            <div className="py-1">
                {children}
            </div>
        </div>
    )
}

export function DropdownMenuItem({
    children,
    onClick,
    className,
    asChild = false
}: {
    children: React.ReactNode
    onClick?: (e: React.MouseEvent) => void
    className?: string
    asChild?: boolean
}) {
    const context = useContext(DropdownContext)
    const baseClassName = cn(
        'flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors text-left',
        className
    )

    const handleClick = (e: React.MouseEvent) => {
        if (!asChild) {
            e.preventDefault()
        }
        e.stopPropagation()
        if (onClick) onClick(e)
        context?.setIsOpen(false)
    }

    if (asChild && React.isValidElement(children)) {
        const child = children as React.ReactElement<Record<string, unknown>>
        const childOnClick = child.props.onClick as ((e: React.MouseEvent) => void) | undefined
        const childClassName = typeof child.props.className === 'string' ? child.props.className : undefined

        return React.cloneElement(child, {
            className: cn(baseClassName, childClassName),
            onClick: (e: React.MouseEvent) => {
                handleClick(e)
                childOnClick?.(e)
            }
        })
    }

    return (
        <button
            className={baseClassName}
            onClick={handleClick}
        >
            {children}
        </button>
    )
}
