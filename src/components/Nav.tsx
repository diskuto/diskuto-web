/* @jsxImportSource preact */
/* @jsxRuntime automatic */

import type { ComponentChildren } from "preact";

export type Props = {
    state: NavState
    title: string
}

export type NavState = Home | NotFound | ItemView | Profile | EditProfile | Feed | UserPosts | NewPost | Login



export type UserContext = {
    /** 
     * The user whose content we're viewing. 
     * 
     * For example, if we're viewing a users's feed, profile, or posts, this ID is that user.
     * 
     * Base58-encoded UserID.
     */
    userId: string
}

export type LoggedInContext = {
    /**
     * IF the user is "logged in" (i.e.: has requested a view tailored for a particular user ID) this is that ID.
     * 
     * Base58-encoded UserID.
     */
    viewAs?: string
}

export type Context = UserContext & LoggedInContext


export type Home = LoggedInContext & {
    page: "home"
    firstTs?: number
    lastTs?: number
    userId?: undefined
}

export type NotFound = LoggedInContext &  {
    page: "notFound"
    userId?: undefined
}

/**
 * View a single "Item".  Usually, this will be a "Post", but it could be a comment or a particular profile update.
 */
export type ItemView = Context & {
    page: "item"
    signature: string
}

export type Profile = Context & {
    page: "profile"
}

export type EditProfile = Context & {
    page: "editProfile"
}

/** A users's following feed */
export type Feed = Context & {
    page: "feed"
}

/** Posts made by a user */
export type UserPosts = Context & {
    page: "posts"
}

/** An in-browser editor to create a new post. */
export type NewPost = Context & {
    page: "newPost"
}

/**
 * A page where users can manage their "view as" settings.
 */
export type Login = LoggedInContext & {
    page: "login"
    userId?: undefined
}

export default function Nav({state, title}: Props) {
    const links = []

    links.push(
        <Link href="/home" active={state.page == "home"}>Home</Link>
    )

    // TODO: Change this depending on the type of the item?
    if (state.page == "item") {
        links.push(<Link active={true}>Item</Link>)

        // TODO: Link to detail views of this item?
        // const {userId, signature} = state
        // if (eventId) {
        //     links.push(<a href={`/event/${eventId}/raw`}>Raw Event</a>)
        // }
    }


    const {userId, viewAs, page} = state
    const viewingSelf = userId && viewAs && userId == viewAs

    if (userId) {
        links.push(<Link href={`/u/${userId}/`} active={page == "posts"}>Posts</Link>)
        links.push(<Link href={`/u/${userId}/profile`} active={page=="profile"}>Profile</Link>)        
        links.push(<Link href={`/u/${userId}/feed`} active={page == "feed"}>Feed</Link>)
    }

    if (viewAs) {
        if (!viewingSelf) {
            links.push(<Link href={`/u/${viewAs}/feed`} active={page == "feed"}>My Feed</Link>)
        }
        links.push(<Link href={`/u/${viewAs}/newPost`} active={page == "newPost"}>New Post</Link>)
        links.push(<Link href="/login" active={page == "login"}>Log Out</Link>)
    } else {
        links.push(<Link href="/login" active={page == "login"}>Log In</Link>)
    }   


    return <header>
        <h1>{title}</h1>
        <nav>
            {links}
        </nav>
    </header>
}

function Link({href, active, target, children}: {href?: string, active: boolean, target?: string, children?: ComponentChildren}) {
    const klass = active ? {"class": "active"} : {}
    return <a target={target} href={href} {...klass}>{children}</a>
}


