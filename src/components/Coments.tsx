import type { ItemInfoPlus } from "../client.ts";
import Item from "./Item.tsx";

/**
 * The comments box at the bottom of the post/item page.
 */
export function Comments({comments}: Props) {
    // TODO: Show a comment box if you're "logged in".

    return <>
        {comments.map(c => <Item item={c}/>)}
    </>
}

type Props = {
    comments: ItemInfoPlus[]
}