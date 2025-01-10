import { render } from "preact"
import { useEffect } from "preact/hooks"
import { useComputed, useSignal, type Signal } from "@preact/signals"
import { createRef } from "preact";
import Nav from "../components/Nav.tsx";
import { UserID } from "@nfnitloop/feoblog-client";
import { create, fromBinary, ItemSchema, toBinary } from "@nfnitloop/feoblog-client/types";
import Item from "../components/Item.tsx";
import { SignRequest } from "../signRequest.ts";

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

function NewPost({userId}: Props) {
    const inputRef = createRef()
    useEffect(() => {
        inputRef.current.focus()
    }, [])

    const title = useSignal("")
    const body = useSignal("")
    const hasBody = useComputed(() => body.value.trim().length > 0 )

    // The bytes that the user will need to sign to post this:
    const itemBytes = useComputed(() => makeItem({title, body}))
    const item = useComputed(() => fromBinary(ItemSchema, itemBytes.value))
    const signRequest = useComputed( () => 
        SignRequest.fromBytes({itemBytes: itemBytes.value, userId}).toJson()
    )

    const copyRequest = () => {
        navigator.clipboard.writeText(signRequest.value)
    }


    let preview = undefined
    if (hasBody.value) {
        const itemInfo = {
            userId,
            item: item.value,
            user: {}
        } as const
        preview = <>
                <h1>Preview:</h1>

                <Item item={itemInfo} main/>
        </>
    }

    const nav = {
        page: "newPost",
        userId: userId.asBase58,
    } as const


    return <>
        <Nav title="New Post" state={nav} />
        <main>
            <article>
                <header>New Post</header>
                <article-body>
                    <textarea 
                        ref={inputRef}
                        placeholder="Your post goes here"
                        style="width: 100%; min-height: 3rem;"
                        onInput={(e) => { body.value = e.currentTarget.value; } }
                    >{body.value}</textarea>

                    <input type="text" placeholder="signature"/>
                    <button onClick={copyRequest}>Copy Signing Request</button>
                </article-body>
            </article>

            {preview}

        </main>
    </>
}

type MakeItemArgs = {
    title: Signal<string>
    body: Signal<string>
}

function makeItem({title, body}: MakeItemArgs): Uint8Array {
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
