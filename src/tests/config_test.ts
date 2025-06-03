import { assert } from "node:console";
import { Config } from "../config.ts";
import {assertThrows, assertStringIncludes, assertEquals} from "@std/assert"

const config = {
    extraKey: "42"
}

Deno.test("extra key error", async () => {
    const error = await assertThrows(() => Config.assert(config), "blah")
    assertThat(error instanceof Error)
    // Any way to reword this error?
    assertStringIncludes(error.message, "extraKey must be removed")    
})


function assertThat<T extends boolean>(condition: T): asserts condition {
    assert(condition)
}