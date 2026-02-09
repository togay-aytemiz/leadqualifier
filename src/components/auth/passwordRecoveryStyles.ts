type PasswordRecoveryInputOptions = {
    withTrailingIcon?: boolean
}

export function getPasswordRecoveryInputClasses(options?: PasswordRecoveryInputOptions): string {
    return [
        'block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400',
        options?.withTrailingIcon ? 'pr-10' : '',
        'focus:border-[#242A40] focus:outline-none focus:ring-2 focus:ring-[#242A40]/10',
    ]
        .filter(Boolean)
        .join(' ')
}

export function getPasswordRecoveryPrimaryButtonClasses(): string {
    return 'h-10 w-full border-transparent bg-[#242A40] text-white hover:bg-[#1B2033]'
}

export function getPasswordRecoveryLinkClasses(): string {
    return 'font-medium text-[#242A40] hover:text-[#1B2033]'
}
