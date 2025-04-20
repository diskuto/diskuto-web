/* @jsxImportSource preact */
/* @jsxRuntime automatic */

import { Fragment, render } from "preact"
import { useComputed, useLoader, useProgressLoader, useSignal, useUpdateSignal, type Signal } from "../signals.ts"

import Nav from "../components/Nav.tsx";
import { Client, UserID } from "@diskuto/client";
import { create, fromBinary, ItemSchema, toBinary, Profile, ProfileSchema, ServerSchema, FollowSchema} from "@diskuto/client/types";
import Item from "../components/Item.tsx";
import { getLogin } from "../clientCookies.ts";
import { getWebInfo } from "../info.ts";
import { Input, TextArea } from "../components/form.tsx";
import { Signer } from "../components/Signer.tsx";
import { Box } from "../components/Box.tsx";
import { useSignalEffect } from "@preact/signals";

export function mountAt(id: string) {
    const el = document.getElementById(id)
    if (!el) {
        console.error("Could not find element", id)
        return
    }

    const pat = /[/]([^/]+)[/]editProfile$/
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

    render(<EditProfile userId={userId}/>, el)
}

type Props = {
    userId: UserID
}

function EditProfile(props: Props) {
    const userId = useUpdateSignal(props.userId)

    const displayName = useSignal("")
    const profileMarkdown = useSignal("")
    const servers = useSignal<string[]>([])
    const follows = useSignal<FollowInfo[]>([])

    // The bytes that the user will need to sign to post this:
    const itemBytes = useComputed(() => makeItem({
        existingProfile: existingProfile.value.result?.item.itemType.value,
        displayName: displayName.value,
        profileText: profileMarkdown.value,
        servers: servers.value,
        follows: follows.value,
    }))
    const item = useComputed(() => fromBinary(ItemSchema, itemBytes.value))

    const webInfo = useLoader(async () => {
        return await getWebInfo()
    })

    const existingProfile = useProgressLoader(async () => {
        const web = webInfo.value
        if (!web) { return undefined }
        const client = new Client({baseUrl: web.apiUrl})
        return await client.getProfile(userId.value)
    })

    const prefillProfile = (profile: Profile|null) => {
        if (!profile) {
            displayName.value = ""
            profileMarkdown.value = ""
            servers.value = []
            follows.value = []
        } else {
            displayName.value = profile.displayName
            profileMarkdown.value = profile.about
            servers.value = profile.servers.map(s => s.url)
            follows.value = profile.follows.map(f => ({
                name: f.displayName,
                userId: (f.user?.bytes ? UserID.fromBytes(f.user.bytes).asBase58 : null) ?? "Error parsing userID"
            }))
        }
    }

    useSignalEffect(() => {
        const profileLoad = existingProfile.value
        if (profileLoad.status != "loading") {
            prefillProfile(profileLoad.result?.item.itemType.value ?? null)
        }
    })

    const errors = useComputed(() => {
        const errors = []
        const invalidServers = servers.value
            .filter(it => it.trim().length > 0)
            .filter(url => !validUrl(url))
        errors.push(...invalidServers.map(url => `Invalid server URL: ${url}`))

        const invalidIDs = follows.value
            .filter(f => f.userId.trim().length > 0)
            .filter(f => !validUserId(f.userId))
        errors.push(...invalidIDs.map(f => `Invalid userID: ${f.userId}`))

        return errors
    })


    const loading = existingProfile.value.status == "loading"

    if (loading) {
        return <Box title="Loading...">
            <p>Loading existing profile...</p>
        </Box>
    }

    const itemPreview = {
        userId: userId.value,
        item: item.value,
        user: {
            displayName: displayName.value
        }
    } as const    

    const nav = {
        page: "editProfile",
        userId: userId.value.asBase58,
        viewAs: getLogin()?.asBase58
    } as const

    return <>
        <Nav title="Edit Profile" state={nav} />
        <main>
            <Box title="Edit Profile">
                <Input type="text" value={displayName} placeholder="Display Name (optional)"/>
                <br/>
                <TextArea 
                    value={profileMarkdown}
                    placeholder="Tell the world something about yourself. (Markdown)"
                    initialFocus
                />
                <details>
                    <summary>Servers</summary>
                    <p>List servers where you intend to post your content. This lets users (and software!) know where they can go to find your latest posts.</p>
                    <EditServers servers={servers}/>
                </details>
                <details>
                    <summary>Follows</summary>
                    <p>Follow users so that their content shows up in your feed.</p>
                    <EditFollows follows={follows}/>
                </details>
            </Box>

            <h1>Preview:</h1>
            <Item item={itemPreview} main preview/>

            {errors.value.length > 0 
                ? <ErrorBox errors={errors.value}/> 
                : <Signer {...{userId, item, itemBytes}} />
            }

            
        </main>
    </>
}


function makeItem({displayName, profileText, existingProfile, servers, follows}: MakeItemArgs): Uint8Array {
    const now = new Date()

    // Merge in existing protobuf.
    // Note: this will also maintain any unknown fields that we deserialized.
    // See: https://github.com/bufbuild/protobuf-es/blob/main/MANUAL.md#unknown-fields
    // TODO: Some way to clear all unknown fields and start fresh?
    const profile = create(ProfileSchema, existingProfile ?? {})
    profile.displayName = displayName ?? ""
    profile.about = profileText
    profile.servers = servers
        .filter(url => validUrl(url))
        .map(url => create(ServerSchema, {url}))

    profile.follows = follows
        .map(f => ({userId: UserID.tryFromString(f.userId), name: f.name }))
        .filter(f => f.userId != null)
        .map(f => create(FollowSchema, {displayName: f.name, user: {bytes: f.userId!.bytes}}))


    const item = create(ItemSchema, {
        timestampMsUtc: BigInt(now.valueOf()),
        utcOffsetMinutes: -now.getTimezoneOffset(),
        itemType: {
            case: "profile",
            value: profile
        }
    })

    return toBinary(ItemSchema, item)
}

type MakeItemArgs = {
    // Updates are applied to an existing profile, if present:
    existingProfile?: Profile|null

    profileText: string
    displayName: string | undefined
    // follows: unknown

    servers: string[]
    follows: FollowInfo[]
}

function EditServers({servers}: {servers: Signal<string[]>}) {
    // Always keep an empty row for users to type into:
    useSignalEffect(() => {
        const current = servers.value
        const hasBlank = current.length > 0 && current[current.length - 1].trim() == ""
        if (hasBlank) { return }
        servers.value = [
            ...current,
            ""
        ]
    })

    const entries = [...servers.value.entries()]
    const lines = entries.map(([index, value]) => <EditServer servers={servers} server={value} index={index}/>)

    return <>
        {lines}
    </>
}

function EditServer({servers, server, index}: {servers: Signal<string[]>, server: string, index: number}) {
    const setValue = (value: string) => {
        const newValues = [...servers.value]
        newValues[index] = value
        servers.value = newValues
    }

    const isValid = validUrl(server) || server.trim().length == 0
    const style = isValid ? undefined : "border-color: red"

    const key = `server-${index}`
    return <Fragment key={key}>
        <input
            type="text"
            placeholder="Server URL"
            value={server} 
            onInput={e => setValue(e.currentTarget.value)}
            style={style}
        />
    </Fragment>
}

function validUrl(value: string): boolean {
    try {
        const _url = new URL(value)
        return true
    } catch (_) {
        return false
    }
}

function EditFollows({follows}: {follows: Signal<FollowInfo[]>}) {

    // Always keep an empty row so that users can add new entries there:
    useSignalEffect(() => {
        const current = follows.value
        const hasEmptyRow = (
            current.length > 0
            && current[current.length - 1].name.trim() == ""
            && current[current.length - 1].userId.trim() == ""
        )
        if (hasEmptyRow) { return }
        
        follows.value = [
            ...current, 
            {name: "", userId: ""}
        ]
    })

    const entries = [...follows.value.entries()]
    const lines = entries.map(([index, value]) => <EditFollow follows={follows} follow={value} index={index}/>)

    return <table style="width: 100%">
        {lines}
    </table>
}

function EditFollow({follows, follow, index}: {follows: Signal<FollowInfo[]>, follow: FollowInfo, index: number}) {

    const update = (patch: Partial<FollowInfo>) => {
        const newList = [...follows.value]
        newList[index] = {...newList[index], ...patch}
        follows.value = newList
    }

    const idError = follow.userId.trim().length > 0 && !validUserId(follow.userId)

    const key = `follow-${index}`
    return <tr key={key}>
        <td><input
            type="text"
            placeholder="Name"
            value={follow.name} 
            onInput={e => update({name: e.currentTarget.value})}
        /></td>
        <td><input
            type="text"
            placeholder="userID"
            value={follow.userId}
            onInput={e => update({userId: e.currentTarget.value})}
            style={!idError ? undefined : "border-color: red;"}
            spellcheck={false}
        /></td>
    </tr>
}

type FollowInfo = {
    userId: string
    name: string
}

function validUserId(value: string): boolean {
    return UserID.tryFromString(value) != null
}

function ErrorBox({errors}: {errors: string[]}) {
    if (errors.length == 0) {
        return <></>
    }
    return <Box title="Errors">
        <ul>
            {errors.map(err => <li>{err}</li>)}
        </ul>
    </Box>
}