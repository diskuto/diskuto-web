import { Signature, UserID } from "@diskuto/client"


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
        "private-key": preact.JSX.HTMLAttributes<HTMLElement>
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

    /** If present, the user can edit this item. (Only profiles for now.) */
    editable?: boolean
}

export default function Item({item, main, preview, editable}: ItemProps) {
    const uid = item.userId.asBase58
    const sig = item.signature?.asBase58
    const relativeBase = sig ? `/u/${uid}/i/${sig}/` : undefined

    let body = <article-body>
        TODO: Handle type <b>{item.item.itemType.case}</b>
    </article-body>
    let replyTo = undefined

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
        follows = [
            <details>
                <summary class="h1">Follows ({follows.length})</summary>
                <p>People followed by this user:</p>
                <ul>
                    {follows}
                </ul>
            </details>
        ]

        let servers = profile.servers.map(s => {
            return <li><code>{s.url}</code></li>
        })
        servers = [
            <details>
                <summary class="h1">Servers ({servers.length})</summary>
                <p>Servers on which this user's content is likely to be found:</p>
                {servers}
            </details>
        ]

        // A bit of a gross hack to get a button in SSR that acts like a link. Need to rethink UI here.
        const editButton = !editable ? undefined : <div style="float: right;">
            <form action={`/u/${uid}/editProfile`}>
                <input type="submit" value="Edit"/>
            </form>
        </div>

        const displayName = profile.displayName.trim()
        const md = profile.about
        body = <article-body>
            <h1>{editButton}{displayName ? `Profile: ${displayName}` : "Profile"}</h1>
            <p>UserID: <user-id>{uid}</user-id></p>
            <Markdown {...{relativeBase, md}} mainElement="details">
                <summary>About</summary>
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
        replyTo = <ReplyTo item={item}/>

        const md = item.item.itemType.value.text
        body = <Markdown {...{md}} stripImages></Markdown>
    }

    const imgSrc = `/u/${uid}/icon.png`

    return <article id={sig}>
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

/** The "Reply To" info displayed in the article header. */
function ReplyTo({item}: {item: ItemInfoRelaxed}) {
    // (So far) only comments have replyTo info:
    if (item.item.itemType.case != "comment") {
        return <></>
    }

    const comment = item.item.itemType.value
    const replyUser = tryUidFromBytes(comment.replyTo?.userId?.bytes)
    const replySig = trySigFromBytes(comment.replyTo?.signature?.bytes)

    if (!replyUser || !replySig) {
        return <>{" !!! comment missing replyTo "}</>
    }

    const replyToHref = `/u/${replyUser.asBase58}/i/${replySig.asBase58}/#${item.signature?.asBase58}`
    // Used to include username here. But it can get long, especially if they don't speicfy a displayName.
    // So let's just simplify it to a "commented" link?
    return <>
        <a href={replyToHref}>commented</a>
        {/* <UserLink userId={replyUser.asBase58} displayName={item.replyTo?.user.displayName}/> */}
    </>
}

// TODO: These would be handy in the client library:
function tryUidFromBytes(bytes?: Uint8Array): UserID|null {
    if (!bytes) { return null }
    try {
        return UserID.fromBytes(bytes)
    } catch (_) {
        return null
    }
}

function trySigFromBytes(bytes?: Uint8Array): Signature|null {
    if (!bytes) { return null }
    try {
        return Signature.fromBytes(bytes)
    } catch (_) {
        return null
    }
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
    mainElement?: "article-body" | "section" | "details"

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

    if (mainElement == "details") {
        return <details open dangerouslySetInnerHTML={html}/>
    }

    if (mainElement === "section") {
        return <section dangerouslySetInnerHTML={html}/>
    }

    return <article-body dangerouslySetInnerHTML={html}/>
}