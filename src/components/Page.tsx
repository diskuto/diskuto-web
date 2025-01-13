
import type { ComponentChildren } from "preact";
import Nav, { type NavState } from "./Nav.tsx";
import { oak } from "@nfnitloop/deno-embedder/helpers/oak";
import { UserID } from "@nfnitloop/feoblog-client";
import { CookieMap } from "jsr:@oak/commons@0.10/cookie_map";
import { loginCookie } from "../cookies.ts";

// import * as nav from "./Nav.tsx"
// import Nav from "./Nav.tsx"


export type Props = {
    title: string
    children: ComponentChildren
    nav: NavState
    request: oak.Request
}


export default function Page({request, title, children, nav: navState}: Props) {
    navState = {
        ...navState,
        viewAs: getViewAs(request)?.asBase58
    }

    return <html>
        <head>
            <title>{title}</title>
            <link rel="stylesheet" href="/static/style.css"/>
            <meta name="viewport" content="width=device-width"/>
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
