#!/usr/bin/env -S deno run -A

import * as embedder from "@nfnitloop/deno-embedder"
import { ESBuild } from "@nfnitloop/deno-embedder/plugins/esbuild"

import { sassPlugin } from "npm:esbuild-sass-plugin@3.3.0"


export const options = {
    importMeta: import.meta,

    mappings: [
        {
            sourceDir: "embed-src/static",
            destDir: "src/generated/static"
        },
        {
            sourceDir: "embed-src/styles",
            destDir: "src/generated/styles",
            plugin: new ESBuild({
                entryPoints: ["style.scss"],
                plugins: [
                    sassPlugin()
                ],
                // Work around: https://github.com/NfNitLoop/deno-embedder/issues/10
                bundleRemoteSources: false,
            })
        }
    ]
}

if (import.meta.main) {
    await embedder.main({options})
}