
import type { ComponentChildren } from "preact";
import Nav, { type NavState } from "./Nav.tsx";
import { oak } from "@nfnitloop/deno-embedder/helpers/oak";
import { UserID } from "@nfnitloop/feoblog-client";
import { CookieMap } from "jsr:@oak/commons@0.10/cookie_map";
import { loginCookie } from "../cookies.ts";
import type { ItemInfoPlus } from "../client.ts";
import { OpenGraph } from "./OpenGraph.tsx";



export type Props = {
    title: string
    children: ComponentChildren
    nav: NavState
    request: oak.Request
    // Only used for OpenGraph metadata:
    openGraphItem?: ItemInfoPlus
}


export default function Page({request, title, children, nav: navState, openGraphItem}: Props) {
    navState = {
        ...navState,
        viewAs: getViewAs(request)?.asBase58
    }

    return <html>
        <head>
            <title>{title}</title>
            <link rel="stylesheet" href="/static/style.css"/>
            <meta name="viewport" content="width=device-width"/>
            <OpenGraph request={request} item={openGraphItem} />
        </head>
        <body>
            <Nav state={navState} title={title}></Nav>
            <main>
                {children}
            </main>
        </body>
    </html>
}

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
