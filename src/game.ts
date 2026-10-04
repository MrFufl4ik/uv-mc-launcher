import {spawn} from "node:child_process";
import path from "node:path";
import {launcherConfig} from "./launcher.js";
import os from "node:os";
import {ConsoleOpts, isDirectoryExists, isFileExists} from "./utils.js";
import {mkdir, symlink} from "node:fs/promises";

export let gameConfig = {
    clientName: "client"
};

export async function gameEntry() {
    await makeInstance(gameConfig.clientName);
    await runGame(gameConfig.clientName);
}

async function makeInstance(clientName: string) {
    console.log("Making instance");
    const prismLauncherInstancesPath = path.join(launcherConfig.path, "instances");
    if (!await isDirectoryExists(prismLauncherInstancesPath)) {
        await mkdir(prismLauncherInstancesPath, {recursive: false});
    }
    const localInstancePath = path.join(process.cwd(), clientName);
    const linkedInstancePath = path.join(prismLauncherInstancesPath, clientName);
    if (!await isFileExists(linkedInstancePath)) await symlink(localInstancePath, linkedInstancePath, "dir");
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

async function runGame(clientName: string) {
    console.log("Running game")
    const isWindows: boolean = os.platform() == "win32";
    const prismLauncherBin = path.join(launcherConfig.path, isWindows ? "prismlauncher.exe" : "PrismLauncher");
    spawn(prismLauncherBin, ["-l", clientName], {detached: true, stdio: "ignore"});
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}