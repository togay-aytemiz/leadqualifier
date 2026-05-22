import crypto from 'node:crypto'
import { getBillingProviderConfig } from '@/lib/billing/providers/config'

export type IyzicoLocale = 'tr' | 'en'
export type IyzicoCurrency = 'TRY' | 'USD'

export interface IyzicoSubscriptionCustomer {
    name: string
    surname: string
    identityNumber: string
    email: string
    gsmNumber: string
    billingAddress: {
        contactName: string
        city: string
        district?: string
        country: string
        address: string
        zipCode: string
    }
    shippingAddress: {
        contactName: string
        city: string
        district?: string
        country: string
        address: string
        zipCode: string
    }
}

export interface IyzicoSubscriptionCheckoutInitInput {
    locale: IyzicoLocale
    conversationId: string
    callbackUrl: string
    pricingPlanReferenceCode: string
    customer: IyzicoSubscriptionCustomer
}

export interface IyzicoTopupCheckoutInitInput {
    locale: IyzicoLocale
    conversationId: string
    callbackUrl: string
    price: number
    paidPrice: number
    currency: IyzicoCurrency
    basketId: string
    buyer: {
        id: string
        name: string
        surname: string
        identityNumber: string
        email: string
        gsmNumber: string
        registrationDate: string
        lastLoginDate: string
        registrationAddress: string
        ip: string
        city: string
        country: string
        zipCode: string
    }
    shippingAddress: {
        contactName: string
        city: string
        country: string
        address: string
        zipCode: string
    }
    billingAddress: {
        contactName: string
        city: string
        country: string
        address: string
        zipCode: string
    }
    basketItems: Array<{
        id: string
        name: string
        category1: string
        category2: string
        itemType: 'PHYSICAL' | 'VIRTUAL'
        price: number
    }>
}

export type IyzicoSubscriptionUpgradePeriod = 'NOW' | 'NEXT_PERIOD'

export interface IyzicoPaymentRetrieveInput {
    locale?: IyzicoLocale
    paymentId: string
    paymentConversationId?: string | null
}

export interface IyzicoSubscriptionCardUpdateInitInput {
    locale: IyzicoLocale
    conversationId: string
    callbackUrl: string
    subscriptionReferenceCode: string
}

export type IyzicoClientErrorCode =
    | 'provider_not_configured'
    | 'request_failed'
    | 'invalid_response'

export class IyzicoClientError extends Error {
    readonly code: IyzicoClientErrorCode
    readonly providerErrorCode: string | null
    readonly providerErrorMessage: string | null
    readonly providerErrorGroup: string | null

    constructor(code: IyzicoClientErrorCode, message: string, details?: {
        providerErrorCode?: string | null
        providerErrorMessage?: string | null
        providerErrorGroup?: string | null
    }) {
        super(message)
        this.code = code
        this.providerErrorCode = details?.providerErrorCode ?? null
        this.providerErrorMessage = details?.providerErrorMessage ?? null
        this.providerErrorGroup = details?.providerErrorGroup ?? null
    }
}

export interface IyzicoResultEnvelope {
    status?: string
    errorCode?: string
    errorMessage?: string
    errorGroup?: string
    [key: string]: unknown
}

type IyzicoHttpMethod = 'GET' | 'POST'
type IyzicoAuthVersion = 'v1' | 'v2'

const IYZICO_CLIENT_VERSION = 'qualy-direct-fetch-1.0'
const IYZICO_SUBSCRIPTION_INITIAL_STATUS_ACTIVE = 'ACTIVE'
const IYZICO_PAYMENT_GROUP_PRODUCT = 'PRODUCT'

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message
    return typeof error === 'string' ? error : 'Unknown iyzico error'
}

function assertSuccessResult(result: unknown): IyzicoResultEnvelope {
    if (!isObject(result)) {
        throw new IyzicoClientError('invalid_response', 'iyzico returned an invalid response payload')
    }

    const envelope = result as IyzicoResultEnvelope
    const status = typeof envelope.status === 'string' ? envelope.status.toLowerCase() : ''
    if (status !== 'success') {
        const message = typeof envelope.errorMessage === 'string' && envelope.errorMessage.trim()
            ? envelope.errorMessage
            : 'iyzico request failed'
        throw new IyzicoClientError('request_failed', message, {
            providerErrorCode: typeof envelope.errorCode === 'string' ? envelope.errorCode.trim() : null,
            providerErrorMessage: typeof envelope.errorMessage === 'string' ? envelope.errorMessage.trim() : null,
            providerErrorGroup: typeof envelope.errorGroup === 'string' ? envelope.errorGroup.trim() : null
        })
    }

    return envelope
}

function generateIyzicoRandomString() {
    return `${Date.now()}${crypto.randomBytes(8).toString('hex')}`
}

function generateIyzicoAuthorizationHeaderV2(input: {
    apiKey: string
    secretKey: string
    path: string
    randomString: string
    bodyText: string
}) {
    const signature = crypto
        .createHmac('sha256', input.secretKey)
        .update(`${input.randomString}${input.path}${input.bodyText}`)
        .digest('hex')

    const authorizationParams = [
        `apiKey:${input.apiKey}`,
        `randomKey:${input.randomString}`,
        `signature:${signature}`
    ].join('&')

    return `IYZWSv2 ${Buffer.from(authorizationParams).toString('base64')}`
}

function generateIyzicoAuthorizationHeaderV1(input: {
    apiKey: string
    secretKey: string
    randomString: string
    pkiString: string
}) {
    const hash = crypto
        .createHash('sha1')
        .update(`${input.apiKey}${input.randomString}${input.secretKey}${input.pkiString}`, 'utf8')
        .digest('base64')

    return `IYZWS ${input.apiKey}:${hash}`
}

function getIyzicoConfigOrThrow(): {
    apiKey: string
    secretKey: string
    baseUrl: string
} {
    const config = getBillingProviderConfig()
    if (!config.iyzico.enabled || !config.iyzico.apiKey || !config.iyzico.secretKey || !config.iyzico.baseUrl) {
        throw new IyzicoClientError('provider_not_configured', 'iyzico provider is not configured')
    }

    return {
        apiKey: config.iyzico.apiKey,
        secretKey: config.iyzico.secretKey,
        baseUrl: config.iyzico.baseUrl
    }
}

function formatIyzicoPrice(value: unknown) {
    if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(Number(value))) {
        return value
    }

    const normalized = Number.parseFloat(String(value)).toString()
    return normalized.includes('.') ? normalized : `${normalized}.0`
}

function removeUndefinedDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(removeUndefinedDeep)
    if (!isObject(value)) return value

    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
        if (typeof child === 'undefined' || typeof child === 'function') continue
        next[key] = removeUndefinedDeep(child)
    }
    return next
}

function toIyzicoPkiString(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(toIyzicoPkiString).join(', ')}]`
    }
    if (isObject(value)) {
        const parts = Object.entries(value)
            .filter(([, child]) => typeof child !== 'undefined' && typeof child !== 'function')
            .map(([key, child]) => `${key}=${isObject(child) || Array.isArray(child) ? toIyzicoPkiString(child) : String(child)}`)
        return `[${parts.join(',')}]`
    }
    return String(value)
}

async function requestIyzico(input: {
    path: string
    method: IyzicoHttpMethod
    authVersion: IyzicoAuthVersion
    body?: Record<string, unknown>
}) {
    const config = getIyzicoConfigOrThrow()
    const body = removeUndefinedDeep(input.body ?? {}) as Record<string, unknown>
    const bodyText = JSON.stringify(body)
    const randomString = generateIyzicoRandomString()
    const baseUrl = config.baseUrl.replace(/\/$/, '')
    const authorization = input.authVersion === 'v2'
        ? generateIyzicoAuthorizationHeaderV2({
            apiKey: config.apiKey,
            secretKey: config.secretKey,
            path: input.path,
            randomString,
            bodyText
        })
        : generateIyzicoAuthorizationHeaderV1({
            apiKey: config.apiKey,
            secretKey: config.secretKey,
            randomString,
            pkiString: toIyzicoPkiString(body)
        })

    const response = await fetch(`${baseUrl}${input.path}`, {
        method: input.method,
        headers: {
            Authorization: authorization,
            'Content-Type': 'application/json',
            'x-iyzi-rnd': randomString,
            'x-iyzi-client-version': IYZICO_CLIENT_VERSION
        },
        ...(input.method === 'GET' ? {} : { body: bodyText })
    })

    let result: unknown
    try {
        result = await response.json()
    } catch (error) {
        throw new IyzicoClientError('invalid_response', toErrorMessage(error))
    }

    return assertSuccessResult(result) as unknown as IyzicoResultEnvelope
}

function buildSubscriptionAddress(address: IyzicoSubscriptionCustomer['billingAddress']) {
    return {
        address: address.address,
        zipCode: address.zipCode,
        contactName: address.contactName,
        city: address.city,
        country: address.country,
        district: address.district
    }
}

function buildSubscriptionCustomer(customer: IyzicoSubscriptionCustomer) {
    return {
        name: customer.name,
        surname: customer.surname,
        identityNumber: customer.identityNumber,
        email: customer.email,
        gsmNumber: customer.gsmNumber,
        billingAddress: buildSubscriptionAddress(customer.billingAddress),
        shippingAddress: buildSubscriptionAddress(customer.shippingAddress)
    }
}

function buildAddress(address: IyzicoTopupCheckoutInitInput['billingAddress']) {
    return {
        address: address.address,
        zipCode: address.zipCode,
        contactName: address.contactName,
        city: address.city,
        country: address.country
    }
}

function buildBuyer(buyer: IyzicoTopupCheckoutInitInput['buyer']) {
    return {
        id: buyer.id,
        name: buyer.name,
        surname: buyer.surname,
        identityNumber: buyer.identityNumber,
        email: buyer.email,
        gsmNumber: buyer.gsmNumber,
        registrationDate: buyer.registrationDate,
        lastLoginDate: buyer.lastLoginDate,
        registrationAddress: buyer.registrationAddress,
        city: buyer.city,
        country: buyer.country,
        zipCode: buyer.zipCode,
        ip: buyer.ip
    }
}

function buildBasketItem(item: IyzicoTopupCheckoutInitInput['basketItems'][number]) {
    return {
        id: item.id,
        price: formatIyzicoPrice(item.price),
        name: item.name,
        category1: item.category1,
        category2: item.category2,
        itemType: item.itemType
    }
}

export async function initializeIyzicoSubscriptionCheckout(input: IyzicoSubscriptionCheckoutInitInput) {
    return requestIyzico({
        path: '/v2/subscription/checkoutform/initialize',
        method: 'POST',
        authVersion: 'v2',
        body: {
            locale: input.locale,
            conversationId: input.conversationId,
            callbackUrl: input.callbackUrl,
            customer: buildSubscriptionCustomer(input.customer),
            pricingPlanReferenceCode: input.pricingPlanReferenceCode,
            subscriptionInitialStatus: IYZICO_SUBSCRIPTION_INITIAL_STATUS_ACTIVE
        }
    })
}

export async function retrieveIyzicoSubscriptionCheckoutResult(checkoutFormToken: string) {
    return requestIyzico({
        path: `/v2/subscription/checkoutform/${encodeURIComponent(checkoutFormToken)}`,
        method: 'GET',
        authVersion: 'v2'
    })
}

export async function initializeIyzicoTopupCheckout(input: IyzicoTopupCheckoutInitInput) {
    return requestIyzico({
        path: '/payment/iyzipos/checkoutform/initialize/auth/ecom',
        method: 'POST',
        authVersion: 'v1',
        body: {
            locale: input.locale,
            conversationId: input.conversationId,
            price: formatIyzicoPrice(input.price),
            basketId: input.basketId,
            paymentGroup: IYZICO_PAYMENT_GROUP_PRODUCT,
            buyer: buildBuyer(input.buyer),
            shippingAddress: buildAddress(input.shippingAddress),
            billingAddress: buildAddress(input.billingAddress),
            basketItems: input.basketItems.map(buildBasketItem),
            callbackUrl: input.callbackUrl,
            currency: input.currency,
            paidPrice: formatIyzicoPrice(input.paidPrice)
        }
    })
}

export async function retrieveIyzicoTopupCheckoutResult(token: string, conversationId: string) {
    return requestIyzico({
        path: '/payment/iyzipos/checkoutform/auth/ecom/detail',
        method: 'POST',
        authVersion: 'v1',
        body: {
            locale: 'tr',
            conversationId,
            token
        }
    })
}

export async function initializeIyzicoSubscriptionCardUpdateCheckout(input: IyzicoSubscriptionCardUpdateInitInput) {
    return requestIyzico({
        path: '/v2/subscription/card-update/checkoutform/initialize/with-subscription',
        method: 'POST',
        authVersion: 'v2',
        body: {
            locale: input.locale,
            conversationId: input.conversationId,
            subscriptionReferenceCode: input.subscriptionReferenceCode,
            callbackUrl: input.callbackUrl
        }
    })
}

export async function retryIyzicoSubscriptionPayment(input: {
    locale: IyzicoLocale
    conversationId: string
    referenceCode: string
}) {
    return requestIyzico({
        path: '/v2/subscription/operation/retry',
        method: 'POST',
        authVersion: 'v2',
        body: {
            locale: input.locale,
            conversationId: input.conversationId,
            referenceCode: input.referenceCode
        }
    })
}

export async function retrieveIyzicoPayment(input: IyzicoPaymentRetrieveInput) {
    return requestIyzico({
        path: '/payment/detail',
        method: 'POST',
        authVersion: 'v1',
        body: {
            locale: input.locale ?? 'tr',
            paymentId: input.paymentId,
            ...(input.paymentConversationId ? { paymentConversationId: input.paymentConversationId } : {})
        }
    })
}

export async function upgradeIyzicoSubscription(input: {
    conversationId?: string
    locale?: IyzicoLocale
    subscriptionReferenceCode: string
    newPricingPlanReferenceCode: string
    upgradePeriod?: IyzicoSubscriptionUpgradePeriod
    resetRecurrenceCount?: boolean
    useTrial?: boolean
}) {
    const path = `/v2/subscription/subscriptions/${encodeURIComponent(input.subscriptionReferenceCode)}/upgrade`
    return requestIyzico({
        path,
        method: 'POST',
        authVersion: 'v2',
        body: {
            locale: input.locale ?? 'tr',
            conversationId: input.conversationId,
            newPricingPlanReferenceCode: input.newPricingPlanReferenceCode,
            // Iyzico samples document NEXT_PERIOD even though older SDK constants only exposed NOW.
            upgradePeriod: input.upgradePeriod ?? 'NOW',
            useTrial: input.useTrial ?? false,
            resetRecurrenceCount: input.resetRecurrenceCount ?? false
        }
    })
}

export async function cancelIyzicoSubscription(input: {
    subscriptionReferenceCode: string
}) {
    return requestIyzico({
        path: `/v2/subscription/subscriptions/${encodeURIComponent(input.subscriptionReferenceCode)}/cancel`,
        method: 'POST',
        authVersion: 'v2'
    })
}

export async function retrieveIyzicoSubscription(input: {
    subscriptionReferenceCode: string
}) {
    return requestIyzico({
        path: `/v2/subscription/subscriptions/${encodeURIComponent(input.subscriptionReferenceCode)}`,
        method: 'GET',
        authVersion: 'v2'
    })
}
