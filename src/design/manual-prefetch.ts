export function shouldEnableManualRoutePrefetch(environment: string = process.env.NODE_ENV ?? '') {
    return environment === 'production'
}
