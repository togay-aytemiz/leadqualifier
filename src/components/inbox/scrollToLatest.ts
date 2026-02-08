export const DEFAULT_SCROLL_TO_LATEST_THRESHOLD = 96

export function getDistanceFromBottom(element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>) {
    return Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight)
}

export function shouldShowScrollToLatestButton(distanceFromBottom: number, threshold = DEFAULT_SCROLL_TO_LATEST_THRESHOLD) {
    return distanceFromBottom > threshold
}
