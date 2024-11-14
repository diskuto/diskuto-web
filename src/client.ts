import { Client, UserID, Signature } from "@nfnitloop/feoblog-client"
import type { Item, ItemListEntry, Profile } from "@nfnitloop/feoblog-client/types";
import { lazy } from "@nfnitloop/better-iterators";
import { LRUCache } from "lru-cache"


type Args = ConstructorParameters<typeof Client>[0]

export type ItemInfo = {
    item: Item,
    userId: UserID,
    signature: Signature,
}

/** Additional information fetched about an item by {@link CacheClient#getItemPlus} */
export type ItemInfoPlus = ItemInfo & {
    /** Information about the user that posted this Item */
    user: {
        displayName?: string
    }
    /** Information about what we're replying to: */
    replyTo?: {
        userId: UserID,
        signature: Signature,
        user: {
            displayName?: string
        }
    }
}

export type ProfileInfo = {
    item: Item,
    profile: Profile,
    userId: UserID,
    signature: Signature,
}

/** Pagination as requested by the user */
export type PaginationIn = {
    before?: number
    after?: number
    maxCount?: number
}

type UserFeedArgs = PaginationIn & {
    userId: UserID
}

/** Pagination information with which to create navigation links. */
export type PaginationOut = {
    /** If present, there may be newer items which can be fetched with this parameter. */
    after?: number,
    /** If present, there may be older items which can be fetched with this parameter */
    before?: number,
}

export type PaginatedResults = {
    /** Items, always in reverse chronological order. (newest first) */
    items: ItemInfoPlus[],

    pagination: PaginationOut,
}

/**
 * Wraps a {@link Client} and provides caching and some other helpful methods.
 */
export class CacheClient {
    readonly inner: Client

    #itemCache: LRUCache<string, ItemInfo | NotFound>;
    #profileCache: LRUCache<string, ProfileInfo | NotFound>;

    constructor(args: Args) {
        this.inner = new Client(args)
        this.#itemCache = new LRUCache({
            max: 10_000,
            fetchMethod: key => this.#fetchItem(key)
        })
        this.#profileCache = new LRUCache({
            max: 5_000,
            ttl: 5 * 60_000,
            allowStale: true,
            fetchMethod: key => this.#fetchProfile(key)
        })
    }

    async #fetchItem(key: string): Promise<ItemInfo| NotFound> {
        try {
            const parts = key.split("/")
            const userId = UserID.fromString(parts[0])
            const signature = Signature.fromString(parts[1])
            const item = await this.inner.getItem(userId, signature)
            if (item == null) {
                return NOT_FOUND
            }
            return {
                item,
                userId,
                signature
            }
        } catch (cause) {
            console.error("Couldn't fetch item:", cause)
            return NOT_FOUND
        }
    }

    async #fetchProfile(key: string): Promise<ProfileInfo|NotFound> {
        try {
            console.log("Fetching profile:", key)
            const userId = UserID.fromString(key)
            const result = await this.inner.getProfile(userId)
            if (result === null) {
                return NOT_FOUND
            }

            if (result.item.itemType.case != "profile") {
                console.error("Server returned non-profile item for user profile:", userId.asBase58, result.signature.asBase58)
                return NOT_FOUND
            }

            const profile = result.item.itemType.value
            return {
                userId,
                signature: result.signature,
                profile,
                item: result.item,
            }

        } catch (cause) {
            console.error("Couldn't fetch profile:", cause)
            return NOT_FOUND
        }
    }

    /** Get an item from our local cache, or fetch it, based on ItemListEntry */
    async loadEntry(entry: ItemListEntry): Promise<ItemInfo | null> {
        using _timer = new Timer("loadEntry")
        // TODO: UserId might be null in an Entry!
        // TODO: Deprecate loadEntry[Plus] for loadItem[Plus].
        const userId = UserID.fromBytes(entry.userId!.bytes)
        const signature = Signature.fromBytes(entry.signature!.bytes)
        return await this.getItem(userId, signature)
    }

    /** Get an item from our local cache, or fetch it. */
    async getItem(userId: UserID, signature: Signature): Promise<ItemInfo | null> {
        using _timer = new Timer("getItem")
        const key = `${userId}/${signature}`
        const value = await this.#itemCache.fetch(key)

        if (value === NOT_FOUND) {
            return null
        }
        if (typeof value === "undefined") {
            console.warn(`lruCache.fetch() returned undefined for ${key}`)
            return null
        }
        return value
    }

    async getProfile(userId: UserID|undefined): Promise<ProfileInfo|null> {
        using _timer = new Timer("getProfile")
        if (userId === undefined) {
            return null
        }
        const pInfo = await this.#profileCache.fetch(userId.asBase58)
        if (pInfo == NOT_FOUND) {
            return null
        }
        return pInfo ?? null
    }

    /** Get {@link DisplayName} information for a user. */
    async getDisplayName(userId: UserID): Promise<DisplayName> {
        const pInfo = await this.getProfile(userId)
        const displayName = pInfo?.profile.displayName.trim() || ""
        if (displayName.length > 0) {
            return {
                displayName,
                isId: false,
            }
        }

        return {
            displayName: userId.asBase58,
            isId: true,
        }
    }

    async loadEntryPlus(entry: ItemListEntry): Promise<ItemInfoPlus|null> {
        using _timer = new Timer("loadEntryPlus")
        let userId = undefined
        if (entry.userId) {
            userId = UserID.fromBytes(entry.userId.bytes)
        }
        const [iInfo, pInfo] = await Promise.all([
            this.loadEntry(entry),
            this.getProfile(userId)
        ])

        if (iInfo == null) {
            return null
        }
        
        return {
            ...iInfo,
            user: {
                displayName: pInfo?.profile?.displayName
            }
        }
    }

    /** Like {@link getItem}, but also includes user displayName. */
    async getItemPlus(userId: UserID, signature: Signature): Promise<ItemInfoPlus|null> {
        using _timer = new Timer("getItemPlus")
        const [iInfo, pInfo] = await Promise.all([
            this.getItem(userId, signature),
            this.getProfile(userId)
        ])
        if (iInfo === null) {
            return null
        }

        let replyTo = undefined
        if (iInfo.item.itemType.case == "comment") {
            const comment = iInfo.item.itemType.value
            const userId = UserID.fromBytes(comment.replyTo!.userId!.bytes)
            const signature = Signature.fromBytes(comment.replyTo!.signature!.bytes)
            replyTo = {
                userId,
                signature,
                user: {
                    displayName: (await this.getDisplayName(userId)).displayName
                }
            }
        }

        return {
            ...iInfo,
            user: {
                displayName: pInfo?.profile?.displayName
            },
            replyTo,
        }
    }

    async loadHomePage({before, after, maxCount}: PaginationIn): Promise<PaginatedResults> {
        using _timer = new Timer("loadHomePage")
        maxCount ??= 10

        // Always prefer simple reverse-chronological-order:
        // TODO: remove server-side limitation and allow fetching only within a range.
        if (before !== undefined) {
            after = undefined
        }

        const items = await lazy(this.inner.getHomepageItems({before, after}))
            .limit(maxCount)
            .map({
                parallel: 5,
                mapper: e => this.loadEntryPlus(e),  
            })
            .filter(i => i != null)
            .toArray()

        // If we streamed homepage items "after" some date they may be in reverse order:
        if (after !== undefined) {
            items.reverse()
        }

        return {
            items,
            pagination: paginationFor({items, before, after, maxCount})
        }
    }

    async loadUserFeed({before, after, maxCount, userId}: UserFeedArgs): Promise<PaginatedResults> {
        maxCount ??= 30
        if (before !== undefined) {
            after = undefined
        }

        using _timer = new Timer("Fetch user feed")
        const items = await lazy(this.inner.getUserFeedItems(userId, {before, after}))
            .limit(maxCount)
            .map({
                parallel: 5,
                mapper: e => this.loadEntryPlus(e),  
            })
            .filter(i => i != null)
            .toArray()
        
        return {
            items,
            pagination: paginationFor({items, before, after, maxCount})
        }
    }

    async loadUserPosts({before, after, maxCount, userId}: UserFeedArgs): Promise<PaginatedResults> {
        using _timer = new Timer("loadUserPosts")
        maxCount ??= 30
        if (before !== undefined) {
            after = undefined
        }

        const items = await lazy(this.inner.getUserItems(userId, {before, after}))
            .limit(maxCount)
            .map({
                parallel: 5,
                mapper: e => this.loadEntryPlus(e),  
            })
            .filter(i => i != null)
            .toArray()

        return {
            items,
            pagination: paginationFor({items, before, after, maxCount})
        }
    }

    // TODO: loadEntryForUser(user, entry), to get display names as customized by a user.
}

// lru-cache doesn't like null/undefined values:
const NOT_FOUND = Symbol("Not Found")
type NotFound = typeof NOT_FOUND

type PaginationArgs = {
    items: ItemInfo[],
    maxCount: number,
    before?: number,
    after?: number
}

/** Returned by {@link CacheClient#getDisplayName} */
export type DisplayName = {
    /** The display name set in a profile, or the base58 representation of the user ID as a fallback. */
    displayName: string,
    /** Iff true, then displayName is the same as the base58 representation of a user ID. */
    isId: boolean,
}

function paginationFor({items, maxCount, before, after}: PaginationArgs): PaginationOut {
    let olderThan = undefined
    let newerThan = undefined

    if (items.length > 0) {
        if (items.length == maxCount || after) {
            olderThan = Number(items[items.length-1].item.timestampMsUtc)
        }
        if (before || (items.length == maxCount && after)) {
            newerThan = Number(items[0].item.timestampMsUtc)
        }
    } else if (before) {
        newerThan = before - 1
    } else if (after) {
        olderThan = after + 1
    }

    return {
        after: newerThan,
        before: olderThan,
    }
}

class Timer implements Disposable {
    constructor (readonly name: string) {}
    started = Date.now()
    reported = false

    get deltaMs() {
        return Date.now() - this.started
    }

    report() {
        // console.log(this.name, `${this.deltaMs}ms`)
        this.reported = true
    }

    [Symbol.dispose](): void {
        if (!this.reported) {
            this.report()
        }
    }
}