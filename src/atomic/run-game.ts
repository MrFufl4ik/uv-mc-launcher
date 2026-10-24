import {spawn} from "node:child_process";
import path from "node:path";
import os from "node:os";
import {ConsoleOpts, isDirectoryExists, isEntryExists, isSymlinkExists, makeSymLink} from "../api/misc.js";
import {mkdir} from "node:fs/promises";
import * as MainConfig from "../api/main-config.js";
import {exitWithPause} from "../index.js";
import {getClientPath} from "./client.js";
import {launcherPath} from "./launcher.js";

const mainConfig = await MainConfig.get();

//todo add instance lock file check!
//todo add check for instance.cfg!
export async function runGameEntry() {
    const clientId = mainConfig.run.clientId;
    await makePrismInstance(clientId);
    await runClient(clientId);
}

function getCrossPlatformPrismLauncherBinary(): string{
    if (os.platform() === "linux") return path.join(launcherPath, "PrismLauncher")
    else if (os.platform() === "win32") return path.join(launcherPath, "prismlauncher.exe")
    process.exit(1); // impossible state
}

async function makePrismInstance(clientId: string) {
    console.log("Making prism launcher instance");
    const prismLauncherInstancesPath = path.join(launcherPath, "instances");
    if (!await isDirectoryExists(prismLauncherInstancesPath)) {
        await mkdir(prismLauncherInstancesPath, {recursive: false});
    }
    const localInstancePath = getClientPath(clientId);
    if (!await isDirectoryExists(localInstancePath)) {
        console.log(`${ConsoleOpts.yellow}Files for client: "${clientId}" not found!${ConsoleOpts.reset}`);
        exitWithPause(1);
    }
    const linkedInstancePath = path.join(prismLauncherInstancesPath, clientId);
    if (!await isSymlinkExists(linkedInstancePath)) {
        if (!await isEntryExists(linkedInstancePath)) {
            await makeSymLink(localInstancePath, linkedInstancePath);
        } else {
            console.log(`${ConsoleOpts.yellow}Entry "${clientId}" founded in instances place. Symlink will not be created!${ConsoleOpts.reset}`);
        }
    }
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

async function runClient(clientId: string) {
    console.log("Running game");
    const prismLauncherBin = getCrossPlatformPrismLauncherBinary();
    const child = spawn(prismLauncherBin, ["-l", clientId], {detached: true, stdio: "ignore"});
    child.unref();
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}