import { render } from "preact"
import Nav from "../components/Nav.tsx";
import { useComputed, useSignal } from "@preact/signals";
import { getLogin, logOut, setLogin } from "../cookies.ts";
import { UserID } from "@nfnitloop/feoblog-client";

export function mountAt(id: string) {
    const el = document.getElementById(id)
    if (!el) {
        console.error("Could not find element", id)
        return
    }
    render(<LoginPage/>, el)
}

function LoginPage() {
    const viewAs = useSignal(getLogin())
    const form = useSignal("")
    const emptyId = useComputed(() => form.value.trim().length == 0)
    const validatedId = useComputed(() => validateUserId(form.value))
    const validId = useComputed(() => validatedId.value.userId)

    let errors = <></>
    if (!emptyId.value && validatedId.value.error) {
        errors = <p>Error: {validatedId.value.error}</p>
    }

    const buttonPressed = () => {
        const userId = validatedId.value.userId
        if (userId) {
            setLogin(userId.asBase58)
            viewAs.value = getLogin()
        }
    }

    const logOutClicked = () => {
        logOut()
        viewAs.value = getLogin()
        form.value = ""
    }

    let body;
    if (!viewAs.value) {
        body = <article-body>
            <p>This pseudo-"log in" allows you to browse content with a view tailored to you.</p>
            <p>Note, you <b>do not</b> provide your password! You are free to browse as any known user.</p>
            <input
                style="width: 50%"
                type="text"
                placeholder="User ID"
                value={form.value}
                onInput={(e) => form.value = e.currentTarget.value}
            />
            <button disabled={!validId.value} onClick={buttonPressed}>Log In</button>
            {errors}
        </article-body>
    } else {
        body = <article-body>
            <p>Logged in as {viewAs.value?.asBase58}</p>
            <button onClick={logOutClicked}>Log Out</button>
        </article-body>
    }

    return <>
        <Nav title="Log In" state={{page: "login", viewAs: viewAs.value?.asBase58}}/>
        <main>
            <article>
                <header>Log In</header>
                {body}
            </article>
        </main>
    </>
}

function validateUserId(id: string) {
    let userId = null
    let error = null
    try {
        userId = UserID.fromString(id)
    } catch (e) {
        error = `${e}`
        error = error.replace(/^Error: /, "")
    }

    return {userId, error}
}