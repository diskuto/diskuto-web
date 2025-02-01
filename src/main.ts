#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env


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