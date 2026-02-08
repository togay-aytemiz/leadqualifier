export function getSkillsMobileListPaneClasses(isDetailOpen: boolean): string {
    return isDetailOpen
        ? '-translate-x-full pointer-events-none'
        : 'translate-x-0 pointer-events-auto'
}

export function getSkillsMobileDetailPaneClasses(isDetailOpen: boolean): string {
    return isDetailOpen
        ? 'translate-x-0 pointer-events-auto'
        : 'translate-x-full pointer-events-none'
}
