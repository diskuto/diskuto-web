/**
 * Common form elements.
 * @module
 */

import { useEffect, useRef } from "preact/hooks";
import { Signal } from "../signals.ts";
import { type JSX } from "preact";

export function Input(props: InputProps) {
    const {value, type: inputType, placeholder, initialFocus, disabled, selectAll} = props

    const ref = useRef<HTMLInputElement>(null)
    useEffect(() => {
        if (initialFocus) {
            ref.current?.focus()
        }
    }, [initialFocus])

    let onFocus: JSX.FocusEventHandler<HTMLInputElement>|undefined = undefined
    if (selectAll) {
        onFocus = (e) => {
            const target = e.currentTarget
            target.select()
        }
    }

    return <input
        ref={ref}
        type={inputType} 
        value={value} 
        onInput={(e) => value.value = e.currentTarget.value}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={onFocus}
    />
}

export type InputProps = {
    value: Signal<string>
    type: "text"|"password"
    placeholder?: string
    initialFocus?: boolean
    disabled?: boolean
    selectAll?: boolean
}

export function TextArea(props: TextAreaProps) {
    const {value, placeholder, initialFocus} = props
    const ref = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (initialFocus) {
            ref.current?.focus()
        }
    }, [initialFocus])

    return <textarea
        ref={ref}
        placeholder={placeholder}
        onInput={(e) => value.value = e.currentTarget.value}
    >{value}</textarea>
}

export type TextAreaProps = {
    value: Signal<string>
    placeholder?: string
    initialFocus?: boolean
}