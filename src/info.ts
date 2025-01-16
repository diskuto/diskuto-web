import {z} from "zod"

export const InfoPath = "/diskuto-web/info"

/**
 * Metadata exposed by a DiskutoWeb server.
 */
export type DiskutoWebInfo = z.infer<typeof DiskutoWebInfo>
export const DiskutoWebInfo = z.object({
    apiUrl: z.string().url()
        .describe("The URL at which the Diskuto API server is available."),
})

export async function getWebInfo(): Promise<DiskutoWebInfo> {
    const response = await fetch(InfoPath)
    const json = await response.json()
    return DiskutoWebInfo.parse(json)
}
