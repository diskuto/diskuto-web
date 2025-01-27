
import type { JSX } from "preact";

// Just kidding. This doesn't work in JSR because we're (rightly!) not allowed to modify global types:
//
// // Thanks to: https://stackoverflow.com/questions/61015445/using-web-components-within-preact-and-typescript
// // Allow custom tags in JSX:
// declare module "preact" {
//   namespace JSX {
//     interface IntrinsicElements {
//         "article-body": preact.JSX.HTMLAttributes<HTMLElement>,
//         "user-id": preact.JSX.HTMLAttributes<HTMLElement>
//         "private-key": preact.JSX.HTMLAttributes<HTMLElement>
//     }
//   }
// }

// Instead, we'll use an approach detailed here.
// https://stackoverflow.com/questions/73853530/passing-custom-tag-name-via-props-in-react-typescript
// TODO: Where is it documented that you can do this in JSX? I had no idea you could just use a const string this way.

function tag(name: string) {
    return name as keyof JSX.IntrinsicElements
}

export const ArticleBody = tag("article-body")
export const UserIdTag = tag("user-id")
export const PrivateKeyTag = tag("private-key")

