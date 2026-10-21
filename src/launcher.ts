import {cp, mkdir, rm, rmdir} from "node:fs/promises";
import path from "node:path";
import {
    asyncRetryWrapper,
    cleanDirectory,
    ConsoleOpts,
    isDirectoryEmpty,
    isDirectoryExists,
    isFileExists
} from "./utils/misc.js";
import {extractArchive, isValidArchive} from "./utils/archive.js";
import {SMSimpleVar, StateMachine} from "./statemachine.js";
import {getTempPath} from "./temp.js";
import * as MainConfig from "./main-config.js";
import {downloadFile} from "./utils/response.js";

const mainConfig = await MainConfig.get();

export let launcherConfig = {
    path: path.join(process.cwd(), "launcher"),
    archiveUrl: new URL(mainConfig.urls.launcherArchive),
    defaultConfigsPath: path.join(process.cwd(), "default-launcher-configs")
};

const launcherStateMachine = new StateMachine("launcher");

const enum LauncherState {
    creatingDir = "creating dir",
    archiveDownloading = "archive downloading",
    archiveExtracting = "archive extracting",
    defaultConfigsInstalling = "default configs installing",
    cleanup = "cleanup",
    fullyInstalled = "fully installed"
}

export async function launcherEntry() {
    await installLauncher();
}

function isNetworkError(error: Error): boolean {
    const NetworkErrors = [
        "UND_ERR_CONNECT_TIMEOUT",
        "ENOTFOUND"
    ];
    if ("code" in error && typeof error.code === "string") {
        return (
            NetworkErrors.includes(error.code)
        );
    } else if ("cause" in error && error.cause instanceof Error) {
        const cause = error.cause as Error & { code?: string };
        if (typeof cause.code === "string") {
            return (
                NetworkErrors.includes(cause.code)
            );
        }
    }

    return false;
}

async function installLauncher() {
    const smLauncherStatus = new SMSimpleVar<string>(launcherStateMachine, "status", LauncherState.creatingDir);
    const smLauncherArchivePath = new SMSimpleVar<string>(launcherStateMachine, "archiveFileName", "");

    const launcherPath = launcherConfig.path;
    if (!await isDirectoryExists(launcherPath)) {
        await smLauncherStatus.resetValue();
    } else if (await smLauncherStatus.readValue() === LauncherState.fullyInstalled) {
        console.log("Launcher already installed. Skipping...");
        return;
    }

    console.log("Installing launcher");

    while (true) {
        if (await smLauncherStatus.readValue() === LauncherState.creatingDir) {
            //cleanup
            if (await isDirectoryExists(launcherPath)) {
                await rmdir(launcherPath);
            }
            await mkdir(launcherPath, {recursive: false});
            await smLauncherStatus.writeValue(LauncherState.archiveDownloading);
        }
        if (await smLauncherStatus.readValue() === LauncherState.archiveDownloading) {
            const launcherArchiveURL: URL = new URL(launcherConfig.archiveUrl);
            const launcherArchivePath = await asyncRetryWrapper<string>(
                () => downloadFile(launcherArchiveURL, getTempPath()),
                {shouldRetryError: isNetworkError}
            );
            await smLauncherArchivePath.writeValue(launcherArchivePath);
            await smLauncherStatus.writeValue(LauncherState.archiveExtracting);
        }
        if (await smLauncherStatus.readValue() === LauncherState.archiveExtracting) {
            //validating
            const launcherArchivePath = await smLauncherArchivePath.readValue();
            if (
                launcherArchivePath == smLauncherArchivePath.defaultValue ||
                !await isValidArchive(launcherArchivePath)
            ) {
                await smLauncherStatus.writeValue(LauncherState.archiveDownloading);
                continue;
            }
            //cleanup
            if (!await isDirectoryEmpty(launcherPath)) {
                await cleanDirectory(launcherPath);
            }
            await extractArchive(launcherArchivePath, launcherPath);
            await smLauncherStatus.writeValue(LauncherState.defaultConfigsInstalling);
        }
        if (await smLauncherStatus.readValue() === LauncherState.defaultConfigsInstalling) {
            console.log("Installing default configs");
            await cp(
                launcherConfig.defaultConfigsPath, launcherConfig.path,
                {recursive: true, force: true}
            );
            console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
            await smLauncherStatus.writeValue(LauncherState.cleanup);
        }
        if (await smLauncherStatus.readValue() == LauncherState.cleanup) {
            console.log("Cleanup");
            const launcherArchivePath = await smLauncherArchivePath.readValue();
            if (launcherArchivePath != smLauncherArchivePath.defaultValue) {
                await rm(launcherArchivePath, {recursive: false, force: true});
            }
            await smLauncherStatus.writeValue(LauncherState.fullyInstalled);
            await smLauncherArchivePath.resetValue();
            break;
        }
    }
}