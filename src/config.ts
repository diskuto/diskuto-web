import { type } from "arktype"
import * as toml from "@std/toml"

const HttpUrl = type("string.url").narrow((data, ctx) => {
    return data.startsWith("http") // or https
        ? true
        : ctx.mustBe("an http or https url")
})

export type API = typeof API.infer
export const API = type({
    url:  HttpUrl,
    "internalUrl?": HttpUrl
})
.describe("Information about the API we'll connect to to find content")

export type Server = typeof Server.infer
export const Server = type({
    port: "number.integer > 0"
})
.describe("How we should run the local web UI server")


export type Config = typeof Config.infer
export const Config = type({
    api: API,
    server: Server
}).onDeepUndeclaredKey("reject")

export async function loadConfig(filePath: string): Promise<Config> {
    const text = await errorContext(`opening file ${filePath}`, async () => {
        return await Deno.readTextFile(filePath)
    })
    const data = await errorContext(`parsing file ${filePath}`, () => {
        return toml.parse(text)
    })
    return Config.assert(data)
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
