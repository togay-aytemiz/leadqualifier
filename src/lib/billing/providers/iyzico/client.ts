import Iyzipay from 'iyzipay'
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

function invokeIyzicoResource<T>(
    call: (cb: (error: unknown, result: unknown) => void) => void
): Promise<T> {
    return new Promise((resolve, reject) => {
        call((error, result) => {
            if (error) {
                reject(new IyzicoClientError('request_failed', toErrorMessage(error)))
                return
            }

            try {
                const envelope = assertSuccessResult(result) as unknown as T
                resolve(envelope)
            } catch (validationError) {
                reject(validationError)
            }
        })
    })
}

function createIyzicoSdkClient() {
    const config = getBillingProviderConfig()
    if (!config.iyzico.enabled || !config.iyzico.apiKey || !config.iyzico.secretKey || !config.iyzico.baseUrl) {
        throw new IyzicoClientError('provider_not_configured', 'iyzico provider is not configured')
    }

    return new Iyzipay({
        uri: config.iyzico.baseUrl,
        apiKey: config.iyzico.apiKey,
        secretKey: config.iyzico.secretKey
    })
}

export async function initializeIyzicoSubscriptionCheckout(input: IyzicoSubscriptionCheckoutInitInput) {
    const client = createIyzicoSdkClient()
    return invokeIyzicoResource<IyzicoResultEnvelope>((cb) => client.subscriptionCheckoutForm.initialize({
        locale: input.locale,
        conversationId: input.conversationId,
        callbackUrl: input.callbackUrl,
        pricingPlanReferenceCode: input.pricingPlanReferenceCode,
        subscriptionInitialStatus: Iyzipay.SUBSCRIPTION_INITIAL_STATUS.ACTIVE,
        customer: input.customer
    }, cb))
}

export async function retrieveIyzicoSubscriptionCheckoutResult(checkoutFormToken: string) {
    const client = createIyzicoSdkClient()
    return invokeIyzicoResource<IyzicoResultEnvelope>((cb) => client.subscriptionCheckoutForm.retrieve({
        checkoutFormToken
    }, cb))
}

export async function initializeIyzicoTopupCheckout(input: IyzicoTopupCheckoutInitInput) {
    const client = createIyzicoSdkClient()
    return invokeIyzicoResource<IyzicoResultEnvelope>((cb) => client.checkoutFormInitialize.create({
        locale: input.locale,
        conversationId: input.conversationId,
        price: input.price,
        paidPrice: input.paidPrice,
        currency: input.currency,
        basketId: input.basketId,
        paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
        callbackUrl: input.callbackUrl,
        buyer: input.buyer,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        basketItems: input.basketItems
    }, cb))
}

export async function retrieveIyzicoTopupCheckoutResult(token: string, conversationId: string) {
    const client = createIyzicoSdkClient()
    return invokeIyzicoResource<IyzicoResultEnvelope>((cb) => client.checkoutForm.retrieve({
        locale: Iyzipay.LOCALE.TR,
        conversationId,
        token
    }, cb))
}

export async function upgradeIyzicoSubscription(input: {
    subscriptionReferenceCode: string
    newPricingPlanReferenceCode: string
    upgradePeriod?: IyzicoSubscriptionUpgradePeriod
}) {
    const client = createIyzicoSdkClient()
    return invokeIyzicoResource<IyzicoResultEnvelope>((cb) => client.subscription.upgrade({
        subscriptionReferenceCode: input.subscriptionReferenceCode,
        newPricingPlanReferenceCode: input.newPricingPlanReferenceCode,
        // Iyzico samples document NEXT_PERIOD even though the SDK constant map only exposes NOW.
        upgradePeriod: input.upgradePeriod ?? 'NOW'
    }, cb))
}

export async function cancelIyzicoSubscription(input: {
    subscriptionReferenceCode: string
}) {
    const client = createIyzicoSdkClient()
    return invokeIyzicoResource<IyzicoResultEnvelope>((cb) => client.subscription.cancel({
        subscriptionReferenceCode: input.subscriptionReferenceCode
    }, cb))
}

export async function retrieveIyzicoSubscription(input: {
    subscriptionReferenceCode: string
}) {
    const client = createIyzicoSdkClient()
    return invokeIyzicoResource<IyzicoResultEnvelope>((cb) => client.subscription.retrieve({
        subscriptionReferenceCode: input.subscriptionReferenceCode
    }, cb))
}
