import {cp, mkdir, rm, rmdir} from "node:fs/promises";
import path from "node:path";
import {
    isDirectoryExists,
    downloadTarball,
    extractTarball,
    ConsoleOpts,
    asyncRetryWrapper,
    isValidTarball, isFileExists, isDirectoryEmpty, cleanDirectory
} from "./utils.js";
import {SMSimpleStatus, StateMachine} from "./statemachine.js";
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

const enum LauncherStatus {
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
    const launcherStatus = new SMSimpleStatus(launcherStateMachine, LauncherStatus.creatingDir);

    const launcherPath = launcherConfig.path;
    if (!await isDirectoryExists(launcherPath)) {
        await launcherStatus.resetStatus();
    } else if (await launcherStatus.readStatus() === LauncherStatus.fullyInstalled) {
        console.log("Launcher already installed. Skipping");
        return;
    }

    console.log("Installing launcher");

    while (true) {
        if (await launcherStatus.readStatus() === LauncherStatus.creatingDir) {
            //cleanup
            if (await isDirectoryExists(launcherPath)) {
                await rmdir(launcherPath);
            }
            await mkdir(launcherPath, {recursive: false});
            await launcherStatus.writeStatus(LauncherStatus.tarballDownloading);
        }
        const launcherTarballFileName: string = launcherConfig.tarballFileName;
        const launcherTarballPath: string = path.join(await getTempPath(), launcherTarballFileName);
        if (await launcherStatus.readStatus() === LauncherStatus.tarballDownloading) {
            //cleanup
            if (await isFileExists(launcherTarballPath)) {
                await rm(launcherTarballPath, {recursive: false, force: true});
            }
            const launcherTarballURL: URL = new URL(launcherConfig.tarballUrl);
            await asyncRetryWrapper(
                () => downloadTarball(launcherTarballURL, launcherTarballPath),
                {shouldRetryError: isNetworkError}
            );
            await launcherStatus.writeStatus(LauncherStatus.tarballExtracting);
        }
        if (await launcherStatus.readStatus() === LauncherStatus.tarballExtracting) {
            //validating
            if (!await isValidTarball(launcherTarballPath)) {
                await launcherStatus.writeStatus(LauncherStatus.tarballDownloading);
                continue;
            }
            //cleanup
            if (!await isDirectoryEmpty(launcherPath)) {
                await cleanDirectory(launcherPath);
            }
            await extractTarball(launcherTarballPath, launcherPath);
            await launcherStatus.writeStatus(LauncherStatus.defaultConfigsInstalling);
        }
        if (await launcherStatus.readStatus() === LauncherStatus.defaultConfigsInstalling) {
            console.log("Installing default configs");
            await cp(
                launcherConfig.defaultConfigsPath, launcherConfig.path,
                {recursive: true, force: true}
            );
            console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
            await launcherStatus.writeStatus(LauncherStatus.cleanup);
        }
        if (await launcherStatus.readStatus() == LauncherStatus.cleanup) {
            console.log("Cleanup");
            await rm(launcherTarballPath, {recursive: false, force: true});
            await launcherStatus.writeStatus(LauncherStatus.fullyInstalled);
            break;
        }
    }
}