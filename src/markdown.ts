// @deno-types="npm:@types/commonmark"
import * as commonmark from "commonmark"
import { AttachmentHash } from "@diskuto/client"

const cmReader = new commonmark.Parser()
const cmWriter = new commonmark.HtmlRenderer({ safe: true})

type MarkdownToHtmlOptions = {
    stripImages?: boolean
    withPreview?: FileInfo[]

    // A base URL to prepend to relative URLs.
    relativeBase?: string
}

export function markdownToHtml(markdown: string, options?: MarkdownToHtmlOptions): string {
    if (!markdown) { return ""}

    const parsed = cmReader.parse(markdown)

    if (options?.stripImages) {
        stripImages(parsed)
    }

    if (options?.withPreview) {
        previewImages(parsed, options.withPreview)
    }

    fixRelativeLinks(parsed, options)

    return cmWriter.render(parsed)
}

// Information about a markdown text.
// Tries to not expose library-specific data structures (ex: Node)
type MarkdownInfo = {
    linkDestinations: Set<string>
    imageDestinations: Set<string>
    unlinkedRefs: Set<string>
}

// Intended to be used by the live editor.
export function getMarkdownInfo(markdown: string): MarkdownInfo {
    const parsed = cmReader.parse(markdown)

    const linkDestinations = new Set<string>()
    const imageDestinations = new Set<string>()
    const unlinkedRefs = new Set<string>()

    let refCollector: string[] = []

    const walker = parsed.walker()
    for (let event = walker.next(); event; event = walker.next()) {
        if (!event.entering) continue
        const node = event.node
        if (node.type == "link") {
            linkDestinations.add(node.destination!)
            continue
        }

        if (node.type == "image") {
            imageDestinations.add(node.destination!)
            continue
        }

        if (node.type != "text") { continue }
        // By a quirk of the commonmark parser, it will give us an AST for [foo bar] that looks like:
        // <text>[</text>
        // <text>foo bar</text>
        // <text>]</text>
        // This also means that that text is NOT linked. Unless it's for a case like [foo [bar] baz]
        // but whatever, ignoring that pathological case. :p
        if (node.literal == "[" || node.literal == "![") {
            refCollector = [node.literal]
            continue
        }
        if (refCollector.length == 0) { continue }

        if (node.literal == "]") {
            refCollector.push(node.literal)
            unlinkedRefs.add(refCollector.join(""))
            refCollector = []
            continue
        }

        refCollector.push(node.literal!)
    }


    return {linkDestinations, imageDestinations, unlinkedRefs}
}

type MarkdownOpenGraphInfo = {
    plaintext: string
    images: ImageInfo[]
}

type ImageInfo = {
    url: string
    alt?: string
    title?: string
}

export function mdOpenGraphInfo(markdown: string): MarkdownOpenGraphInfo {
    const parsed = cmReader.parse(markdown)
    const skippedBlocks: commonmark.NodeType[] = ["image", "html_block"]
    const blocks: commonmark.NodeType[] = ["paragraph", "heading"]
    
    // Walk the tree. Render to plaintext (parts) as we go.
    const parts = []
    // Collect images as we go too.
    const images: ImageInfo[] = []
    const walker = parsed.walker()
    for (let event = walker.next(); event; event = walker.next()) {
        const node = event.node
        if (!event.entering && blocks.includes(node.type)) {
            parts.push("\n\n")
            continue
        }

        if (!event.entering) { continue }

        if (node.type == "image" && node.destination) {
            images.push({
                url: node.destination,
                alt: altText(node)
            })
        }

        if (skippedBlocks.includes(node.type)) {
            // Just skip over images.
            do {
                event = walker.next()
            } while (event && (event.entering || event.node.type != node.type))
        }

        if (node.type != "text") { continue }

        if (!node.literal) { continue } 
        
        parts.push(node.literal)
    }

    return {
        plaintext: parts.join(""),
        images
    }
}

function altText(node: commonmark.Node): string|undefined {
    if (node.type != "image") { return undefined }

    // According to the commonmark standard, in the markdown `![img]`, "img" is the alt text.
    // But it often ends up being useless text like that, or the filename, or even something like "1".
    // If the user specifies a "title", that's probably more appropriate for use as the alt text, so we'll prefer that.

    const title = node.title
    const alt = textRun(node.firstChild)
    if (title && alt) {
        return title.length > alt.length ? title : alt
    } else if (title) {
        return title
    } else {
        return alt ?? undefined
    }
}

function textRun(node: commonmark.Node|null): string | undefined {
    if (node?.type != "text") { return undefined }
    const parts = []
    for (; node?.type == "text"; node = node.next) {
        parts.push(node.literal ?? "")
    }
    return parts.join("")
}


// TODO: This is only useful in the browser. Let's move that stuff to a separate subdir.
/**
 * An in-memory copy of a File object, w/ its hash.
 */
export class FileInfo {
    readonly blob: Blob
    name: string
    readonly hash: AttachmentHash
    readonly mimeType?: string

    objectURL: string

    private constructor({name, hash, blob, mimeType}: FileInfoArgs) {
        this.blob = blob
        this.name = name
        this.hash = hash
        this.mimeType = mimeType,
        this.objectURL = URL.createObjectURL(blob)
    }

    static async from(file: File): Promise<FileInfo> {
        // #122: Immediately read all file bytes and metadata into our own objects.
        // The browser's File object can not be trusted long-term. 
        // 1) I think I caught it sending different bytes than I attached. (can't reproduce)
        // 2) If a file's bytes change after attaching, you can't read it anymore. Unepxected exception.
        // Better to get the exception at attach time than when we're done w/ a post and trying to upload it.
        
        const buf = await file.arrayBuffer()
        const blob = new Blob([buf], {type: file.type})
        return new FileInfo({
            name: file.name,
            blob,
            hash: AttachmentHash.fromBuf(buf),
            mimeType: file.type
        })
    }

    debug() {
        console.debug({
            file: this.name,
            size: this.blob.size,
            hash: this.hash.asHex
        })
        return this
    }

    get type() { return this.blob.type }
    get size() { return this.blob.size }

    get readableSize(): string {
        return readableSize(this.size)
    }

    private static supportedImagesTypes = new Set([
        "image/jpeg",
        "image/png",
        "image/gif",

        // ⚠️ Nope! SVG can include JavaScript. :(
        // "image/svg+xml",
    ])

    get isImage(): boolean {
        return FileInfo.supportedImagesTypes.has(this.type)
    }

    /** Cleanup the objectURL reference, to free up memory. */
    close() {
        if (this.objectURL != "") {
            URL.revokeObjectURL(this.objectURL)
            this.objectURL = ""
        }
    }
}

type FileInfoArgs = {
    name: string
    hash: AttachmentHash
    blob: Blob
    mimeType?: string
}

/**
 * Users can use relative URLS to things like `files/foo.txt`.
 * These work when viewing the item at its usual url (/u/:uid/i/:sig/), but will
 * not work correctly when viewing an item in a feed at a different URL.
 * 
 * This function resolves relative URLs to a base (probably the )
 */
function fixRelativeLinks(root: commonmark.Node, options?: MarkdownToHtmlOptions) {
    if (!(options?.relativeBase)) { return }

    const walker = root.walker()
    for (let event = walker.next(); event; event = walker.next()) {
        if (!event.entering) continue

        const node = event.node
        if (!(node.type == "image" || node.type == "link")) continue
        if (!node.destination) continue

        const url = node.destination
        if (url.startsWith("/") || url.indexOf("//") >= 0) {
            // absolute URLs do not get corrected:
            continue
        }

        node.destination = options.relativeBase + node.destination
    }
}


function stripImages(root: commonmark.Node) {
    const walker = root.walker()

    for (let event = walker.next(); event; event = walker.next()) {
        if (!event.entering) continue

        const image = event.node
        if (image.type != "image") continue

        const altText = image.title?.trim()
        let imageTitle: string = ""
        if (image.firstChild && image.firstChild.type == "text") {
            imageTitle = image.firstChild.literal?.trim() || ""
        }

        const link = new commonmark.Node("link")
        link.destination = image.destination

        let linkText
        if (imageTitle && altText) {
            // Use both:
            linkText = altText
            link.title = imageTitle
        } else {
            // Use the first one:
            linkText = imageTitle || altText || link.destination
        }
        const textNode = new commonmark.Node("text")
        textNode.literal = linkText
        link.appendChild(textNode)

        // Replace:
        image.insertBefore(link)
        image.unlink()
        walker.resumeAt(link)
    }
}

function previewImages(root: commonmark.Node, attachments: FileInfo[]) {
    if (attachments.length === 0) return

    // Map FileInfo to their relative ./file/* paths for fast lookup:
    const fileMap = new Map<string,FileInfo>()
    for (const fi of attachments) {
        const key = encodeURI(`files/${fi.name}`)
        fileMap.set(key, fi)
        // Also allow ./-prefixed relative paths:
        fileMap.set(`./${key}`, fi)
    }

    const walker = root.walker()
    for (let event = walker.next(); event; event = walker.next()) {
        if (!event.entering) continue

        const image = event.node
        if (image.type != "image") continue
        if (!image.destination) continue

        const newDestination = fileMap.get(image.destination)
        if (newDestination) {
            // Replace w/ an objectURL to view the attached file inline:
            // (also avoids unnecessary hits to the server).
            image.destination = newDestination.objectURL
        }
    }
}

// Give a size in human-readable 
export function readableSize(bytes: number): string {
    const base = 1024
    const magnitudes = ["bytes", "KiB", "MiB", "GiB", "TiB"]
    let count = bytes

    while (count > base && magnitudes.length > 1) {
        count = count / base
        magnitudes.shift()
    }
    const magnitude = magnitudes[0]

    // Show 3 significant digits:
    let out
    if (magnitude === "bytes") {
        out = count
    }else if (count < 10) {
        out = count.toFixed(2)
    } else if (count < 100) {
        out = count.toFixed(1)
    } else {
        out = count.toFixed(0)
    }

    return `${out} ${magnitude}`
}
