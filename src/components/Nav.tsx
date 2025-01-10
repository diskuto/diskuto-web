import type { ComponentChildren } from "preact";

export type Props = {
    state: NavState
    title: string
}

export type NavState = Home | NotFound | ItemView | Profile | Feed | UserPosts | NewPost

export type Home = {
    page: "home"
    firstTs?: number
    lastTs?: number
}

export type NotFound = {
    page: "notFound"
}

export type ItemView = {
    page: "item"
    userId: string
    signature: string
}

export type Profile = {
    page: "profile"
    userId: string
}

/** A users's following feed */
export type Feed = {
    page: "feed"
    userId: string
}

/** Posts made by a user */
export type UserPosts = {
    page: "posts"
    userId: string
}

/** Place  */
export type NewPost = {
    page: "newPost"
    userId: string
}



export default function Nav({state, title}: Props) {
    const links = []

    links.push(
        <Link href="/home" active={state.page == "home"}>Home</Link>
    )

    // TODO: Change this depending on the type of the item?
    if (state.page == "item") {
        links.push(<Link active={true}>Post</Link>)

        // TODO: Link to detail views of this item?
        // const {userId, signature} = state
        // if (eventId) {
        //     links.push(<a href={`/event/${eventId}/raw`}>Raw Event</a>)
        // }
    }

    let userId = null
    if (state.page == "profile" || state.page == "item" || state.page == "posts" || state.page == "feed" || state.page == "newPost") {
        userId = state.userId
    }

    if (userId) {
        links.push(<Link href={`/u/${userId}/`} active={state.page == "posts"}>Posts</Link>)
        links.push(<Link href={`/u/${userId}/profile`} active={state.page=="profile"}>Profile</Link>)        
        links.push(<Link href={`/u/${userId}/feed`} active={state.page == "feed"}>Feed</Link>)
        links.push(<Link href={`/u/${userId}/newPost`} active={state.page == "newPost"}>New Post</Link>)
    }

    return <header>
        <h1>{title}</h1>
        <nav>
            {links}
        </nav>
    </header>
}

function Link({href, active, children}: {href?: string, active: boolean, children?: ComponentChildren}) {
    const klass = active ? {"class": "active"} : {}
    return <a href={href} {...klass}>{children}</a>
}


