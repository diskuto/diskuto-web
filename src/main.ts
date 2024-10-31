#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

/**
* A web interface for the Diskuto Decentralized Social Network.
* 
* This is the entrypoint for the web server. You can run it to start the web server.
* You'll need a diskuto-web.toml configuration file (see the sample in this repository),
* and you'll need a Diskuto API server from which to fetch the data.
* 
* The Diskuto API server save/serves the raw data, this web server process
* makes it into a nice UI for users to interact with.
* 
* TODO: Currently the "Diskuto API server" is just the API surface area provided
* by <https://github.com/NfNitLoop/feoblog> pending implementation of
* <https://github.com/NfNitLoop/feoblog/issues/127>.
* 
* 
* 
* @module
*/

import { Command, HelpCommand } from "@cliffy/command";
import { Server } from "./server.tsx";
import { loadConfig } from "./config.ts";

async function main(args: string[]) {
    const cmd = new Command()
        .name("diskuto-web")
        .description("A web server for the Diskuto Decentralized Social Network")

        .default("help")
    
    cmd.command("help", new HelpCommand().global())

    const serve = new Command()
        .name("start")
        .description("Start a long-running server.")
        .option("--config <configPath:string>", "Location of config file to load.", {
            default: "diskuto-web.toml"
        })
        .action(cmdStart)    
    cmd.command(serve.getName(), serve)


    await cmd.parse(args)
}

type CmdStartOptions = {
    config: string
}

async function cmdStart(opts: CmdStartOptions) {
    const config = await loadConfig(opts.config)
    const server = new Server(config)
    await server.run()
}


if (import.meta.main) {
    await main(Deno.args)
}