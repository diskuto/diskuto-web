import { UserID } from "@nfnitloop/feoblog-client"


import * as preact from "preact"
import { markdownToHtml } from "../markdown.ts";
import Timestamp from "./Timestamp.tsx";
import type { ComponentChildren } from "preact";
import { renderToString } from "preact-render-to-string";
import type { ItemInfoPlus } from "../client.ts";

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


/**
 * What context is this item being viewed in?
 * ex: a Profile, if viewed in a feed, might just say "X updated their profile",
 * but when viewed as a standalone item, might show the full profile.
 */
export type ViewContext = "feed" | "standalone"

/**
 * Relaxes the type we get from ItemInfo(Plus). We might not have a signature yet if we're previewing an item.
 */
type ItemInfoRelaxed = Omit<ItemInfoPlus, "signature"> & {signature?: ItemInfoPlus["signature"]}

export type ItemProps = {
    item: ItemInfoRelaxed,

    /** Is this the main Item on the page? (Changes display of some Item types.) */
    main?: boolean

    /** If present, item is displayed in preview mode. */
    preview?: boolean
}

export default function Item({item, main, preview}: ItemProps) {
    const uid = item.userId.asBase58
    const sig = item.signature?.asBase58
    const relativeBase = sig ? `/u/${uid}/i/${sig}/` : undefined

    let body = <article-body>
        TODO: Handle type <b>{item.item.itemType.case}</b>
    </article-body>
    const itemType = item.item.itemType.case
    if (itemType == "post") {
        let title = <></>
        const titleText = item.item.itemType.value.title.trim()
        if (titleText.length > 0) {
            title = <h1>{titleText}</h1>
        }

        const md = item.item.itemType.value.body

        body = <Markdown {...{relativeBase, md}}>
            {title}
        </Markdown>
    } else if (itemType == "profile" && main) {
        const profile = item.item.itemType.value
        
        let follows = profile.follows.map(f => {
            const id = UserID.fromBytes(f.user!.bytes).asBase58
            const name = f.displayName.trim() || id
            return <li>
                <a href={`/u/${id}/profile`}>{name}</a>
            </li>
        })
        if (follows.length == 0) {
            follows = [<li>(None)</li>]
        }
        follows = [
            <section>
                <h1 title="People followed by this user">Follows</h1>
                <ul>
                    {follows}
                </ul>
            </section>
        ]

        let servers = profile.servers.map(s => {
            return <li>{s.url}</li>
        })
        if (servers.length == 0) {
            servers = [<li>(None)</li>]
        }
        servers = [
            <section>
                <h1 title="Servers on which this users's content is likely to be found">Servers</h1>
                {servers}
            </section>
        ]

        const md = profile.about
        body = <article-body>
            <p>UserID: <user-id>{uid}</user-id></p>
            <Markdown {...{relativeBase, md}} mainElement="section">
                <h1>Profile</h1>
            </Markdown>
            {follows}
            {servers}
        </article-body>
    } else if (itemType == "profile" && !main) {
        const profile = item.item.itemType.value
        const dName = profile.displayName.trim() || uid
        const href = `/u/${uid}/i/${sig}/`
        body = <article-body>
            <p>{dName} updated their <a href={href}>profile</a>.</p>
        </article-body>
    } else if (itemType == "comment") {
        const md = item.item.itemType.value.text
        body = <Markdown {...{md}} stripImages/>
    }

    const imgSrc = `/u/${uid}/icon.png`

    let replyTo = undefined
    if (item.replyTo) {
        const replyToHref = `/u/${item.replyTo.userId}/i/${item.replyTo.signature}/`
        replyTo = [
            <a href={replyToHref}>replied to</a>,
            // TODO: ex: "a post by"
            <UserLink userId={item.replyTo.userId.asBase58} displayName={item.replyTo.user.displayName}/>
        ]
    }


    return <article>
        <header>
            <img src={imgSrc}/>
            {/* <b><a href={link}>{displayName}</a></b> */}
            <UserLink userId={uid} displayName={item.user.displayName}/>
            {replyTo}
            <Timestamp {...item} relative={!preview}/>
        </header>
        {body}
    </article>
}

function UserLink({userId, displayName}: UserLinkProps) {
    const userHref = `/u/${userId}/`
    let name = displayName
    if (!name) { name = userId }
    return <a href={userHref} class="user">{name}</a>
}

type UserLinkProps = {
    userId: string
    displayName?: string
}

type MarkdownProps = {
    /** The markdown text */
    md: string,

    relativeBase?: string,

    /** These children will be rendered *before* the rendered markdown. */
    children?: ComponentChildren

    /**
     * Which main element should the markdown (and any children) be injected into?
     * 
     * default: "article-body"
     */
    mainElement?: "article-body" | "section"

    stripImages?: boolean,
}

// React/Preact don't have a "dangerouslySetOuterHtml" property, and Fragments don't support "dangerouslySetInnerHtml"
// So, to allow inserting some HTML *beside* an <h1>title</h1>, without wrapping it in a <div> or some other element, 
// we have to resort to these shenanegains.
// See: https://github.com/facebook/react/issues/12014
// And: https://github.com/reactjs/rfcs/pull/129

function Markdown({md, relativeBase, children, mainElement, stripImages}: MarkdownProps) {
    children = children ?? []
    const mdRendered = markdownToHtml(md, {relativeBase, stripImages})

    const html = {
        __html: [
            renderToString(<>{children}</>),
            mdRendered
        ].join("\n")
    }

    if (mainElement === "section") {
        return <section dangerouslySetInnerHTML={html}/>
    }

    return <article-body dangerouslySetInnerHTML={html}/>
}