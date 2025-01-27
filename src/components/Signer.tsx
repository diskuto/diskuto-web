/* @jsxImportSource preact */
/* @jsxRuntime automatic */

/**
 * UI to handle signing & sending an item.
 */

import { Client, Signature, UserID } from "@diskuto/client";
import { Input } from "./form.tsx";
import { Signal, useComputed, useSignal } from "@preact/signals";
import { SignRequest } from "../signRequest.ts";
import { ProgressBox, useProgress } from "./Progress.tsx";
import { getWebInfo } from "../info.ts";
import { Item } from "@diskuto/client/types";
import { Box } from "./Box.tsx";

export function Signer({userId, itemBytes, item}: Props) {

    const signRequest = useComputed(
        () => SignRequest.fromBytes({itemBytes: itemBytes.value, userId: userId.value}).toJson(),
    )

    const copyRequest = () => {
        navigator.clipboard.writeText(signRequest.value)
    }

    const signature = useSignal("")
    const validSignature = useComputed(() => {
        const sig = Signature.tryFromString(signature.value)
        if (!sig) return null;
        if (!sig.isValidSync(userId.value, itemBytes.value)) return null;
        return sig
    })

    const progress = useProgress("Sending Post")
    const sendPost = async () => {
        await progress.run(async () => {
            const info = await progress.task("Load server metadata", async () => {
                return await getWebInfo()
            })
            const client = new Client({baseUrl: info.apiUrl})

            // TODO: Use the servers in the user's profile to post to.
            const _profile = await progress.task("Load user profile.", async () => {
                return await client.getProfile(userId.value)
            })

            await progress.task(`Sending Post to ${client.url}`, async () => {
                await client.putItem(userId.value, validSignature.value!, itemBytes.value)
            })
        })
    }

    return <>
        <Box title={`Sign Your ${getSubject(item.value)}`}>
            <p>
                <button onClick={copyRequest}>Copy Signing Request</button>
                {" "}<a href="/signer" target="_blank">Open Signing Tool</a>
                <br/><Input type="text" placeholder="signature" value={signature}/>
                <br/><button disabled={!validSignature.value || progress.inProgress.value} onClick={sendPost}>Post</button>
            </p>
        </Box>
        <ProgressBox progress={progress}/>    
    </>
}
        

export type Props = {
    /** UserID who we expect to sign this content. */
    userId: Signal<UserID>

    /** The unserialized item, so we can inspect it. */
    item: Signal<Item>
    
    /** The content to sign. */
    itemBytes: Signal<Uint8Array>

    // TODO: attachments.
}

type TypeName = Exclude<Item["itemType"]["case"], undefined>

const subjects: Record<TypeName, string> = {
    "post": "Post",
    "comment": "Comment",
    "profile": "Profile"
}

function getSubject(item: Item) {
    const typeName = item.itemType.case
    if (!typeName) { return "Item" }
    return subjects[typeName]
}


// TODO
    // let viewYourPost = undefined
    // if (validSignature.value && progress.hasFinished.value && !progress.hasError.value) {
    //     viewYourPost = <article>
    //         <header><b>View Your Post</b></header>
    //         <article-body>
    //             <p>Success! You can view your post <a href={`/u/${userId.asBase58}/i/${signature.value}/`}>here</a>.</p>
    //         </article-body>
    //     </article>
    // }