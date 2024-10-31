import type { Config } from "./config.ts";

import {oak, serveDir} from "@nfnitloop/deno-embedder/helpers/oak"
import { renderToString } from "preact-render-to-string"
import { Client, UserID, Signature } from "@nfnitloop/feoblog-client"
import { lazy } from "@nfnitloop/better-iterators"
import * as pb from "@nfnitloop/feoblog-client/types"
import staticFiles from "./generated/static/dir.ts"
import styleFiles from "./generated/styles/dir.ts"
import type { VNode } from "preact";
import Page from "./components/Page.tsx";
import type { ItemAndEntry } from "./components/Item.tsx";
import Item from "./components/Item.tsx";
import { LRUCache } from "lru-cache"

// import { State as NavState } from "./components/Nav.tsx"

const NOT_FOUND = Symbol("Not Found")

export class Server {
    #client: Client

    // keyed by the string `${uid}/${sig}`.
    #itemCache: LRUCache<string, ItemAndEntry| typeof NOT_FOUND, unknown>;

    constructor(private config: Config) {
        this.#client = new Client({base_url: config.api.url})

        this.#itemCache = new LRUCache({
            max: 10_000,
            fetchMethod: async (key) => {
                try {
                    console.log("fetching:", key)
                    const parts = key.split("/")
                    const userId = UserID.fromString(parts[0])
                    const signature = Signature.fromString(parts[1])
                    const item = await this.#client.getItem(userId, signature)
                    if (item == null) {
                        return NOT_FOUND
                    }
                    return {
                        item,
                        userId,
                        signature
                    }
                } catch (cause) {
                    console.error("Couldn't fetch item:", cause)
                    return NOT_FOUND
                }
            }
        })
    }

    async run(): Promise<void> {
        const router = new oak.Router();
        router.get("/", c => this.homeRedirect(c))
        router.get("/home", c => this.homePage(c))
        router.get("/u/:uid/i/:sig/files/:fileName", c => this.fileRedirect(c, c.params))


        // Though these get generated differently, we don't expect them to overlap so
        // we collapse them into /static/:
        serveDir(router, "/static/", styleFiles)
        serveDir(router, "/static/", staticFiles)

        // Default/404 page:
        router.get("/(.*)", c => this.notFound(c.response))

        const app = new oak.Application()
        app.use(requestLogger)
        app.use(errorLogger)
        logUncaughtExceptions()
        app.use(router.routes())
        app.use(router.allowedMethods()) // Gives proper error codes for wrong methods when router.routes() doesn't find a match.

        app.addEventListener("listen", ({hostname, port, secure}) => {
            const http = secure ? "https": "http"

            console.log(`Listening at: ${http}://${hostname}:${port}`)
            if (hostname == "0.0.0.0") {
                console.log(`Listening at: ${http}://localhost:${port}`)
            }

        })

        await app.listen({
            port: this.config.server.port
        })
    }

    /**
     * Usually redirects to /home. May redirect to a user's feed if they've set that cookie.
     */
    homeRedirect({response}: oak.Context): void {

        // TODO: Read cookie. If user is identified, redirect to their feed instead.

        response.redirect("/home")

    }

    async homePage({request, response}: oak.Context): Promise<void> {
        const thisPage = "/home"
        const maxPerPage = 10
        const before = getIntParam(request, "before")
        const after = getIntParam(request, "after")

        const items = await lazy(this.#client.getHomepageItems({before, after}))
            .limit(maxPerPage)
            .map({
                parallel: 5,
                mapper: e => this.#getItem(e),  
            })
            .filter(i => i != null)
            .toArray()

        // If we streamed homepage items "after" some date they may be in reverse order:
        if (after && !before) {
            items.reverse()
        }

        const elements = items.map(i => <Item item={i}/>)


        if (elements.length == 0) {
            if (after) {
                // We tried to go "newer" past the previous page, but there's nothing newer. Just view this page.
                response.redirect(thisPage)
                return
            }
            if (before) {
                const page = <Page title="Home Page" nav={42}>
                    <article>
                        <header>{"The End"}</header>
                        <article-body>{"There's nothing more to see here."}</article-body>
                    </article>
                </Page>
            
                render(response, page)
                return
            }
        }


        let olderLink = undefined
        if (items.length == maxPerPage || after) {
            const lastTs = items[items.length-1].item.timestampMsUtc
            const link = `${thisPage}?before=${lastTs}`
            olderLink = <>
                <a href={link}>Older</a>
            </>
        }

        let newerLink = undefined
        if (before || (items.length == maxPerPage && after)) {
            const firstTs = items[0].item.timestampMsUtc
            const link = `${thisPage}?after=${firstTs}`
            newerLink = <>
                <a href={link}>Newer</a>
            </>
        }

        let navFooter = undefined
        if (olderLink || newerLink) {
            navFooter = <footer>
                {newerLink}
                {" "}
                {olderLink}
            </footer>
        }

        const page = <Page title="Home Page" nav={42}>
            {elements}
            {navFooter}
        </Page>
        
        render(response, page)

    }

    /**
     * No need to serve our own files. The API server does that for us. Just redirect there:
     */
    fileRedirect({response}: oak.Context, {uid, sig, fileName}: {uid: string, sig: string, fileName: string}) {
        const base = this.config.api.url.replace(/[/]+$/, "")
        const newUrl = `${base}/u/${uid}/i/${sig}/files/${fileName}`
        response.redirect(newUrl)
    }

    // TODO: Move this into a CachedClient.
    /** Get an item from our local cache, or fetch it. */
    async #getItem(entry: pb.ItemListEntry) {
        const userId = UserID.fromBytes(entry.userId!.bytes)
        const signature = Signature.fromBytes(entry.signature!.bytes)
        const key = `${userId}/${signature}`
        const value = await this.#itemCache.fetch(key)
        if (value === NOT_FOUND) {
            return null
        }
        return value
    }

    async #loadItem(entry: pb.ItemListEntry): Promise<ItemAndEntry> {
        const userId = UserID.fromBytes(entry.userId!.bytes)
        const signature = Signature.fromBytes(entry.signature!.bytes)
        const item = await this.#client.getItem(userId, signature)
        if (item === null) {
            throw new Error(`No such item id: ${userId}/${signature}`)
        }
        return {userId, signature, item}
    }

    /** Render the Not Found page. */
    notFound(response: oak.Response): void {
        const page = <Page title="Not Found" nav={{page: "notFound"}}>
            <p>Page not found.</p>
        </Page>
        render(response, page)
        response.status = 404
    }

}

function render(response: oak.Response, node: VNode): void {
    response.status = 200
    response.type = "text/html; charset=utf-8"
    response.body = htmlDocument(node)
}

function htmlDocument(node: VNode): string {
    return `<!doctype html>\n` + renderToString(node)
}


function getIntParam(request: oak.Request, name: string): number|undefined {
    const value = request.url.searchParams.get(name)
    if (!value) { return undefined }
    // TODO: Error context here
    return Number.parseInt(value)
}

async function requestLogger(ctx: oak.Context, next: oak.Next) {
    const start = Date.now()
    // No try/finally because we expect errorLogger to handle that.
    await next()
    const delta = Date.now() - start
    
    console.log(new Date(), ctx.response.status, `${delta}ms`, ctx.request.url.pathname)
}

async function errorLogger(ctx: oak.Context, next: oak.Next) {
    try {
        await next()
    } catch (err: unknown) {
        const ts = Date.now()
        console.log("=== at Error serving", ctx.request.url.pathname, "at", ts, ":\n", err)
        ctx.response.status = oak.Status.InternalServerError
        ctx.response.body = [
            `<!doctype html>`,
            `<html><head><title>Server Error</title></head>`,
            `<body>`,
            `<p style="font-weight: bold; color: red">Internal server error at ${ts}</p>`,
            `</body></html>`
        ].join("\n")
    }
}


/**
 * If any third-party (or, *cough* my own) code forgot to await some promise, and that throws,
 * DON'T kill the entire Deno process (i.e. web server)
 */
function logUncaughtExceptions() {
    // See: https://deno.com/blog/v1.24#unhandledrejection-event
    globalThis.addEventListener("unhandledrejection", (e) => {
        console.error("Uncaught error in promise:", e.promise, e.reason)
        e.preventDefault()
    })
}

// TODO: Work around for:
// https://github.com/denoland/deno/issues/11513