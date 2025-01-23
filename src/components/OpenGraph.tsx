
/**
 * Metadata for the opengraph protocol.
 * 
 * See: <https://ogp.me>
 */

import type { oak } from "@nfnitloop/deno-embedder/helpers/oak";
import type { ItemInfoPlus } from "../client.ts";
import { mdOpenGraphInfo } from "../markdown.ts";

export function OpenGraph({request, item}: Props) {
    if (!item) { return <></> }

    const ogi = parseOpenGraph(request, item)
    const {siteName, title, type: pageType, url, image, imageAlt, description, imageSize, author} = ogi
    return <>
        <meta property="og:type" content={pageType || "article"}/>
        <meta property="og:site_name" content={siteName}/>
        <meta property="og:title" content={title}/>
        <meta property="og:url" content={url}/>
        {!author ? undefined : 
        <>
            <meta property="article:author" content={author.url}/>
            <meta property="article:author:username" content={author.username}/>
        </>
        }
        <meta property="og:image" content={image}/>
        {!imageSize ? undefined : 
        <>
            <meta property="og:image:width" content={`${imageSize.width}`}/>
            <meta property="og:image:height" content={`${imageSize.height}`}/>
        </>
        }
        <meta property="og:image:alt" content={imageAlt}/>
        <meta property="og:description" content={description}/>
    </>
}

type Props = {
    request: oak.Request
    item?: ItemInfoPlus
}

export type OpenGraphInfo = {
    /** The overall site name. We default to the author's display name, if set. */
    siteName: string
    author?: {username: string, url: string}

    title: string
    type?: "article"
    url: string
    
    /** URL to an image. */
    image: string
    imageAlt: string
    imageSize?: {width: number, height: number}

    /** AKA: the summary of this page. */
    description: string
}

export function parseOpenGraph(request: oak.Request, item: ItemInfoPlus): OpenGraphInfo {
    const {userId, signature} = item
    const itemType = item.item.itemType.case
    
    // TODO: More reliable way to get a base URL!
    // TODO: Pass the to the thing that extracts images.
    const itemUrl = new URL(`/u/${userId.asBase58}/i/${signature.asBase58}/`, request.url)
    const absolute = (url: string) => new URL(url, itemUrl).toString()

    const iconImage = absolute(`/u/${userId.asBase58}/icon.png`)
    const props: OpenGraphInfo = {
        url: itemUrl.toString(),
        siteName: "Diskuto",
        image: iconImage,
        imageAlt: "",
        title: "",
        description: ""
    }

    const displayName = item.user.displayName?.trim()
    if (displayName) {
        props.siteName = `${displayName} on Diskuto`
        props.author = {
            username: displayName,
            url: absolute(`/u/${userId.asBase58}/profile`)
        }
    }

    if (itemType == "post") {
        const post = item.item.itemType.value
        const postTitle = post.title.trim()
        if (postTitle) {
            props.title = postTitle
        } else {
            props.title = "A post"
        }

        const ogi = mdOpenGraphInfo(post.body)
        props.description = ogi.plaintext
        if (ogi.images.length > 0) {
            const img = ogi.images[0]
            props.image = absolute(img.url)
            props.imageAlt = img.alt ?? ""
        }
    } else if (itemType == "comment") {
        const comment = item.item.itemType.value
        const ogi = mdOpenGraphInfo(comment.text)
        props.description = ogi.plaintext
    } else if (itemType) {
        props.title = `A ${itemType}`
    }

    props.description = truncate(200, props.description)

    // TODO: article:published_time?
    // TODO: article:author?  (not 100% sure how to represent this)

    // Thought this might make the icon image preview look smaller. It did not.
    // if (props.image == iconImage) {
    //     props.imageSize = {width: 100, height: 100}
    // }

    return props
}

function truncate(max: number, text: string): string {
    // Sometimes we get extra \n\ns at the end of a post, if there are attachments or embedded paragraphs.
    text = text.trim()

    if (text.length <= max) { return text }

    return text.substring(0, max) + "…"
}

