
import type { ComponentChildren } from "preact";

// import * as nav from "./Nav.tsx"
// import Nav from "./Nav.tsx"


export type Props = {
    title: string
    children: ComponentChildren
    nav: unknown // TODO: nav.State
}


// TODO:
// * Context for the base URL?


export default function Page({title, children, nav: navState}: Props) {
    return <html>
        <head>
            <title>{title}</title>
            <link rel="stylesheet" href="/static/style.css"/>
            <meta name="viewport" content="width=device-width"/>
        </head>
        <body>
            {/* <Nav state={navState} title={title}></Nav> */}
            <main>
                {children}
            </main>
        </body>
    </html>
}