import type { Config } from "./config.ts";

import {oak, serveDir} from "@nfnitloop/deno-embedder/helpers/oak"
import { renderToString } from "preact-render-to-string"
import styleFiles from "../generated/styles/dir.ts"
import jsFiles from "../generated/js/dir.ts"
import type { VNode } from "preact";
import Page, { getViewAs } from "./components/Page.tsx";
import Item from "./components/Item.tsx";
import { CacheClient, type PaginationOut } from "./client.ts";
import { Signature, UserID } from "@nfnitloop/feoblog-client";
import SPA from "./components/SPA.tsx";
import { NavState } from "./components/Nav.tsx";
import { DiskutoWebInfo, InfoPath } from "./info.ts";

export class Server {
    #client: CacheClient

    constructor(private config: Config) {
        this.#client = new CacheClient({base_url: config.api.url})
    }

    async run(): Promise<void> {
        const router = new oak.Router();
        router.get("/", c => this.homeRedirect(c))
        router.get("/home", c => this.homePage(c))
        router.get("/signer", c => this.signer(c))
        router.get("/login", c => this.login(c))
        router.get("/u/:uid/", c => this.userPosts(c, c.params))
        router.get("/u/:uid/profile", c => this.userProfile(c, c.params))
        router.get("/u/:uid/feed", c => this.userFeed(c, c.params))
        router.get("/u/:uid/newPost", c => this.newPost(c))
        router.get("/u/:uid/i/:sig/files/:fileName", c => this.fileRedirect(c, c.params))
        router.get("/u/:uid/i/:sig/", c => this.viewPost(c, c.params))
        router.get("/u/:uid/icon.png", c => this.userIcon(c, c.params))
        router.get(InfoPath, c => this.info(c))

        router.get("/u/:uid", addSlash)
        router.get("/u/:uid/i/:sig", addSlash)


        // Though these get generated differently, we don't expect them to overlap so
        // we collapse them into /static/:
        serveDir(router, "/static/", styleFiles)
        serveDir(router, "/js/", jsFiles)

        // Default/404 page:
        router.get("/(.*)", c => this.notFound(c))

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
        let elements = items.map(i => <Item item={i}/>)

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
                        <article-body>{"There's nothing more to see here."}</article-body>
                    </article>
                ]
            
            }
        }

        const nav: NavState = {
            page: "posts",
            userId: userId.asBase58,
        } as const

        const page = <Page {...{request, title, nav}}>
            {elements}
            <Footer {...{pagination, thisPage}}/>
        </Page>
        
        render(response, page)
    }

    async viewPost({request, response}: oak.Context, {uid, sig}: {uid: string, sig: string} ) {
        const userId = UserID.fromString(uid)
        const signature = Signature.fromString(sig)
        const [post, userName] = await Promise.all([
            this.#client.getItemPlus(userId, signature),
            this.#client.getDisplayName(userId),
            // TODO: Load comments too.
        ])

        if (post === null) {
            response.status = 404 // not found.
            return
        }

        let title = `Post by ${userName.displayName}`
        if (post.item.itemType.case == "post") {
            const postTitle = post.item.itemType.value.title.trim()
            if (postTitle.length > 0) {
                title = postTitle
            }
        }

        const nav = {
            page: "item",
            userId: userId.asBase58,
            signature: signature.asBase58,
        } as const


        const page = <Page {...{request, title, nav}}>
            <Item main item={post}/>
        </Page>
        
        render(response, page)
    }

    async userProfile({request, response}: oak.Context, {uid}: {uid: string} ) {
        const userId = UserID.fromString(uid)
        const profile = await this.#client.getProfile(userId)

        if (!profile) {
            // TODO: nicer 404 page.
            response.status = 404
            return
        }

        const displayName = profile.profile.displayName.trim() || uid
        const title = `${displayName}: Profile`
        const nav = {
            page: "profile",
            userId: uid,
        } as const

        const item = {
            item: profile.item,
            userId,
            signature: profile.signature,
            user: { displayName }
        } as const

        const page = <Page {...{request, title,nav}}>
            <Item main item={item}/>
        </Page>

        render(response, page)
    }

    async userFeed({request, response}: oak.Context, {uid}: {uid: string} ) {
        const thisPage = request.url.pathname
        const before = getIntParam(request, "before")
        const after = getIntParam(request, "after")
        const userId = UserID.fromString(uid)
        const [userFeed, userName] = await Promise.all([
            this.#client.loadUserFeed({before, after, userId}),
            this.#client.getDisplayName(userId),
        ])
        const {items, pagination} = userFeed
        const title = `${userName.displayName}: Feed`
        let elements = items.map(i => <Item item={i}/>)

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
                        <article-body>{"There's nothing more to see here."}</article-body>
                    </article>
                ]
            
            }
        }

        const nav = {
            page: "feed",
            userId: userId.asBase58,
        } as const

        const page = <Page {...{request, title, nav}}>
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
        const viewAs = getViewAs(request)
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
                        <article-body>{"There's nothing more to see here."}</article-body>
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

    /**
     * No need to serve our own files. The API server does that for us. Just redirect there:
     */
    fileRedirect({response}: oak.Context, {uid, sig, fileName}: {uid: string, sig: string, fileName: string}) {
        const newUrl = urlJoin(this.config.api.url, `/u/${uid}/i/${sig}/files/${fileName}`)
        response.redirect(newUrl)
        response.status = 301
    }

    userIcon({response}: oak.Context, {uid}: {uid: string}) {
        // ex: https://blog.nfnitloop.com/u/42P3FTZoCmN8DRmLSu89y419XfYfHP9Py7a9vNLfD72F/icon.png

        // TODO: Implement local icon generation. Maybe as SVG?
        // Until then, (ab)use the fact that FeoBlog already provides these.

        const newUrl = urlJoin(this.config.api.url, `/u/${uid}/icon.png`)
        response.redirect(newUrl)
        response.status = 301
    }


    /** Render the Not Found page. */
    notFound({request, response}: oak.Context): void {
        const page = <Page request={request} title="Not Found" nav={{page: "notFound"}}>
            <p>Page not found.</p>
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

function addSlash({request, response}: oak.Context) {
   const path = request.url.pathname + "/"
   response.redirect(path)
}