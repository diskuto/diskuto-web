/* @jsxImportSource preact */
/* @jsxRuntime automatic */

import { render } from "preact"
import { useComputed, useLoader, useSignal, useUpdateSignal, type Signal } from "../signals.ts"

import Nav from "../components/Nav.tsx";
import { Client, UserID } from "@diskuto/client";
import { create, fromBinary, ItemSchema, toBinary } from "@diskuto/client/types";
import Item from "../components/Item.tsx";
import { getLogin } from "../clientCookies.ts";
import { getWebInfo } from "../info.ts";
import { Input, TextArea } from "../components/form.tsx";
import { Signer } from "../components/Signer.tsx"
import { ArticleBody } from "../components/customTags.tsx";

export function mountAt(id: string) {
    const el = document.getElementById(id)
    if (!el) {
        console.error("Could not find element", id)
        return
    }

    const pat = /[/]([^/]+)[/]newPost$/
    const match = pat.exec(document.location.pathname)
    if (!match) {
        render(<div>Invalid path: {document.location.pathname}</div>, el)
        return
    }
    const uid = match[1]
    let userId
    try {
        userId = UserID.fromString(uid)
    } catch (_err) {
        render(<div>Invalid userId: {uid}</div>, el)
        return
    }

    render(<NewPost userId={userId}/>, el)
}

type Props = {
    userId: UserID
}

function NewPost(props: Props) {

    const userId = useUpdateSignal(props.userId)

    const title = useSignal("")
    const body = useSignal("")
    const showPreview = useComputed(() => body.value.trim().length > 0 || title.value.trim().length > 0)

    // The bytes that the user will need to sign to post this:
    const itemBytes = useComputed(() => makeItem({title, body}))
    const item = useComputed(() => fromBinary(ItemSchema, itemBytes.value))

    const webInfo = useLoader(async () => {
        return await getWebInfo()
    })

    const userProfile = useLoader(async () => {
        const web = webInfo.value
        if (!web) { return undefined }
        const client = new Client({baseUrl: web.apiUrl})
        return await client.getProfile(userId.value)
    })

    const displayName = useComputed(() => {
        const item = userProfile.value?.item
        if (!item) { return undefined }
        const profile = item.itemType.value
        return profile.displayName
    })

    let preview = undefined
    if (showPreview.value) {
        const itemInfo = {
            userId: userId.value,
            item: item.value,
            user: {
                displayName: displayName.value
            }
        } as const
        preview = <>
                <h1>Preview:</h1>

                <Item item={itemInfo} main preview/>
        </>
    }

    const nav = {
        page: "newPost",
        userId: userId.value.asBase58,
        viewAs: getLogin()?.asBase58
    } as const


    return <>
        <Nav title="New Post" state={nav} />
        <main>
            <article>
                <header><b>New Post</b></header>
                <ArticleBody>
                    <Input type="text" value={title} placeholder="Title (optional)"/>
                    <br/>
                    <TextArea 
                        value={body}
                        placeholder="Your post goes here"
                        initialFocus
                    />
                    {/* <p>(TODO: Attachments)</p> */}
                </ArticleBody>
            </article>

            {preview}
            {(!showPreview.value) ? undefined : <Signer {...{userId, item, itemBytes}} />}
        </main>
    </>
}




type MakeItemArgs = {
    title: Signal<string>
    body: Signal<string>
}

function makeItem({title, body}: MakeItemArgs): Uint8Array {
    // TODO: Allow user to select time.
    const now = new Date()

    const item = create(ItemSchema, {
        timestampMsUtc: BigInt(now.valueOf()),
        utcOffsetMinutes: -now.getTimezoneOffset(),
        itemType: {
            case: "post",
            value: {
                body: body.value,
                title: title.value,
                // TODO: attacments.
            }
        }
    })

    return toBinary(ItemSchema, item)
}
