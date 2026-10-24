import {cp, mkdir, rm, rmdir} from "node:fs/promises";
import path from "node:path";
import {
    asyncRetryWrapper,
    cleanDirectory,
    ConsoleOpts,
    isDirectoryEmpty,
    isDirectoryExists,
    isNetworkError
} from "../api/misc.js";
import {extractArchive, isValidArchive} from "../api/archive.js";
import {SMSimpleVar, StateMachine} from "../api/statemachine.js";
import {getTempPath} from "../api/temp.js";
import * as MainConfig from "../api/main-config.js";
import {downloadFile} from "../api/response.js";
import os from "node:os";

const launcherStateMachine = new StateMachine("launcher");
const mainConfig = await MainConfig.get();

export const launcherPath = path.join(process.cwd(), "launcher");
const defaultConfigsPath = path.join(process.cwd(), "default-launcher-configs");

export async function launcherEntry() {
    await installLauncher();
}

function getCrossPlatformLauncherArchiveURL(): URL {
    if (os.platform() === "linux") return new URL(mainConfig.urls.linux.launcherArchive);
    else if (os.platform() === "win32") return new URL(mainConfig.urls.win32.launcherArchive);
    process.exit(1); // impossible state
}

async function installLauncher() {
    const enum LauncherState {
        creatingDir = "creating dir",
        archiveDownloading = "archive downloading",
        archiveExtracting = "archive extracting",
        defaultConfigsInstalling = "default configs installing",
        cleanup = "cleanup",
        fullyInstalled = "fully installed"
    }

    const smStatus = new SMSimpleVar<string>(launcherStateMachine, "status", LauncherState.creatingDir);
    const smLauncherArchivePath = new SMSimpleVar<string>(launcherStateMachine, "archiveFileName", "");

    while (true) {
        //error state's
        if (!await isDirectoryExists(launcherPath)) {
            await smStatus.resetValue();
        }

        if (await smStatus.readValue() === LauncherState.fullyInstalled) break;

        if (await smStatus.readValue() === LauncherState.creatingDir) {
            console.log("Installing launcher");
            //cleanup
            if (await isDirectoryExists(launcherPath)) {
                await rmdir(launcherPath);
            }
            await mkdir(launcherPath, {recursive: false});
            await smStatus.writeValue(LauncherState.archiveDownloading);
        }
        if (await smStatus.readValue() === LauncherState.archiveDownloading) {
            const launcherArchivePath = await asyncRetryWrapper<string>(
                () => downloadFile(getCrossPlatformLauncherArchiveURL(), getTempPath()),
                {shouldRetryError: isNetworkError}
            );
            await smLauncherArchivePath.writeValue(launcherArchivePath);
            await smStatus.writeValue(LauncherState.archiveExtracting);
        }
        if (await smStatus.readValue() === LauncherState.archiveExtracting) {
            //validating
            const launcherArchivePath = await smLauncherArchivePath.readValue();
            if (
                launcherArchivePath == smLauncherArchivePath.defaultValue ||
                !await isValidArchive(launcherArchivePath)
            ) {
                await smStatus.writeValue(LauncherState.archiveDownloading);
                continue;
            }
            //cleanup
            if (!await isDirectoryEmpty(launcherPath)) {
                await cleanDirectory(launcherPath);
            }
            await extractArchive(launcherArchivePath, launcherPath);
            await smStatus.writeValue(LauncherState.defaultConfigsInstalling);
        }
        if (await smStatus.readValue() === LauncherState.defaultConfigsInstalling) {
            console.log("Installing default configs");
            await cp(
                defaultConfigsPath, launcherPath,
                {recursive: true, force: true}
            );
            await smStatus.writeValue(LauncherState.cleanup);
        }
        if (await smStatus.readValue() == LauncherState.cleanup) {
            console.log("Cleanup");
            const launcherArchivePath = await smLauncherArchivePath.readValue();
            if (launcherArchivePath != smLauncherArchivePath.defaultValue) {
                await rm(launcherArchivePath, {recursive: false, force: true});
            }
            await smStatus.writeValue(LauncherState.fullyInstalled);
            await smLauncherArchivePath.resetValue();
            console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
            break;
        }
    }
}