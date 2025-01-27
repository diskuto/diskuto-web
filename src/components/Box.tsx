import { type ComponentChildren } from "preact";
import { ArticleBody } from "./customTags.tsx";


export function Box({title, children}: {title: string, children?: ComponentChildren}) {
    return <article>
        <header><b>{title}</b></header>
        <ArticleBody>
            {children}
        </ArticleBody>
    </article>
}