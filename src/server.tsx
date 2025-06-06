/* @jsxImportSource preact */
/* @jsxRuntime automatic */

import type { Config } from "./config.ts";

import {oak, serveDir, ServerDirPath} from "@nfnitloop/deno-embedder/helpers/oak"
import { renderToString } from "preact-render-to-string"
import staticFiles from "../generated/static/dir.ts"
import styleFiles from "../generated/styles/dir.ts"
import jsFiles from "../generated/js/dir.ts"
import type { VNode } from "preact";
import Page from "./components/Page.tsx";
import Item, { HtmxItem } from "./components/Item.tsx";
import { CacheClient, type PaginationOut } from "./client.ts";
import { Signature, UserID } from "@diskuto/client";
import SPA from "./components/SPA.tsx";
import { NavState } from "./components/Nav.tsx";
import { DiskutoWebInfo, InfoPath } from "./info.ts";
import { delay } from "jsr:@std/async@0.196.0/delay";
import { Box } from "./components/Box.tsx";
import { Comments } from "./components/Coments.tsx";
import { Embeds } from "@nfnitloop/deno-embedder/embed.ts";
import { ArticleBody, UserIdTag } from "./components/customTags.tsx";
import * as cookies from "./serverCookies.ts"

export class Server {
    #client: CacheClient

    constructor(private config: Config) {
        const {url, internalUrl} = config.api
        this.#client = new CacheClient({baseUrl: internalUrl ?? url})
    }

    async run(): Promise<void> {
        const router = new oak.Router();

        // Server-rendered pages:
        router.get("/", c => this.homeRedirect(c))
        router.get("/home", c => this.homePage(c))
        router.get("/u/:uid/", c => this.userPosts(c, c.params))
        router.get("/u/:uid/profile", c => this.userProfile(c, c.params))
        router.get("/u/:uid/feed", c => this.userFeed(c, c.params))
        router.get("/u/:uid/i/:sig/", c => this.viewItem(c, c.params))
        router.get(InfoPath, c => this.info(c))
        
        // Redirects:
        router.get("/u/:uid", addSlash)
        router.get("/u/:uid/i/:sig", addSlash)
        router.get("/u/:uid/icon.png", c => this.userIcon(c, c.params))
        router.get("/u/:uid/i/:sig/files/:fileName", c => this.fileRedirect(c, c.params))

        // SPAs for creating new content.
        router.get("/signer", c => this.signer(c))
        router.get("/login", c => this.login(c))
        router.get("/u/:uid/newPost", c => this.newPost(c))
        router.get("/u/:uid/editProfile", c => this.editProfile(c))
        // SPA for user lookup by well-known URL:
        router.get("/@:etc", c => this.resolveWellKnownId(c))

        // HTMX fragments:
        router.get("/x/item", c => this.htmxItem(c))


        serveDirCached(router, "/static/", staticFiles, simpleCache())
        serveDirCached(router, "/static/", styleFiles, simpleCache())
        serveDirCached(router, "/js/", jsFiles, cacheESBuild())

        router.get("/robots.txt", robotsTxt)

        // Default/404 page:
        router.get("/(.*)", c => this.notFound(c))

        const app = new oak.Application()
        app.use(useXForwardedInfo)
        app.use(requestLogger)
        app.use(errorLogger)
        logUncaughtExceptions()
        app.use(noBotsCookies)
        app.use(router.routes())
        app.use(router.allowedMethods()) // Gives proper error codes for wrong methods when router.routes() doesn't find a match.

        app.addEventListener("listen", ({hostname, port, secure}) => {
            const http = secure ? "https": "http"

            console.log(`Listening at: ${http}://${hostname}:${port}`)
            if (hostname == "0.0.0.0") {
                console.log(`Listening at: ${http}://localhost:${port}`)
            }

        })

        await this.#listen(app)
    }

    // Especially when restarting the dev server, the port may not be immediately available.
    // Retry a few times to acquire exclusive use of the port.
    async #listen(app: oak.Application) {
        const tries = 5
        const sleep = 1000
        for (let attempt = 1; attempt <= tries; attempt++)
        {
            try {
                await app.listen({
                    port: this.config.server.port
                })
                return
            } catch (e) {
                // How do I check AddrInUse more directly?
                const asString = `${e}`
                if (!asString.includes("AddrInUse") || attempt >= tries) {
                    throw e
                }
                console.warn("Retrying acquiring port", this.config.server.port, "...")
            }
            await delay(sleep)
        }

        console.error("Could not listen on port", this.config.server.port)
    }

    async userPosts({request, response}: oak.Context, {uid}: {uid: string} ) {
        const thisPage = request.url.pathname
        const before = getIntParam(request, "before")
        const after = getIntParam(request, "after")
        const userId = UserID.fromString(uid)
        const [posts, userName] = await Promise.all([
            this.#client.loadUserPosts({before, after, userId}),
            this.#client.getDisplayName(userId),
        ])
        const {items, pagination} = posts
        const title = `${userName.displayName}: Posts`
        let elements = items.map(i => <HtmxItem item={i}/>)

        // TODO: Refactor/deduplicate this?
        if (elements.length == 0) {
            if (after) {
                // We tried to go "newer" past the previous page, but there's nothing newer. Just view this page.
                response.redirect(thisPage)
                return
            }
            if (before) {
                elements = [
                    <article>
                        <header>{"The End"}</header>
                        <ArticleBody>{"There's nothing more to see here."}</ArticleBody>
                    </article>
                ]
            
            }
        }

        const nav: NavState = {
            page: "posts",
            userId: userId.asBase58,
        } as const

        const page = <Page {...{request, title, nav}} htmx>
            {elements}
            <Footer {...{pagination, thisPage}}/>
        </Page>
        
        render(response, page)
    }

    /** View a single item, and its comments. (Usually a post.) */
    async viewItem({request, response}: oak.Context, {uid, sig}: {uid: string, sig: string} ) {
        const userId = UserID.fromString(uid)
        const signature = Signature.fromString(sig)
        const [post, userName, comments] = await Promise.all([
            this.#client.getItemPlus(userId, signature),
            this.#client.getDisplayName(userId),
            this.#client.getComments(userId, signature)
        ])

        if (post === null) {
            this.notFound({request, response})
            return
        }

        const title = `${userName.displayName}: Post`

        const nav = {
            page: "item",
            userId: userId.asBase58,
            signature: signature.asBase58,
        } as const


        const page = <Page {...{request, title, nav, openGraphItem: post}} htmx>
            <HtmxItem main item={post}/>
            <Comments comments={comments}/>
        </Page>
        
        render(response, page)
    }

    async htmxItem({request, response}: oak.Context ) {

        const params = request.url.searchParams
        const uid = params.get("u")
        const sig = params.get("s")

        const userId = UserID.fromString(uid!)
        const signature = Signature.fromString(sig!)

        const viewAs = cookies.getViewAs(request)
        const viewingOwn = userId.asBase58 == viewAs?.asBase58

        const [post] = await Promise.all([
            this.#client.getItemPlus(userId, signature),
        ])

        // TODO: better 404 here? Does HTMX render them?
        if (post === null) {
            this.notFound({request, response})
            return
        }

        const body = <HtmxItem 
            item={post} 
            params={request.url.searchParams}
            apiUrl={this.config.api.url}
            editable={viewingOwn}
        />

        render(response, body)
    }


    async userProfile({request, response}: oak.Context, {uid}: {uid: string} ) {
        const userId = UserID.fromString(uid)
        const viewAs = cookies.getViewAs(request)
        const viewingOwnProfile = userId.asBase58 == viewAs?.asBase58
        
        // If we're viewing our own profile, skip the cache. (We may have just created/edited it.)
        const profile = (
            viewingOwnProfile 
            ? await this.#client.getProfileUncached(userId)
            : await this.#client.getProfile(userId)
        )

        const displayName = profile?.profile.displayName.trim() || uid
        const title = `${displayName}: Profile`
        const nav = {
            page: "profile",
            userId: uid,
        } as const

        if (!profile) {
            // TODO: nicer 404 page.
            const page = <Page {...{request, title,nav}}>
                <Box title="No Profile">
                    <p>No profile exists for userID <UserIdTag>{uid}</UserIdTag></p>
                    {!viewingOwnProfile ? undefined : 
                        <p><a href={`/u/${uid}/editProfile`}>Create a profile</a>?</p>
                    }
                </Box>
            </Page>

            render(response, page)
            response.status = 404
            return
        }

        const item = {
            item: profile.item,
            userId,
            signature: profile.signature,
            user: { displayName }
        } as const

        const page = <Page {...{request, title,nav}} htmx>
            <HtmxItem main item={item} editable={viewingOwnProfile}/>
        </Page>

        render(response, page)
    }

    async userFeed(ctx: oak.Context, {uid}: {uid: string} ) {

        const {request, response} = ctx
        const thisPage = request.url.pathname
        const before = getIntParam(request, "before")
        const after = getIntParam(request, "after")

        if (before !== undefined || after !== undefined) {
            // Web crawlers keep getting stuck navigating back and forth here. Just deny them access.
            const hasCookie = await ctx.cookies.has(cookies.notABotCookie)
            if (!hasCookie) {
                await delay(Math.random() * 2500)
                response.status = oak.Status.Forbidden
                response.body = "403 See robots.txt"
                return
            }
        }

        const userId = UserID.fromString(uid)
        const [userFeed, userName] = await Promise.all([
            this.#client.loadUserFeed({before, after, userId}),
            this.#client.getDisplayName(userId),
        ])
        const {items, pagination} = userFeed
        const title = `${userName.displayName}: Feed`
        let elements = items.map(i => <HtmxItem item={i}/>)

        // TODO: Refactor/deduplicate this?
        if (elements.length == 0) {
            if (after) {
                // We tried to go "newer" past the previous page, but there's nothing newer. Just view this page.
                response.redirect(thisPage)
                return
            }
            if (before) {
                elements = [
                    <article>
                        <header>{"The End"}</header>
                        <ArticleBody>{"There's nothing more to see here."}</ArticleBody>
                    </article>
                ]
            }
        }

        const nav = {
            page: "feed",
            userId: userId.asBase58,
        } as const

        const page = <Page {...{request, title, nav}} htmx>
            {elements}
            <Footer {...{pagination, thisPage}}/>
        </Page>
        
        render(response, page)
    }

    /**
     * Usually redirects to /home. May redirect to a user's feed if they've set that cookie.
     */
    homeRedirect({request, response}: oak.Context): void {
        // Send users to their feed instead of /home:
        const viewAs = cookies.getViewAs(request)
        if (viewAs) {
            response.redirect(`/u/${viewAs.asBase58}/feed`)
            return
        }
        
        response.redirect("/home")

    }

    async homePage({request, response}: oak.Context): Promise<void> {
        const thisPage = request.url.pathname
        const before = getIntParam(request, "before")
        const after = getIntParam(request, "after")

        const {items, pagination} = await this.#client.loadHomePage({before, after})

        let elements = items.map(i => <Item item={i}/>)


        if (elements.length == 0) {
            if (after) {
                // We tried to go "newer" past the previous page, but there's nothing newer. Just view this page.
                response.redirect(thisPage)
                return
            }
            if (before) {
                elements = [
                    <article>
                        <header>{"The End"}</header>
                        <ArticleBody>{"There's nothing more to see here."}</ArticleBody>
                    </article>
                ]
            
            }
        }

        const title = "Home Page"
        const nav = {
            page: "home"
        } as const

        const page = <Page {...{request, title, nav}}>
            {elements}
            <Footer {...{pagination, thisPage}}/>
        </Page>
        
        render(response, page)

    }

    signer({response}: oak.Context): void {
        render(response, <SPA title="Signer Utility" script="/js/signer.js"/>)
    }
    newPost({response}: oak.Context): void {
        render(response, <SPA title="New Post" script="/js/newPost.js"/>)
    }
    login({response}: oak.Context): void {
        render(response, <SPA title="Log In" script="/js/login.js"/>)
    }
    editProfile({response}: oak.Context): void {
        render(response, <SPA title="Edit Profile" script="/js/editProfile.js"/>)
    }

    resolveWellKnownId({response, }: oak.Context): void {
        render(response, <SPA title="Resolve Well-Known ID" script="/js/resolveId.js"/>)
    }

    /**
     * No need to serve our own files. The API server does that for us. Just redirect there:
     */
    async fileRedirect({response}: oak.Context, {uid, sig, fileName}: {uid: string, sig: string, fileName: string}) {
        const newUrl = urlJoin(this.config.api.url, `/diskuto/users/${uid}/items/${sig}/files/${fileName}`)
        response.redirect(newUrl)
        response.status = 301

        // TODO: make this a runtime option for development.
        // // temporarily pass through files for testing opengraph:
        // const inner = await fetch(newUrl)
        // response.status = inner.status
        // response.body = inner.body
        // response.headers = inner.headers
    }

    async userIcon({response}: oak.Context, {uid}: {uid: string}) {
        // ex: https://blog.nfnitloop.com/u/42P3FTZoCmN8DRmLSu89y419XfYfHP9Py7a9vNLfD72F/icon.png

        // TODO: Implement local icon generation. Maybe as SVG?
        // Until then, (ab)use the fact that diskuto-api already provides these.

        const newUrl = urlJoin(this.config.api.url, `/diskuto/users/${uid}/icon.png`)
        response.redirect(newUrl)
        response.status = 301

        // // TODO: Make this a runtime option for development.
        // const inner = await fetch(newUrl)
        // response.status = inner.status
        // response.body = inner.body
        // response.headers = inner.headers
    }


    /** Render the Not Found page. */
    notFound({request, response}: Pick<oak.Context, "request"|"response">): void {
        const page = <Page request={request} title="Not Found" nav={{page: "notFound"}}>
            <p>Page not found:
                <br/><code>{request.url.pathname}</code>
            </p>
        </Page>
        render(response, page)
        response.status = 404
    }

    info({response}: oak.Context) {
        const info: DiskutoWebInfo = {
            apiUrl: this.config.api.url
        }
        response.body = info
    }

}

type FooterProps = {
    thisPage: string,
    pagination: PaginationOut
}

function Footer({thisPage, pagination}: FooterProps) {
    let olderLink = undefined
    if (pagination.before) {
        const link = `${thisPage}?before=${pagination.before}`
        olderLink = <>
            <a href={link}>Older</a>
        </>
    }

    let newerLink = undefined
    if (pagination.after) {
        const link = `${thisPage}?after=${pagination.after}`
        newerLink = <>
            <a href={link}>Newer</a>
        </>
    }

    if (!olderLink && !newerLink) {
        return <></>
    }
    return <footer>
        {newerLink}
        {olderLink}
    </footer>
}

function stripLeadingSlash(s: string) { return s.replace(/^[/]+/, ""); }

function urlJoin(left: string, ...right: string[]) {
    const parts = [ left ]

    for (let part of right) {
        const prev = parts[parts.length - 1].endsWith("/")
        const cur = part.startsWith("/")
        if (prev && cur) {
            part = stripLeadingSlash(part)
        } else if (!prev && !cur) {
            parts.push("/")
        }
        parts.push(part)
    }

    return parts.join("")
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

// TODO: Config for this, or way to pass it in manually:
function useXForwardedInfo(ctx: oak.Context, next: oak.Next) {
    const req = ctx.request
    const headers = req.headers

    // Oak sets the host from the "Host" header automatically.
    // Override it with a forwarded host if present:
    const host = headers.get("x-forwarded-host")
    if (host) {
        req.url.host = host
        if (!host.includes(":")) { req.url.port = "" }
    }

    const proto = headers.get("x-forwarded-proto")
    if (proto == "http" || proto == "https") {
        req.url.protocol = proto
    }

    return next()
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
 * Web crawlers keep crawling /u/:uid/feed and getting stuck going back and forth between ?before and ?after forever.
 * 
 * Even though we tell them not to do this in robots.txt.
 * 
 * So we're going to deny access to those pages unless you're marked as not-a-bot.
 * 
 * All the content available on the feed page is the same as would be present on individual /posts pages anwyay. 
 */
async function noBotsCookies(ctx: oak.Context, next: oak.Next) {
    ctx.cookies.set(cookies.notABotCookie, "!")
    await next()
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

function addSlash({request, response}: oak.Context) {
   const path = request.url.pathname + "/"
   response.redirect(path)
}

/** Allows easily wrapping serverDir() with a caching layer. */
function serveDirCached(router: oak.Router, path: ServerDirPath, embeds: Embeds, cacher: oak.Middleware) {
    // Use the same wildcard match that serveDir does:
    const wildcardPath = `${path}:unused(.*)`

    // Prefix with our cache layer:
    router.get(wildcardPath, cacher)

    serveDir(router, path, embeds)
}

function simpleCache(): oak.Middleware {
    const oneHour = 60 * 60
    const header = `max-age=${oneHour}`

    return async ({response}, next) => {
        await next()
        if (response.status.valueOf() == 200) {
            response.headers.set("Cache-Control", header)
        }
    }
}

/** Special caching for esbuild JS bundles */
function cacheESBuild(): oak.Middleware {
    const oneHour = 60 * 60
    const header = "Cache-Control"
    const defaultCache = `max-age=${oneHour}`

    // ESBuild names its chunks w/ hashes. Their contents will not change, can use a longer cache:
    const chunk = /\/chunk-.*js$/
    const chunkCache = `max-age=${oneHour * 24 * 7}`

    return async ({request, response}, next) => {
        await next()
        if (response.status.valueOf() != 200) { return }

        if (request.url.pathname.match(chunk)) {
            response.headers.set(header, chunkCache)
        } else {
            response.headers.set(header, defaultCache)
        }
    }
}

function robotsTxt({response}: oak.Context) {
    response.body = ROBOTS_TXT
}

const ROBOTS_TXT = `
User-Agent: *

# Site allows bi-directional navigation. Don't need to index it twice:
Disallow: /*?after=*

# Redundant with each user's "posts" page:
Disallow: /u/*/feed*

`.trim()