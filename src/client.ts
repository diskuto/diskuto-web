import { Client, UserID, Signature } from "@nfnitloop/feoblog-client"
import type { Item, ItemListEntry, Profile } from "@nfnitloop/feoblog-client/types";
import { LRUCache } from "lru-cache"


type Args = ConstructorParameters<typeof Client>[0]

export type ItemInfo = {
    item: Item,
    userId: UserID,
    signature: Signature,
}

export type ItemInfoPlus = ItemInfo & {
    user: {
        displayName?: string
    }
}

export type ProfileInfo = {
    item: Item,
    profile: Profile,
    userId: UserID,
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
            const item = await this.inner.getProfile(userId)
            if (item === null) {
                return NOT_FOUND
            }

            if (item.item.itemType.case != "profile") {
                console.error("Server returned non-profile item for user profile:", userId.asBase58, item.signature.asBase58)
                return NOT_FOUND
            }

            const profile = item.item.itemType.value
            return {
                userId,
                profile,
                item: item.item,
            }

        } catch (cause) {
            console.error("Couldn't fetch profile:", cause)
            return NOT_FOUND
        }
    }

    /** Get an item from our local cache, or fetch it, based on ItemListEntry */
    async loadEntry(entry: ItemListEntry): Promise<ItemInfo | null> {
        const userId = UserID.fromBytes(entry.userId!.bytes)
        const signature = Signature.fromBytes(entry.signature!.bytes)
        const key = `${userId}/${signature}`
        const value = await this.#itemCache.fetch(key)
        if (value === NOT_FOUND) {
            return null
        }
        if (typeof value === "undefined") {
            console.warn(`lruCache.fetch() returned undefined for ${userId}/${signature}`)
            return null
        }
        return value
    }

    async getProfile(userId: UserID|undefined): Promise<ProfileInfo|null> {
        if (userId === undefined) {
            return null
        }
        const pInfo = await this.#profileCache.fetch(userId.asBase58)
        if (pInfo == NOT_FOUND) {
            return null
        }
        return pInfo ?? null
    }

    async loadEntryPlus(entry: ItemListEntry): Promise<ItemInfoPlus|null> {
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

    // TODO: loadEntryForUser(user, entry), to get display names as customized by a user.
}

// lru-cache doesn't like null/undefined values:
const NOT_FOUND = Symbol("Not Found")
type NotFound = typeof NOT_FOUND
