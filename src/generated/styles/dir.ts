import {E} from "jsr:@nfnitloop/deno-embedder@1.4.9/embed.ts"

export default E({
  "style.css": () => import("./_style.css.ts"),
})
