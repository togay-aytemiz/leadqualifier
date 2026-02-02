'use client'

import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface DropdownContextType {
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    toggle: () => void
}

const DropdownContext = createContext<DropdownContextType | undefined>(undefined)

export function DropdownMenu({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const toggle = () => setIsOpen(!isOpen)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [])

    return (
        <DropdownContext.Provider value={{ isOpen, setIsOpen, toggle }}>
            <div className="relative inline-block text-left" ref={dropdownRef}>
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
        return React.cloneElement(children as React.ReactElement<any>, {
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

    if (!context.isOpen) return null

    return (
        <div
            className={cn(
                "absolute z-50 mt-2 w-48 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none animate-in fade-in zoom-in-95 duration-100",
                align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
                className
            )}
        >
            <div className="py-1">
                {children}
            </div>
        </div>
    )
}

export function DropdownMenuItem({ children, onClick, className }: { children: React.ReactNode, onClick?: (e: React.MouseEvent) => void, className?: string }) {
    const context = useContext(DropdownContext)

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (onClick) onClick(e)
        context?.setIsOpen(false)
    }

    return (
        <button
            className={cn(
                "flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors text-left",
                className
            )}
            onClick={handleClick}
        >
            {children}
        </button>
    )
}
