/* @jsxImportSource preact */
/* @jsxRuntime automatic */

import { render } from "preact"
import Nav from "../components/Nav.tsx";
import { useComputed, useSignal } from "../signals.ts";
import { getLogin, logOut, setLogin } from "../cookies.ts";
import { PrivateKey, UserID } from "@diskuto/client";
import { Box } from "../components/Box.tsx";
import { ArticleBody, PrivateKeyTag, UserIdTag } from "../components/customTags.tsx";

export function mountAt(id: string) {
    const el = document.getElementById(id)
    if (!el) {
        console.error("Could not find element", id)
        return
    }
    render(<LoginPage/>, el)
}

function LoginPage() {
    const viewAsCookie = useSignal(getLogin())
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
            viewAsCookie.value = getLogin()
        }
    }

    const logOutClicked = () => {
        logOut()
        viewAsCookie.value = getLogin()
        form.value = ""
    }

    const loggedIn = viewAsCookie.value != null

    let body;
    if (!loggedIn) {
        body = <ArticleBody>
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
        </ArticleBody>
    } else {
        body = <ArticleBody>
            <p>Logged in as <UserIdTag>{viewAsCookie.value?.asBase58}</UserIdTag></p>
            <button onClick={logOutClicked}>Log Out</button>
        </ArticleBody>
    }

    return <>
        <Nav title="Log In" state={{page: "login", viewAs: viewAsCookie.value?.asBase58}}/>
        <main>
            <article>
                <header><b>Log In</b></header>
                {body}
            </article>
            { loggedIn ? undefined : <CreateNewId/> }
        </main>
    </>
}

function CreateNewId() {
    const key = useSignal<PrivateKey|null>(null)

    const createKey = () => {
        key.value = PrivateKey.createNew()
    }
    const clearKey = () => {
        key.value = null
    }

    return <Box title="Create ID">
        {!key.value ? undefined : 
            <p><table>
                <tr>
                    <th>UserID:</th>
                    <td><UserIdTag>{key.value.userID.asBase58}</UserIdTag></td>
                </tr>
                <tr>
                    <th>Private Key:</th>
                    <td><PrivateKeyTag>{key.value.asBase58}</PrivateKeyTag></td>
                </tr>
            </table></p>
        }
        <button onClick={createKey}>New</button>{" "}
        {!key.value ? undefined : 
            <button onClick={clearKey}>Clear</button>
        }
        
    </Box>
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