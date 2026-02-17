interface CookieLike {
    name: string
}

export function isSupabaseAuthCookieName(cookieName: string) {
    return cookieName.startsWith('sb-') && cookieName.includes('-auth-token')
}

export function hasSupabaseAuthCookie(cookies: CookieLike[]) {
    return cookies.some((cookie) => isSupabaseAuthCookieName(cookie.name))
}
