import { render } from "preact"
import { useEffect } from "preact/hooks"
import { useComputed, useSignal, useSignalEffect } from "@preact/signals"
import { createRef } from "preact";
import { SignRequest } from "../signRequest.ts";
import Item from "../components/Item.tsx";
import { PrivateKey, Signature, UserID } from "@nfnitloop/feoblog-client";

export function mountAt(id: string) {
    const el = document.getElementById(id)
    if (!el) {
        console.error("Could not find element", id)
        return
    }
    render(<Signer/>, el)
}

function Signer() {
    const inputRef = createRef()
    useEffect(() => {
        inputRef.current.focus()
    }, [])

    const signRequest = useSignal("")
    const hasRequest = useComputed(() => signRequest.value.trim().length > 0 )
    const validSignRequest = useComputed(() => validate(signRequest.value))

    // We attempt to keep this in memory for as little time as possible:
    const privateKey = useSignal("")
    const parsedPrivateKey = useComputed(() => parseSecretKey(validSignRequest.value, privateKey.value))

    // If we get a valid secret key, immediately create a signature and delete it.
    useSignalEffect(() => {
        const ppkResult = parsedPrivateKey.value
        const vsrResult = validSignRequest.value

        if (ppkResult.error) { return }
        const {secretKey} = ppkResult

        if (vsrResult.error) { return }
        const {itemBytes} = vsrResult.request
        

        const binSignature = secretKey.signDetached(itemBytes)
        const sig = Signature.fromBytes(binSignature)
        console.log("signature", sig.asBase58)
        console.debug("Removing private key from memory.")
        privateKey.value = ""

    })

    const info = /* hasRequest.value ? undefined : */ <article>
        <header>What's this thing?</header>
        <article-body>
            <p>In Diskuto, you don't use a login and password to post or view content. 
                Instead, you <a href="https://en.wikipedia.org/wiki/Digital_signature">cryptographically sign</a> any content
                to claim it as your own. Once signed, servers that host your content will accept it on behalf of you and those
                who wish to see your content.
            </p>
            <p>Eventually, we'll enable signing via a browser plugin. (TODO: But until then, 
                you can use this tool to sign any content you want to post to Diskuto.
            </p>
            <p>Note: Pasting your private key into a web page is insecure! So make
                sure you trust the source before you do so.
            </p>
            <p>TODO: Link to the issue to create a plugin.</p>
        </article-body>
    </article>

    let preview = <></>
    let signer = <></>
    let signError = <></>
    if (hasRequest.value && validSignRequest.value.error) {
        preview = <>
            <article>
                <header><b>Error</b></header>
                <article-body>
                    Error parsing signature request: {validSignRequest.value.message}
                </article-body>
            </article>
        </>
    } else if (hasRequest.value && !validSignRequest.value.error) {
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

        signer = <>
            <article>
                <header><b>Sign?</b></header>
                <article-body>
                    <p>If the above looks correct, paste your secret key to generate a signature.</p>
                    <p><input 
                            type="password"
                            placeholder="⚠️ Paste your secret key ⚠️"
                            style="width: 100%"
                            onInput={(e) => { privateKey.value = e.currentTarget.value } }
                        />
                    </p>

                </article-body>
            </article>
        </>

        if (privateKey.value && parsedPrivateKey.value.error) {
            signError = <ErrorBox 
                message={parsedPrivateKey.value.message}
            />
        }
    }

    return <>
        <article>
            <header>Signature Request</header>
            <article-body>
                <textarea 
                    ref={inputRef}
                    placeholder="Paste a JSON signing request here."
                    style="width: 100%; min-height: 3rem;"
                    onInput={(e) => { signRequest.value = e.currentTarget.value; } }
                    spellcheck={false}
                >{signRequest.value}</textarea>
                <button>Paste</button>
            </article-body>
        </article>

        {preview}
        {signer}
        {signError}
        {info}

    </>
}

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

function parseSecretKey(result: ValidateResult, secretKeyString: string): ParseResult {
    try {
        if (result.error) {
            throw new Error(result.message)
        }
        const {request} = result
        const secretKey = PrivateKey.fromBase58(secretKeyString)

        if (secretKey.userID.asBase58 != request.userId.asBase58) {
            throw new Error(`Private key for user ${secretKey.userID.asBase58} does not match signature request for user ${request.userId.asBase58}`)
        }

        return {
            error: false,
            secretKey
        }

    } catch (err) {
        return {
            error: true,
            message: `${err}`
        }
    }
}

function ErrorBox({title, message}: {title?: string, message: string}) {
    title ??= "Error"

    return <article>
        <header><b>{title}</b></header>
        <article-body>
            {message}
        </article-body>
    </article>

}