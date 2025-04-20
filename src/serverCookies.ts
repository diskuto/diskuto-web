
import { UserID } from "@diskuto/client";
import { CookieMap } from "jsr:@oak/commons@0.10/cookie_map";
import { loginCookie } from "./clientCookies.ts";
import type { oak } from "@nfnitloop/deno-embedder/helpers/oak";

export { loginCookie }

/**
 * Marks a client as a "not a bot". 
 * 
 * I think web crawlers don't store cookies, so this might work as a nice filter.
 */
export const notABotCookie = "z"


export function getViewAs(request: oak.Request): UserID|null {
    const cookies = new CookieMap(request)
    const value = cookies.get(loginCookie)
    if (!value) {
        return null
    }
    try {
        return UserID.fromString(value)
    } catch (_e) {
        return null
    }
}
