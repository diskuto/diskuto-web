/* @jsxImportSource preact */
/* @jsxRuntime automatic */

import { Signature, UserID } from "@diskuto/client"


import { markdownToHtml } from "../markdown.ts";
import Timestamp from "./Timestamp.tsx";
import type { ComponentChildren } from "preact";
import { renderToString } from "preact-render-to-string";
import type { ItemInfoPlus } from "../client.ts";
import { ArticleBody, UserIdTag } from "./customTags.tsx";
import { ItemSchema, toJson } from "@diskuto/client/types";


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

    /** Enable HTMX behaviors. Used by {@link HtmxItem} */
    htmx?: HtmxState
}

export default function Item({item, main, preview, editable, htmx}: ItemProps) {
    const uid = item.userId.asBase58
    const sig = item.signature?.asBase58
    const relativeBase = sig ? `/u/${uid}/i/${sig}/` : undefined

    let body = <ArticleBody>
        TODO: Handle type <b>{item.item.itemType.case}</b>
    </ArticleBody>
    let replyTo = undefined

    const itemType = item.item.itemType.case
    if (htmx?.altBody) {
        body = <ArticleBody>{htmx.altBody}</ArticleBody>
    } else if (itemType == "post") {
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
        body = <ArticleBody>
            <h1>{editButton}{displayName ? `Profile: ${displayName}` : "Profile"}</h1>
            <p>UserID: <UserIdTag>{uid}</UserIdTag></p>
            <Markdown {...{relativeBase, md}} mainElement="details">
                <summary>About</summary>
            </Markdown>
            {follows}
            {servers}
        </ArticleBody>
    } else if (itemType == "profile" && !main) {
        const profile = item.item.itemType.value
        const dName = profile.displayName.trim() || uid
        const href = `/u/${uid}/i/${sig}/`
        body = <ArticleBody>
            <p>{dName} updated their <a href={href}>profile</a>.</p>
        </ArticleBody>
    } else if (itemType == "comment") {
        replyTo = <ReplyTo item={item}/>

        const md = item.item.itemType.value.text
        body = <Markdown {...{md}} stripImages></Markdown>
    }

    const imgSrc = `/u/${uid}/icon.png`

    return <article id={sig} hx-vals={htmx?.vals}>
        <header>
            <img src={imgSrc}/>
            {/* <b><a href={link}>{displayName}</a></b> */}
            <UserLink userId={uid} displayName={item.user.displayName}/>
            {replyTo}
            <Timestamp {...item} relative={!preview}/>
            {htmx?.openArrow}
        </header>
        {htmx?.header}
        {body}
    </article>
}

/**
 * Add extra interactive HTMX functionality to an item.
 * 
 * Shouldn't be mixed with client-side-rendered Preact.
 * 
 * Attempts to handle & isolate a lot of the extra HTMX logic from the Item class.
 */
export function HtmxItem(props: HtmxProps) {
    const {params, item, apiUrl} = props
    const {userId, signature} = item

    const tabs = ["Render", "Markdown", "Protobuf", "Validate"] as const
    const tab = params?.get("tab") as (typeof tabs)[number] | null

    const showDetails = params?.get("detail") == "true"

    let altBody = undefined
    if (tab == "Markdown") {
        const it = item.item.itemType
        const markdown = (
            it.case == "post" ? it.value.body :
            it.case == "comment" ? it.value.text :
            it.case == "profile" ? it.value.about :
            `No markdown for type "${it.case}"`
        )
        altBody = <pre><code>{markdown}</code></pre>
    } else if (tab == "Protobuf") {
        const json = JSON.stringify(toJson(ItemSchema, item.item), null, 4)
        altBody = <>
            <p>This is a JSON representation of the <code>Item</code> type, defined in <a href="https://github.com/diskuto/diskuto-api/blob/main/protobufs/diskuto.proto">diskuto.proto</a></p>
            <pre><code>{json}</code></pre>
        </>
    } else if (tab == "Validate") {
        altBody = <>
            <p>Example code to validate the signature of this post, using <a href="https://deno.com/">Deno</a></p>
            <pre><code>{validateCode(userId, signature, apiUrl ?? "apiUrl")}</code></pre>
        </>
    }

    const url = "/x/item"
    const header = !showDetails ? undefined : <HxTabs
        url={url}
        tabs={tabs}
        active={tab}
    />

    const state: Record<string,unknown> = { 
        u: userId.asBase58,
        s: signature.asBase58,
    }
    if (showDetails) {
        state.detail = "true"
    }
    // Remember if this item was marked as the `main` one:
    const mainItem = params?.get("m") == "1" || props.main || false
    if (mainItem) {
        state.m = 1
    }

    const openArrow = <img 
        src="/static/arrow.svg"
        hx-vals={JSON.stringify({
            detail: !showDetails
        })}
        hx-get={url}
        id={signature.asBase58.substring(0, 4)}
        class={"arrow" + (showDetails ? " down" : "")} 
    />

    const htmx: HtmxState = {
        header,
        altBody,
        vals: JSON.stringify(state),
        openArrow
    }

    return <Item 
        {...props} 
        htmx={htmx}
        main={mainItem || showDetails}
    />

}

function HxTabs({url, tabs, active}: {url: string, tabs: readonly string[], active?: string|null}) {
    // Default first tab active.
    const activeTab = active && tabs.includes(active) ? active : tabs[0]

    const divs = tabs.map(tab => {
        const isActive = tab == activeTab
        let klass = undefined
        let get = undefined 
        let vals = undefined
        if (isActive) {
            klass = "active"
        } else {
            get = url
            vals = JSON.stringify({"tab": tab})
        }

        return <div hx-get={get} hx-vals={vals} class={klass}>{tab}</div>
    })

    return <div class="tabs">{divs}</div>
}

function validateCode(userId: UserID, signature: Signature, host: string): string {
return `#!/usr/bin/env -S deno run -NE

import {Client} from "jsr:@diskuto/client@0.10.2"

const uid = "${userId.asBase58}"
const sig = "${signature.asBase58}"
const client = new Client({baseUrl: "${host}"})

// This will throw if the signature is invalid:
const item = await client.getItem(uid, sig)

// View the item to make sure it matches what's on this page:
console.log(item)
`
}

type HtmxProps = Omit<ItemProps, "htmx"> & {
    // here we DO require signature. Can't use HTMX in the preact client preview.
    item: ItemInfoPlus

    params?: URL["searchParams"]
    apiUrl?: string
}

export type HtmxState = {
    /** Allows injecting a header */
    header?: preact.ComponentChildren
    /** Render this instead of the normal body */
    altBody?: preact.ComponentChildren

    openArrow?: preact.ComponentChildren

    /** JSON-escape values to save at the item root. */
    vals?: string
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

    return <ArticleBody dangerouslySetInnerHTML={html}/>
}