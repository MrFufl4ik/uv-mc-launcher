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
import {downloadTarball, extractTarball, isValidTarball} from "./utils/tarball.js";
import {SMSimpleVar, StateMachine} from "./statemachine.js";
import {getTempPath} from "./temp.js";
import * as MainConfig from "./main-config.js";

const mainConfig = await MainConfig.get();

export let launcherConfig = {
    path: path.join(process.cwd(), "launcher"),
    tarballUrl: new URL(mainConfig.launcher.tarballUrl),
    tarballFileName: "launcher.tar.gz",
    defaultConfigsPath: path.join(process.cwd(), "default-launcher-configs")
};

const launcherStateMachine = new StateMachine("launcher");

const enum LauncherState {
    creatingDir = "creating dir",
    tarballDownloading = "tarball downloading",
    tarballExtracting = "tarball extracting",
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
    const launcherStatus = new SMSimpleVar<string>(launcherStateMachine, "status", LauncherState.creatingDir);

    const launcherPath = launcherConfig.path;
    if (!await isDirectoryExists(launcherPath)) {
        await launcherStatus.resetValue();
    } else if (await launcherStatus.readValue() === LauncherState.fullyInstalled) {
        console.log("Launcher already installed. Skipping...");
        return;
    }

    console.log("Installing launcher");

    while (true) {
        if (await launcherStatus.readValue() === LauncherState.creatingDir) {
            //cleanup
            if (await isDirectoryExists(launcherPath)) {
                await rmdir(launcherPath);
            }
            await mkdir(launcherPath, {recursive: false});
            await launcherStatus.writeValue(LauncherState.tarballDownloading);
        }
        const launcherTarballFileName: string = launcherConfig.tarballFileName;
        const launcherTarballPath: string = path.join(getTempPath(), launcherTarballFileName);
        if (await launcherStatus.readValue() === LauncherState.tarballDownloading) {
            //cleanup
            if (await isFileExists(launcherTarballPath)) {
                await rm(launcherTarballPath, {recursive: false, force: true});
            }
            const launcherTarballURL: URL = new URL(launcherConfig.tarballUrl);
            await asyncRetryWrapper(
                () => downloadTarball(launcherTarballURL, launcherTarballPath),
                {shouldRetryError: isNetworkError}
            );
            await launcherStatus.writeValue(LauncherState.tarballExtracting);
        }
        if (await launcherStatus.readValue() === LauncherState.tarballExtracting) {
            //validating
            if (!await isValidTarball(launcherTarballPath)) {
                await launcherStatus.writeValue(LauncherState.tarballDownloading);
                continue;
            }
            //cleanup
            if (!await isDirectoryEmpty(launcherPath)) {
                await cleanDirectory(launcherPath);
            }
            await extractTarball(launcherTarballPath, launcherPath);
            await launcherStatus.writeValue(LauncherState.defaultConfigsInstalling);
        }
        if (await launcherStatus.readValue() === LauncherState.defaultConfigsInstalling) {
            console.log("Installing default configs");
            await cp(
                launcherConfig.defaultConfigsPath, launcherConfig.path,
                {recursive: true, force: true}
            );
            console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
            await launcherStatus.writeValue(LauncherState.cleanup);
        }
        if (await launcherStatus.readValue() == LauncherState.cleanup) {
            console.log("Cleanup");
            await rm(launcherTarballPath, {recursive: false, force: true});
            await launcherStatus.writeValue(LauncherState.fullyInstalled);
            break;
        }
    }
}