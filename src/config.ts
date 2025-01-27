import * as z from "zod"
import * as toml from "@std/toml"



export type API = z.infer<typeof API>
export const API = z.object({
    url: z.string().url().startsWith("http"), // or https.
    internalUrl: z.string().url().startsWith("http").optional()
})
.describe("Information about the API we'll connect to to find content")
.strict()

export type Server = z.infer<typeof Server>
export const Server = z.object({
    port: z.number().positive().int()
})
.describe("How we should run the local web UI server")
.strict()


export type Config = z.infer<typeof Config>
export const Config = z.object({
    api: API,
    server: Server
}).strict()

export async function loadConfig(filePath: string): Promise<Config> {
    const text = await errorContext(`opening file ${filePath}`, async () => {
        return await Deno.readTextFile(filePath)
    })
    const data = await errorContext(`parsing file ${filePath}`, () => {
        return toml.parse(text)
    })
    return Config.parse(data)
}


// TODO: Don't I have this somewhere to reuse?
async function errorContext<T>(message: string, closure: () => Awaitable<T>): Promise<T> {
    try {
        return await closure()
    } catch (cause: unknown) {
        throw new Error(`Error ${message}`, {cause})
    }
}

type Awaitable<T> = T | PromiseLike<T>
