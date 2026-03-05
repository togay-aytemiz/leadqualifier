declare module 'iyzipay' {
    class Iyzipay {
        static LOCALE: { TR: string; EN: string }
        static CURRENCY: { TRY: string; USD: string; EUR: string; [key: string]: string }
        static PAYMENT_GROUP: { PRODUCT: string; LISTING: string; SUBSCRIPTION: string }
        static BASKET_ITEM_TYPE: { PHYSICAL: string; VIRTUAL: string }
        static SUBSCRIPTION_UPGRADE_PERIOD: { NOW: string; [key: string]: string }
        static SUBSCRIPTION_INITIAL_STATUS: { ACTIVE: string; PENDING: string }

        constructor(config: {
            uri: string
            apiKey: string
            secretKey: string
        })

        checkoutFormInitialize: {
            create: (request: unknown, cb: (error: unknown, result: unknown) => void) => void
        }

        checkoutForm: {
            retrieve: (request: unknown, cb: (error: unknown, result: unknown) => void) => void
        }

        subscriptionCheckoutForm: {
            initialize: (request: unknown, cb: (error: unknown, result: unknown) => void) => void
            retrieve: (request: unknown, cb: (error: unknown, result: unknown) => void) => void
        }

        subscription: {
            upgrade: (request: unknown, cb: (error: unknown, result: unknown) => void) => void
            cancel: (request: unknown, cb: (error: unknown, result: unknown) => void) => void
            activate: (request: unknown, cb: (error: unknown, result: unknown) => void) => void
            retrieve: (request: unknown, cb: (error: unknown, result: unknown) => void) => void
        }
    }

    export = Iyzipay
}
