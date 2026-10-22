import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import YAML from "yaml";
import {isFileExists} from "./misc.js";

export const ClientSchema = z.object({
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

export type ZClientT = z.infer<typeof ClientSchema>;

export const MainSchema = z.object({
    urls: z.object({
        launcherArchive: z.string(),
        mingitWin32Archive: z.string()
    }).default({
        launcherArchive: "https://github.com/Diegiwg/PrismLauncher-Cracked/releases/download/11.0.3/PrismLauncher-Linux-Qt6-Portable-11.0.3.tar.gz",
        mingitWin32Archive: "https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.1/MinGit-2.56.0-64-bit.zip"
    }),
    account: z.object({
        name: z.string(),
        id: z.string().optional()
    }),
    clients: z.array(
        ClientSchema
    ).default([{id: "client", displayName: "Default"}]),
    run: z.object({
        clientId: z.string()
    })
});

async function createConfig() {
    await writeFile(
        configPath,
        YAML.stringify(MainSchema.parse({})),
        "utf8"
    );
}

const configPath = path.join(process.cwd(), "config.yaml");
if (!await isFileExists(configPath)) await createConfig();

export async function get() {
    return MainSchema.parse(
        YAML.parse(await readFile(configPath, {encoding: "utf8"}))
    );
}

export async function set(data: object) {
    await writeFile(configPath, YAML.stringify(MainSchema.parse(data)), {encoding: "utf8"});
}