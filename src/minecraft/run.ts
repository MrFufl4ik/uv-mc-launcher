import {spawn} from "node:child_process";
import path from "node:path";
import {launcherConfig} from "../launcher.js";
import os from "node:os";
import {ConsoleOpts, isDirectoryExists, isFileExists} from "../utils/misc.js";
import {mkdir, symlink} from "node:fs/promises";
import * as MainConfig from "../main-config.js";

const mainConfig = await MainConfig.get();

//todo можно добавить что-бы при запуске проходила проверка lock file'а у клиента.
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
    const linkedInstancePath = path.join(prismLauncherInstancesPath, clientId);
    if (!await isFileExists(linkedInstancePath)) await symlink(localInstancePath, linkedInstancePath, "dir");
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