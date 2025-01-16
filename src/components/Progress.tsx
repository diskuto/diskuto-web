import { useMemo } from "preact/hooks";
import { computed, ReadOnlySignal, signal } from "../signals.ts";

/**
 * Displays progress details in a box on screen.
 */
export function ProgressBox({progress, showBeforeStart}: Props) {
    if (!progress.hasStarted.value && !showBeforeStart) {
        return <></>
    }

    return <article>
        <header><b>{progress.title}</b></header>
        <article-body>
            <ul>
                {progress.messages.value.map(it => <MessageLine message={it}/>)}
            </ul>
        </article-body>
    </article>
}

function MessageLine({message}: {message: Message}) {
    const prefix = (
        message.inProgress ? "… " 
        : message.error ? "❌ "
        : "✅ "
    )

    let error = undefined
    if (message.error) {
        error = <>
            <br/>
            <b>Error:</b>{" "}{message.error}
        </>
    }

    return <li>{prefix} {message.text}{error}</li>
}

export type Props = {
    progress: Progress
    showBeforeStart?: boolean
}

/**
 * State to be displayed by ProgressBox.
 */
export class Progress {

    readonly messages = signal<Message[]>([])

    readonly hasStarted = signal(false)
    readonly hasFinished = signal(false)
    readonly hasError = signal(false)
    readonly inProgress: ReadOnlySignal<boolean>

    /** Construct with {@link useProgress}. */
    constructor(readonly title: string) {
        this.inProgress = computed(() => this.hasStarted && !this.hasFinished)
    }

    #addMessage(msg: Message) {
        this.messages.value = [...this.messages.value, msg]
    }

    // Updates the messages Signal to force a re-render.
    #rerender() {
        this.messages.value = [...this.messages.value]
    }

    log(text: string) {
        this.#addMessage({text})
    }

    /**
     * Call to run a single task.
     * 
     * Shows that a task is in progress. Marks the task with an error if it throws.
     */
    async task<T>(text: string, cb: Callback<T>): Promise<T> {
        const msg: Message = {text, inProgress: true}
        this.#addMessage(msg)
        try {
            return await cb()
        } catch (e) {
            msg.error = `${e}`
            throw e
        } finally {
            msg.inProgress = false
            this.#rerender()
        }
    }

    /**
     * 
     * @param cb 
     */
    async run(cb: Callback<unknown>): Promise<void> {
        this.reset()

        this.hasStarted.value = true
        try {
            await cb()
        } catch (e) {
            // We assume this was already logged in a task().
            console.log(e)
            this.hasError.value = true
        } finally {
            this.hasFinished.value = true
        }
    }

    reset() {
        if (this.inProgress.value) {
            throw new Error("Can't reset progress while operation is in progress")
        }
        this.messages.value = []
        this.hasStarted.value = false
        this.hasFinished.value = false
        this.hasError.value = false
    }
}

export type Message = {
    text: string
    inProgress?: boolean
    error?: string
}

export function useProgress(title: string) {
    return useMemo(() => new Progress(title), [])
}

type Callback<T> = () => Awaitable<T>
type Awaitable<T> = T | PromiseLike<T>