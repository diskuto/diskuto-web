import * as pb from "@nfnitloop/feoblog-client/types"
import { UserID, Signature } from "@nfnitloop/feoblog-client"


import * as preact from "preact"
import { markdownToHtml } from "../markdown.ts";
import Timestamp from "./Timestamp.tsx";
import type { ComponentChildren } from "preact";
import { renderToString } from "preact-render-to-string";

// Thanks to: https://stackoverflow.com/questions/61015445/using-web-components-within-preact-and-typescript
// Allow custom tags in JSX:
declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
        "article-body": preact.JSX.HTMLAttributes<HTMLElement>,
        "user-id": preact.JSX.HTMLAttributes<HTMLElement>
    }
  }
}

export type ItemData = {
    item: pb.Item,
    userId: UserID,
    signature: Signature,
    user: {
        displayName?: string
    }
}

/**
 * What context is this item being viewed in?
 * ex: a Profile, if viewed in a feed, might just say "X updated their profile",
 * but when viewed as a standalone item, might show the full profile.
 */
export type ViewContext = "feed" | "standalone"

export type ItemProps = {
    item: ItemData,

    /** default: "standalone" */
    context?: ViewContext,
}

export default function Item({item}: ItemProps) {
    const uid = item.userId.asBase58
    const sig = item.signature.asBase58
    const relativeBase = `/u/${uid}/i/${sig}/`

    let body = <article-body>
        TODO: Handle type {item.item.itemType.case}
    </article-body>
    if (item.item.itemType.case == "post") {
        let title = <></>
        const titleText = item.item.itemType.value.title.trim()
        if (titleText.length > 0) {
            title = <h1>{titleText}</h1>
        }

        const md = item.item.itemType.value.body

        body = <Markdown {...{relativeBase, md}}>
            {title}
        </Markdown>
    }

    const displayName = item.user.displayName || uid
    const link = `/u/${uid}/`
    const imgSrc = `/u/${uid}/icon.png`

    return <article>
        <header>
            <img src={imgSrc}/>
            <user-id><a href={link}>{displayName}</a></user-id>
            <Timestamp {...item}/>
        </header>
        {body}
    </article>
}

type MarkdownProps = {
    /** The markdown text */
    md: string,

    relativeBase?: string,

    /** These children will be rendered *before* the rendered markdown. */
    children?: ComponentChildren
}

// React/Preact don't have a "dangerouslySetOuterHtml" property, and Fragments don't support "dangerouslySetInnerHtml"
// So, to allow inserting some HTML *beside* an <h1>title</h1>, without wrapping it in a <div> or some other element, 
// we have to resort to these shenanegains.
// See: https://github.com/facebook/react/issues/12014
// And: https://github.com/reactjs/rfcs/pull/129

function Markdown({md, relativeBase, children}: MarkdownProps) {
    children = children ?? []
    const mdRendered = markdownToHtml(md, {relativeBase})

    const html = {
        __html: [
            renderToString(<>{children}</>),
            mdRendered
        ].join("\n")
    }

    return <article-body dangerouslySetInnerHTML={html}/>
}