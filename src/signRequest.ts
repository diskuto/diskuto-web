import { Item, ItemSchema, fromBinary} from "@nfnitloop/feoblog-client/types";
import * as base64 from "@std/encoding/base64"
import { UserID } from "@nfnitloop/feoblog-client";
import {z} from "zod"

/**
 * Utilities for sending/receiving signing requests.
 * 
 * An application can request that a user sign an Item. It will do so by creating a SigningRequest.
 * Either a browser plugin or a separate utility can then read the request, show the user a preview, and allow them to sign it.
 * The result of the signature should be a base58-encoded signature for that content.
 *
 * TODO: Add a version number.
 */


export type SignRequestJson = z.infer<typeof SignRequestJson>
export const SignRequestJson = z.object({
    userId: z.string().min(10)
        .describe("The user ID that the application believes the user intends to sign as."),
    itemBytes: z.string().min(10)
        .describe("base64-encoded bytes of an Item to sign.")
}).strict()


export class SignRequest {
    readonly userId: UserID;
    readonly item: Item;
    readonly itemBytes: Uint8Array;

    private constructor({userId, item, itemBytes}: Args) {
        this.userId = userId
        this.item = item
        this.itemBytes = itemBytes
    }

    /**
     * Given a JSON string, unpack it as a SignRequest.
     * 
     * @throws if the Item is invalid. 
     */
    static fromJson(text: string): SignRequest {
        const json = JSON.parse(text)
        const request = SignRequestJson.parse(json)
        const itemBytes = base64.decodeBase64(request.itemBytes)
        const item = validateItem(itemBytes)
        const userId = UserID.fromString(request.userId)
        return new SignRequest({userId, item, itemBytes})
    }

    static fromBytes({itemBytes, userId}: {itemBytes: Uint8Array, userId: UserID}): SignRequest {
        const item = validateItem(itemBytes)
        return new SignRequest({userId, item, itemBytes})
    }

    toJson(): string {
        const req: SignRequestJson = {
            itemBytes: base64.encodeBase64(this.itemBytes),
            userId: this.userId.asBase58,
        }
        return JSON.stringify(req)
    }
}

type Args = {
    userId: UserID
    itemBytes: Uint8Array
    item: Item
}

function validateItem(bytes: Uint8Array) {
    // TODO: DO some validation here.
    // Ex: It's probably safest to error on unknown fields. Otherwise, apps could inject extra data into things we sign.
    return fromBinary(ItemSchema, bytes)
}
