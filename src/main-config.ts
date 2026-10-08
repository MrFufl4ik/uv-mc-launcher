import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import YAML from "yaml";
import {isFileExists} from "./utils.js";

export const gitClientSchema = z.object({
    httpUrl: z.string(),
    branch: z.string(),
    remote: z.string(),
    userName: z.string(),
    authKey: z.string(),
})

export const runSchema = z.object({
    clientId: z.string()
})

export const mainSchema = z.object({
    launcher: z.object({
        tarballUrl: z.string()
    }).default({tarballUrl: "https://github.com/Diegiwg/PrismLauncher-Cracked/releases/download/11.0.3/PrismLauncher-Linux-Qt6-Portable-11.0.3.tar.gz"}),
    clients: z.array(
        z.object({
            id: z.string(),
            displayName: z.string(),
            git: gitClientSchema.optional()
        })
    ).default([{id: "client", displayName: "Default"}]),
    run: runSchema
});

async function createConfig() {
    await writeFile(
        configPath,
        YAML.stringify(mainSchema.parse({})),
        "utf8"
    );
}

const configPath = path.join(process.cwd(), "config.yaml");
if (!await isFileExists(configPath)) await createConfig();

export async function get() {
    return mainSchema.parse(
        YAML.parse(await readFile(configPath, {encoding: "utf8"}))
    );
}

export async function set(data: object){
    await writeFile(configPath, YAML.stringify(mainSchema.parse(data)), {encoding: "utf8"});
}