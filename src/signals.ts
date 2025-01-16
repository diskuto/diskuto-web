/**
 * Workaround for <https://github.com/denoland/vscode_deno/issues/1205>
 * 
 * @module
 */

import * as preact from "@preact/signals"
import * as core from "npm:@preact/signals-core"

// export type Signal<T> = {
//     value: T
//     peek(): T
// }

// export type ROSignal<T> = {
//     readonly value: T
//     peek(): T
// }

export type Signal<T> = core.Signal<T>
export type ReadOnlySignal<T> = core.ReadonlySignal<T>

export function useSignal<T>(t: T): Signal<T> {
    return preact.useSignal(t)
}

export function useComputed<T>(cb: () => T): ReadOnlySignal<T> {
    return preact.useComputed(cb)
}

export const signal = core.signal
export const computed = core.computed