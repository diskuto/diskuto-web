#!/usr/bin/env -S deno run -A

import * as embedder from "@nfnitloop/deno-embedder"
import { ESBuild } from "@nfnitloop/deno-embedder/plugins/esbuild"
import { sassPlugin } from "npm:esbuild-sass-plugin@3.3.0"

const entrypointsDir = "src/entrypoints"
const entrypoints = [
    ...Deno.readDirSync(entrypointsDir)
        .filter(it => it.isFile)
        .filter(it => it.name.match(/[.]tsx?$/))
        .map(it => `entrypoints/${it.name}`)
    ]

export const options = {
    importMeta: import.meta,

    mappings: [
        {
            sourceDir: "embed-src/static",
            destDir: "generated/static",
        },
        {
            sourceDir: "embed-src/styles",
            destDir: "generated/styles",
            plugin: new ESBuild({
                entryPoints: ["style.scss"],
                plugins: [
                    // @ts-expect-error: workaround for: https://github.com/glromeo/esbuild-sass-plugin/issues/191
                    sassPlugin()
                ],
                // Work around: https://github.com/NfNitLoop/deno-embedder/issues/10
                bundleRemoteSources: false,
            })
        },
        {
            sourceDir: "src",
            destDir: "generated/js",
            plugin: new ESBuild({
                entryPoints: entrypoints
            })
        }
    ]
}

if (import.meta.main) {
    await embedder.main({options})
}