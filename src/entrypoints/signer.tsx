/* @jsxImportSource preact */
/* @jsxRuntime automatic */

import { render } from "preact"
import { useEffect, useRef } from "preact/hooks"
import { Signal, useComputed, useSignal, useSignalEffect } from "../signals.ts"
import { SignRequest } from "../signRequest.ts";
import Item from "../components/Item.tsx";
import { PrivateKey, Signature } from "@diskuto/client";
import { Input } from "../components/form.tsx";
import { ArticleBody, UserIdTag } from "../components/customTags.tsx";
import { Box } from "../components/Box.tsx";

export function mountAt(id: string) {
    const el = document.getElementById(id)
    if (!el) {
        console.error("Could not find element", id)
        return
    }
    document.getElementsByTagName("html")[0].style.background = "#bb0101"
    render(<Signer/>, el)
}

function Signer() {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const privateKey = useSignal("")
    const keyParseError = useSignal("")
    const parsedPrivateKey = useSignal<PrivateKey|null>(null)
    useSignalEffect(() => {
        const result = parseSecretKey(privateKey.value)
        if (result.error) {
            keyParseError.value = result.message
            parsedPrivateKey.value = null
        } else {
            keyParseError.value = ""
            parsedPrivateKey.value = result.secretKey
        }
    })

    const signRequest = useSignal("")
    const hasRequest = useComputed(() => signRequest.value.trim().length > 0 )
    const validSignRequest = useComputed(() => validate(signRequest.value))
    const signRequestError = useSignal("")

    const signature = useSignal("")

    const pasteSigRequest = async () => {
        signRequest.value = await readClipboard()
    }

    const makeSignature = () => {
        signature.value = ""
        signRequestError.value = ""
        const secretKey = parsedPrivateKey.value

        const srInput = signRequest.value.trim()
        const privKeyInput = privateKey.value.trim()

        if (privKeyInput.length == 0 && srInput.length == 0) {
            // Noting to do yet:
            return
        }

        if (keyParseError.value) {
            // Let the user deal with that first.
            return
        }

        if (!secretKey) {
            signRequestError.value = "No secret key found."
            return
        }

        // Wait for user to input the signing request:
        if (srInput.length == 0) {
            return
        }

        const vsrResult = validSignRequest.value

        if (vsrResult.error) { 
            signRequestError.value = vsrResult.message
            return
        }
        const {itemBytes, userId: requestUid} = vsrResult.request

        if (secretKey.userID.asBase58 != requestUid.asBase58) {
            signRequestError.value = `Signature request for userID ${requestUid.asBase58} does not match private key userID.`
            return
        }
        
        const sig = secretKey.sign(itemBytes)
        signature.value = sig.asBase58
    }


    // Whenever the signature request changes, delete the old signature:
    useSignalEffect(() => {
        makeSignature()
    })

    let parseError = undefined
    if (privateKey.value.trim().length > 0 && keyParseError.value) {
        parseError = <p><b>Error:</b>{" "}{keyParseError.value}</p>
    }

    const privateKeyInfo = useComputed(() => {
        const pkey = parsedPrivateKey.value
        if (!pkey) { return <></> }

        return <p>✅ valid private key for userID <UserIdTag>{pkey.userID.asBase58}</UserIdTag></p>
    })



    const signAPost = <Box title="Sign a Post">
            <p><label>
                <b>Private Key:</b>
                <br/><Input 
                    type="password"
                    placeholder="⚠️ Paste your secret key ⚠️"
                    value={privateKey}
                    initialFocus
                />
            </label></p>
            {parseError}
            {privateKeyInfo}
            
            <p><label>
                <b>Signature Request:</b>
                <br/><textarea 
                    ref={inputRef}
                    placeholder="Paste a JSON signing request here."
                    style="width: 100%; min-height: 3rem;"
                    value={signRequest.value}
                    onInput={(e) => { signRequest.value = e.currentTarget.value; } }
                    spellcheck={false}
                >{signRequest.value}</textarea>
                <br/><button onClick={pasteSigRequest}>Paste</button>
            </label></p>
            <ShowError message={signRequestError}/>
    </Box>

    const showInfo = !parsedPrivateKey.value && signRequest.value.length == 0
    const info = showInfo ? PageInfo : undefined

    let preview = <></>
    const showPreview = (
        !signRequestError.value 
        && !validSignRequest.value.error
    )
    if (showPreview) {
        const req = validSignRequest.value.request
        const {userId, item} = req
        const itemInfo = {
            userId,
            item,
            user: {}
        } as const
        preview = <>
                <h1>Preview:</h1>

                <Item item={itemInfo} main/>
        </>
    }

    let signResult = undefined
    if (signature.value) {
        signResult = <Box title="Signature">
            <p>If the above preview looks correct, copy this signature to sign it.</p>
            <Input type="text" value={signature} disabled/>
            <CopyButton value={signature}/>
        </Box>
    }


    return <>
        {signAPost}
        {preview}
        {signResult}
        {info}
    </>
}

function ShowError({message}: {message: Signal<string>}) {
    if (!message.value) { return <></> }
    return <p><b>Error:</b> {message}</p>
}

function CopyButton({value}: {value: Signal<string>}) {
    const onClick = () => {
        navigator.clipboard.writeText(value.value)
    }

    return <button onClick={onClick}>Copy</button>
}

const PageInfo = <article>
    <header><b>What's this thing?</b></header>
    <ArticleBody>
        <p>In <a href="https://github.com/diskuto">Diskuto</a>, you don't use a login and password to post or view content. 
            Instead, you <a href="https://en.wikipedia.org/wiki/Digital_signature">cryptographically sign</a> any content
            to claim it as your own. Once signed, servers that host your content will accept it on behalf of you and those
            who wish to see your content.
        </p>
        <p>Eventually, we'll <a href="https://github.com/diskuto/diskuto-web/issues/3">enable signing via a browser plugin</a>.
           Until then, 
            you can use this tool to sign any content you want to post to Diskuto.
        </p>
        <p>Note: Pasting your private key into a web page is insecure! So make
            sure you trust the source before you do so.
        </p>
    </ArticleBody>
</article>

type ValidateResult = ValidateError | Success

type ValidateError = {
    error: true
    message: string
}

type Success = {
    error: false
    request: SignRequest
}

function validate(signRequest: string): ValidateResult {
    try {
        const request = SignRequest.fromJson(signRequest)
        return {
            error: false,
            request
        }
    } catch (err: unknown) {
        return {
            error: true,
            message: `${err}`
        }
    }
}

type ParseResult = ValidateError | {
    error: false
    secretKey: PrivateKey
}

function parseSecretKey(secretKeyString: string): ParseResult {
    try {
        const secretKey = PrivateKey.fromBase58(secretKeyString)
        return { error: false, secretKey }

    } catch (err) {
        let message = `${err}`
        message = message.replace(/^Error:[ ]/, "")
        return { error: true, message }
    }
}

async function readClipboard(): Promise<string> {
    return await navigator.clipboard.readText()
}