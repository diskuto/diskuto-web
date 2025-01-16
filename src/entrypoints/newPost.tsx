import { render } from "preact"
import { useComputed, useLoader, useSignal, type Signal } from "../signals.ts"

import Nav from "../components/Nav.tsx";
import { Client, Signature, UserID } from "@nfnitloop/feoblog-client";
import { create, fromBinary, ItemSchema, toBinary } from "@nfnitloop/feoblog-client/types";
import Item from "../components/Item.tsx";
import { SignRequest } from "../signRequest.ts";
import { getLogin } from "../cookies.ts";
import { ProgressBox, useProgress } from "../components/Progress.tsx";
import { getWebInfo } from "../info.ts";
import { Input, TextArea } from "../components/form.tsx";

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

    const title = useSignal("")
    const body = useSignal("")
    const signature = useSignal("")
    const hasBody = useComputed(() => body.value.trim().length > 0 )

    // The bytes that the user will need to sign to post this:
    const itemBytes = useComputed(() => makeItem({title, body}))
    const item = useComputed(() => fromBinary(ItemSchema, itemBytes.value))
    const signRequest = useComputed( () => 
        SignRequest.fromBytes({itemBytes: itemBytes.value, userId}).toJson()
    )

    const parsedSignature = useComputed(() => Signature.tryFromString(signature.value))
    const validSignature = useComputed(() => {
        const sig = parsedSignature.value
        if (!sig) return false;
        return sig.isValidSync(userId, itemBytes.value)
    })

    const copyRequest = () => {
        navigator.clipboard.writeText(signRequest.value)
    }

    const webInfo = useLoader(async () => {
        return await getWebInfo()
    })

    const userProfile = useLoader(async () => {
        const web = webInfo.value
        if (!web) { return undefined }
        const client = new Client({base_url: web.apiUrl})
        return await client.getProfile(userId)
    })

    const displayName = useComputed(() => {
        console.log("compute displayName")
        const item = userProfile.value?.item
        if (!item) { return undefined }
        if (item.itemType.case != "profile") { return undefined }
        const profile = item.itemType.value
        return profile.displayName
    })

    const progress = useProgress("Sending Post")
    const sendPost = async () => {
        await progress.run(async () => {
            const info = await progress.task("Load server metadata", async () => {
                return await getWebInfo()
            })
            const client = new Client({base_url: info.apiUrl})

            // TODO: Use the servers in the user's profile to post to.
            const _profile = await progress.task("Load user profile.", async () => {
                return await client.getProfile(userId)
            })

            await progress.task(`Sending Post to ${client.url}`, async () => {
                await client.putItem(userId, parsedSignature.value!, itemBytes.value)
            })
        })
    }

    let preview = undefined
    if (hasBody.value) {
        const itemInfo = {
            userId,
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

    let signer = undefined
    if (hasBody.value) {
        signer = <article>
            <header><b>Sign Your Post</b></header>
            <article-body>
                <p>
                    <button onClick={copyRequest}>Copy Signing Request</button>
                    {" "}<a href="/signer" target="_blank">Open Signing Tool</a>
                    <br/><Input type="text" placeholder="signature" value={signature}/>
                    <br/><button disabled={!validSignature.value || progress.inProgress.value} onClick={sendPost}>Post</button>
                </p>
            </article-body>
        </article>
    }

    let viewYourPost = undefined
    if (validSignature.value && progress.hasFinished.value && !progress.hasError.value) {
        viewYourPost = <article>
            <header><b>View Your Post</b></header>
            <article-body>
                <p>Success! You can view your post <a href={`/u/${userId.asBase58}/i/${signature.value}/`}>here</a>.</p>
            </article-body>
        </article>
    }

    const nav = {
        page: "newPost",
        userId: userId.asBase58,
        viewAs: getLogin()?.asBase58
    } as const


    return <>
        <Nav title="New Post" state={nav} />
        <main>
            <article>
                <header><b>New Post</b></header>
                <article-body>
                    <Input type="text" value={title} placeholder="Title (optional)"/>
                    <br/>
                    <TextArea 
                        value={body}
                        placeholder="Your post goes here"
                        initialFocus
                    />
                    {/* <p>(TODO: Attachments)</p> */}
                </article-body>
            </article>

            {preview}
            {signer}
            <ProgressBox progress={progress}/>
            {viewYourPost}
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
