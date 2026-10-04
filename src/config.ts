import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import YAML from "yaml";
import {isFileExists} from "./utils.js";

const ConfigSchema = z.object({
    launcher: z.object({
        tarballUrl: z.string()
    }).default({tarballUrl: "https://github.com/Diegiwg/PrismLauncher-Cracked/releases/download/11.0.3/PrismLauncher-Linux-Qt6-Portable-11.0.3.tar.gz"}),
    clients: z.array(
        z.object({
            id: z.string(),
            displayName: z.string(),
            git: z.object({
                httpUrl: z.string(),
                branch: z.string(),
                remote: z.string(),
                userName: z.string(),
                authKey: z.string(),
            }).optional()
        })
    ).default([{id: "client", displayName: "Default"}])
});

const configPath = path.join(process.cwd(), "config.yaml");

async function createConfig() {
    await writeFile(
        configPath,
        YAML.stringify(ConfigSchema.parse({})),
        "utf8"
    );
}

async function readConfig() {
    return ConfigSchema.parse(
        YAML.parse(await readFile(configPath, {encoding: "utf8"}))
    );
}

if (!await isFileExists(configPath)) await createConfig();

export const Config = await readConfig();