import { type } from "arktype";

export const InfoPath = "/diskuto-web/info"

/**
 * Metadata exposed by a DiskutoWeb server.
 */
export type DiskutoWebInfo = typeof DiskutoWebInfo.infer
export const DiskutoWebInfo = type({
    apiUrl: type("string.url").describe("The URL at which the Diskuto API server is available."),
})

export async function getWebInfo(): Promise<DiskutoWebInfo> {
    const response = await fetch(InfoPath)
    const json = await response.json()
    return DiskutoWebInfo.assert(json)
}
