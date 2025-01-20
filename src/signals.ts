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

export const useSignalEffect = preact.useSignalEffect

/**
 * Return a signal that loads its data asynchronously.
 * 
 * The signal will be `undefined` until the load finishes.
 * 
 * Note: make sure to read all signals before your callback's first `await` to register them as dependencies.
 */
export function useLoader<T>(cb: () => Promise<T>): Signal<T|undefined> {
    const output = useSignal<T|undefined>(undefined)
    useSignalEffect(() => {
        cb()
        .then(v => output.value = v)
        .catch(e => {
            console.warn(e)
            output.value = undefined
        })
    })

    return output
}

/**
 * Like {@link useLoader}, but instead returns a signal that can show the progress of the load.
 */
export function useProgressLoader<T>(cb: () => Promise<T>): Signal<LoadingProgress<T>> {
    const output = useSignal<LoadingProgress<T>>({status: "loading"})
    useSignalEffect(() => {
        cb()
        .then(v => output.value = {status: "ok", result: v})
        .catch(e => {
            output.value = {status: "error", thrownError: e}
        })
    })

    return output
}

type LoadingProgress<T> = {
    status: "loading" | "ok" | "error"
    thrownError?: unknown
    result?: T
}


/**
 * Like useSignal, but always gets updated with the value passed in as a prop.
 * 
 * Use to safely convert a prop into a signal.
 */
export function useUpdateSignal<T>(value: T) {
    const signal = useSignal(value)
    signal.value = value
    return signal
}