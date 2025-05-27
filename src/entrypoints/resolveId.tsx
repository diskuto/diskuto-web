/* @jsxImportSource preact */
/* @jsxRuntime automatic */

import { Client, type ProfileResult, UserID } from "@diskuto/client";
import { render } from "preact";
import { useSignal } from "../signals.ts";
import { Box } from "../components/Box.tsx";
import { useEffect } from "preact/hooks";
import { type } from "arktype"

import * as toml from "@std/toml"

export function mountAt(id: string) {
    const el = document.getElementById(id)
    if (!el) {
        console.error("Could not find element", id)
        return
    }

    const pat = /^[/]@(?<user>[^/@]+)@(?<host>[^/@]+)[/]?$/
    const match = pat.exec(document.location.pathname)
    if (!match) {
        render(<Box title="Error">Invalid path: <code>{document.location.pathname}</code></Box>, el)
        return
    }
    const {user, host} = match.groups!

    render(<ResolveId user={user} host={host}/>, el)
}

function ResolveId({user, host}: {user: string, host: string}) {
    const fullId = `@${user}@${host}`
    const errors = useSignal<string[]>([])
    const status = useSignal("")
    const resolved = useSignal<ResolveData|null>(null)
    
    useEffect(() => {
        const fn = async () => {
            try {
                const result = await resolveWellKnownId({
                    user,
                    host,
                    setStatus: (s) => status.value = s,
                })
                if (result.isError) {
                    errors.value = [ `Can not resolve ID: ${fullId}`, result.error ]
                    return
                }
                
                resolved.value = result.value
            } catch (err) {
                errors.value = [ `${err}` ]
            }
        }
        
        fn()    
    }, [])

    let errorInfo = undefined
    let idInfo = undefined

    if (errors.value.length > 0) {
        errorInfo = <div>
            <h1>Error</h1>
            {errors.value.map((err, key) => <p key={key}>{err}</p>)}
        </div>
    } else if (resolved.value) {
        const {uid, profile, serverUrl} = resolved.value
        const profileUrl = serverUrl.replace(/[/]+$/, "") + `/u/${uid.asBase58}/profile`
        idInfo = <div>
            <p>Resolved:</p>
            <table>
                <tr>
                    <th>Username:</th>
                    <td><code>{fullId}</code></td>
                </tr>
                <tr>
                    <th>ID:</th>
                    <td><code>{uid.asBase58}</code></td>
                </tr>
                <tr>
                    <th>Profile Signature:</th>
                    <td><code>{profile.signature.asBase58}</code></td>
                </tr>
                 <tr>
                    <th>Profile:</th>
                    <td><code><a href={profileUrl}>{profileUrl}</a></code></td>
                </tr>
            </table>
        </div>
    } else {
        idInfo = <div>
            <p>Resolving username: <code>{fullId}</code> ...</p>
            <p>{status.value}</p>
        </div>
    }

    return <Box title="User ID Lookup">
        {errorInfo}
        {idInfo}
    </Box>
}

type ResolveIdArgs = {
    user: string
    host: string

    /** Allows setting status messages as the function progresses. */
    setStatus: (status: string) => void;
}

type ResolveData = {
    uid: UserID,
    profile: ProfileResult,
    /**
     * The first server URL that successfully returned a profile.
     */
    serverUrl: string
}

async function resolveWellKnownId(args: ResolveIdArgs): Promise<Result<ResolveData>> {
    const {user, host, setStatus} = args

    const url = `https://${host}/.well-known/diskuto/${user}/id.toml`
    setStatus(`Fetching: ${url}`)
    let response;
    try {
        response = await fetch(url)
    } catch (cause) {
        if (cause instanceof TypeError) {
            return Result.err(`Error fetching ${url} – This is usually the result of the server not setting proper CORS headers. – ${cause}`)
        }
        return Result.err(`Error fetching ${url} – ${cause}`)
    }
    if (response.status == 404 ) {
        return Result.err(`HTTP 404 (Not Found) from server for URL: ${url}`)
    }
    if (response.status != 200) {
        return Result.err(`HTTP ${response.status}: ${response.statusText}`)
    }

    // Avoid large/empty responses. Requires a content-length be set.
    const lengthText = response.headers.get("content-length")
    if (!lengthText) {
        return Result.err(`HTTP response is missing a Content-Length header`)
    }
    const length = Number.parseInt(lengthText)
    if (length < 0 || length > 32_000) {
        return Result.err(`Invalid Content-Length: ${length}`)
    }

    const text = await response.text();
    let parts
    try {
        const data = toml.parse(text)
        parts = TomlFile.assert(data)
    } catch (cause) {
        return Result.err(`Error parsing TOML: ${cause}`)
    }
    const {id, bootstrap} = parts

    let uid
    try {
        uid = UserID.fromString(id)
    } catch (cause) {
        return Result.err(`Invalid UserID: ${id} - ${cause}`)
    }

    // Public IDs are invalid unless they point to a valid API server.
    setStatus(`Loading profile from bootstrap server`)

    const {servers} = bootstrap
    let found = undefined
    const failures: unknown[] = []
    for (const server of servers) {
        const client = new Client({baseUrl: server})
        const result = await Result.try(client.getProfile(uid))
        if (result.isError) {
            failures.push(result.error)
            continue
        }
        const profile = result.value
        if (!profile) {
            failures.push(`No profile on server ${server}`)
            continue
        }
        found = {
            profile,
            serverUrl: server
        }
        break
    }

    if (!found) {
        return Result.err(`Could not load a profile from this user from any server listed at ${url}`)
    }

    // TODO: Confirm that that user lists this ID as one of their own.
    // (Requires updating the protobuf definitions.)

    const {profile, serverUrl} = found

    return Result.ok({uid, profile, serverUrl})
}

type Result<OkValue, ErrValue = string> = {
    isError: true
    error: ErrValue
} | {
    isError: false
    value: OkValue
}

const Result = {
    ok<T>(value: T) { return {isError: false, value} as const },
    err<T>(error: T) { return { isError: true, error} as const },
    async try<T>(promise: Promise<T>): Promise<Result<T, unknown>> {
        try {
            return Result.ok(await promise)
        } catch (cause) {
            return Result.err(cause)
        }
    }
} as const

type TomlFile = typeof TomlFile.infer
const TomlFile = type({
    id: "string",
    bootstrap: type({
        servers: "(string)[] >= 1"
    })
})

