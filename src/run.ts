import {spawn} from "node:child_process";
import path from "node:path";
import {launcherConfig} from "./launcher.js";
import os from "node:os";
import {ConsoleOpts, isDirectoryExists, makeSymLink} from "./api/misc.js";
import {mkdir} from "node:fs/promises";
import * as MainConfig from "./api/main-config.js";
import {exitWithPause} from "./index.js";

const mainConfig = await MainConfig.get();

//todo add instance lock file check!
export async function gameEntry() {
    const clientId = mainConfig.run.clientId;
    await makePrismInstance(clientId);
    await runClient(clientId);
}

async function makePrismInstance(clientId: string) {
    console.log("Making instance");
    const prismLauncherInstancesPath = path.join(launcherConfig.path, "instances");
    if (!await isDirectoryExists(prismLauncherInstancesPath)) {
        await mkdir(prismLauncherInstancesPath, {recursive: false});
    }
    const localInstancePath = path.join(process.cwd(), clientId);
    if (!await isDirectoryExists(localInstancePath)){
        console.log(`Files for client: "${clientId}" not found!`)
        exitWithPause(1);
    }
    const linkedInstancePath = path.join(prismLauncherInstancesPath, clientId);
    if (!await isDirectoryExists(linkedInstancePath)) await makeSymLink(localInstancePath, linkedInstancePath);
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

async function runClient(clientId: string) {
    console.log("Running game")
    const isWindows: boolean = os.platform() == "win32";
    const prismLauncherBin = path.join(launcherConfig.path, isWindows ? "prismlauncher.exe" : "PrismLauncher");
    const child = spawn(prismLauncherBin, ["-l", clientId], {detached: true, stdio: "ignore"});
    child.unref();
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}