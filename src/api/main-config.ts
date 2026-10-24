import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import YAML from "yaml";
import {ConsoleOpts, isFileExists} from "./misc.js";
import {exitWithPause} from "../index.js";

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
        linux: z.object({
            launcherArchive: z.string()
        }),
        win32: z.object({
            launcherArchive: z.string(),
            mingitArchive: z.string()
        }),
    }),
    account: z.object({
        name: z.string(),
        id: z.string().optional()
    }),
    clients: z.array(
        ClientSchema
    ),
    run: z.object({
        clientId: z.string()
    })
});

const configPath = path.join(process.cwd(), "config.yaml");
if (!await isFileExists(configPath)){
    console.log(`${ConsoleOpts.yellow}Please create a config.yaml file!${ConsoleOpts.reset}`)
    exitWithPause(1);
}

export async function get() {
    return MainSchema.parse(
        YAML.parse(await readFile(configPath, {encoding: "utf8"}))
    );
}

export async function set(data: object) {
    await writeFile(configPath, YAML.stringify(MainSchema.parse(data)), {encoding: "utf8"});
}