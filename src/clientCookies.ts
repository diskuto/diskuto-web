/**
 * Utilities for getting/setting the login cookie from document.cookie
 * @module
 */

import { UserID } from "@diskuto/client";

/**
 * Markes a user as "logged in". (Though no password is required)
 */
export const loginCookie = "viewAs"

export function getLogin(): UserID|null {
    const cookie = getCookie(loginCookie)
    if (!cookie) { return null }
    try {
        return UserID.fromString(cookie)
    } catch (_e) {
        return null
    }
}

export function setLogin(userId: string) {
    setCookie(loginCookie, userId)
}

export function logOut() {
    document.cookie = `${loginCookie}=; expires=0`
}



// 10 years, ish.
const expireMs = 60_000 * 60 * 24 * 365 * 10

// Note, we're not encoding/decoding cookie values, because we expect to only ever set base58-encoded userIDs.
function setCookie(name: string, value: string) {
    const expires = new Date(Date.now() + expireMs)
    document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/`
}

function getCookie(name: string): string|null {
    const matches = document.cookie.split(/;[ ]?/).filter(c => c.startsWith(`${name}=`))
    if (matches.length == 0) {
        return null
    }
    return matches[0].substring(name.length + 1)
}
