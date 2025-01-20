import { type ComponentChildren } from "preact";


export function Box({title, children}: {title: string, children?: ComponentChildren}) {
    return <article>
        <header><b>{title}</b></header>
        <article-body>
            {children}
        </article-body>
    </article>
}