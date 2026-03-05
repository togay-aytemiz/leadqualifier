export const BILLING_UPDATED_EVENT = 'billing-updated'

interface BrowserEventTarget {
    dispatchEvent: (event: Event) => boolean
}

export function dispatchBillingUpdated(eventTarget: BrowserEventTarget = window) {
    eventTarget.dispatchEvent(new Event(BILLING_UPDATED_EVENT))
}
