import type { LeadStatus } from '@/types/database'

export interface LeadSignalInput {
    hasCatalogMatch: boolean
    hasProfileMatch: boolean
    hasDate: boolean
    hasBudget: boolean
    isDecisive: boolean
    isUrgent: boolean
    isIndecisive: boolean
    isFarFuture: boolean
    nonBusiness?: boolean
}

export function scoreLead(input: LeadSignalInput) {
    if (input.nonBusiness) {
        return { serviceFit: 0, intentScore: 0, totalScore: 0, status: 'cold' as LeadStatus }
    }

    const serviceFit = input.hasCatalogMatch ? 4 : input.hasProfileMatch ? 2 : 0
    let intentScore = 0

    if (input.hasDate) intentScore += 2
    if (input.hasBudget) intentScore += 2
    if (input.isDecisive) intentScore += 3
    if (input.isUrgent) intentScore += 2
    if (input.isIndecisive) intentScore -= 2
    if (input.isFarFuture) intentScore -= 1

    const rawTotal = Math.max(0, Math.min(10, serviceFit + intentScore))
    const totalScore = input.hasCatalogMatch || input.hasProfileMatch ? rawTotal : Math.min(rawTotal, 3)
    const status: LeadStatus = totalScore >= 8 ? 'hot' : totalScore >= 5 ? 'warm' : 'cold'

    return {
        serviceFit,
        intentScore: Math.max(0, Math.min(6, intentScore)),
        totalScore,
        status
    }
}
