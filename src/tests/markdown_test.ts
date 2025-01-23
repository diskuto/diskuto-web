import { mdOpenGraphInfo } from "../markdown.ts";
import { assertEquals } from "jsr:@std/assert"



const md = `
Welp, here's some [text].

Here's an image: ![Bob's Icon]

<b>More</b> text.

Code Example
============

\`\`\`typescript
this should get skipped
\`\`\`

<div>
This should get skipped.
</div>

[text]: https://www.google.com
[Bob's Icon]: https://www.google.com/icon.png

`

const expectedText = `
Welp, here's some text.

Here's an image: 

More text.

Code Example

`.trimStart()

Deno.test(function markdownOpenGraph() {
    const ogi = mdOpenGraphInfo(md)

    assertEquals(ogi.plaintext, expectedText)
    assertEquals(1, ogi.images.length)
    const img = ogi.images[0]
    assertEquals(img.url, "https://www.google.com/icon.png")
    assertEquals(img.alt, "Bob's Icon")
    // assertEquals(img.title, "something else")
})