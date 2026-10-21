import {cp, mkdir, rm, rmdir} from "node:fs/promises";
import path from "node:path";
import {
    asyncRetryWrapper,
    cleanDirectory,
    ConsoleOpts,
    isDirectoryEmpty,
    isDirectoryExists,
    isNetworkError
} from "./utils/misc.js";
import {extractArchive, isValidArchive} from "./utils/archive.js";
import {SMSimpleVar, StateMachine} from "./statemachine.js";
import {getTempPath} from "./temp.js";
import * as MainConfig from "./main-config.js";
import {downloadFile} from "./utils/response.js";

const mainConfig = await MainConfig.get();

export const launcherConfig = {
    path: path.join(process.cwd(), "launcher"),
    archiveUrl: new URL(mainConfig.urls.launcherArchive),
    defaultConfigsPath: path.join(process.cwd(), "default-launcher-configs")
};

const launcherStateMachine = new StateMachine("launcher");

export async function launcherEntry() {
    await installLauncher();
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

    const launcherPath = launcherConfig.path;
    if (!await isDirectoryExists(launcherPath)) {
        await smStatus.resetValue();
    } else if (await smStatus.readValue() === LauncherState.fullyInstalled) {
        console.log("Launcher already installed. Skipping...");
        return;
    }

    console.log("Installing launcher");

    while (true) {
        if (await smStatus.readValue() === LauncherState.creatingDir) {
            //cleanup
            if (await isDirectoryExists(launcherPath)) {
                await rmdir(launcherPath);
            }
            await mkdir(launcherPath, {recursive: false});
            await smStatus.writeValue(LauncherState.archiveDownloading);
        }
        if (await smStatus.readValue() === LauncherState.archiveDownloading) {
            const launcherArchiveURL: URL = new URL(launcherConfig.archiveUrl);
            const launcherArchivePath = await asyncRetryWrapper<string>(
                () => downloadFile(launcherArchiveURL, getTempPath()),
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
                launcherConfig.defaultConfigsPath, launcherConfig.path,
                {recursive: true, force: true}
            );
            console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
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
            break;
        }
    }
}