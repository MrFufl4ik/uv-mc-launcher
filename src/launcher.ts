import {cp, mkdir, rm} from "node:fs/promises";
import path from "node:path";
import {isDirectoryExists, downloadTarball, extractTarball, ConsoleOpts, asyncRetryWrapper} from "./utils.js";
import {SMSimpleStatus, StateMachine} from "./statemachine.js";
import {getTempPath} from "./temp.js";

let launcherConfig = {
    path: path.join(process.cwd(), "launcher"),
    tarballUrl: new URL("https://github.com/Diegiwg/PrismLauncher-Cracked/releases/download/11.0.3/PrismLauncher-Linux-Qt6-Portable-11.0.3.tar.gz"),
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
    if (await isLauncherRequiresInstalled()) {
        await installLauncher();
    } else {
        console.log("Launcher already installed. Skipping");
    }
}

async function isLauncherRequiresInstalled() {
    if (!await isDirectoryExists(launcherConfig.path)) {
        return true;
    }
    const launcherStatus = new SMSimpleStatus(launcherStateMachine, LauncherStatus.creatingDir);
    return await launcherStatus.readStatus() != LauncherStatus.fullyInstalled;
}

function isNetworkError(error: Error): boolean {
    if (!("code" in error && typeof error.code === "string")) return false;
    console.log(error.code);
    return (
        [
            "UND_ERR_CONNECT_TIMEOUT",
            "ENOTFOUND"
        ].includes(error.code)
    );
}

async function installLauncher() {
    console.log("Installing launcher");
    const launcherTarballURL: URL = new URL(launcherConfig.tarballUrl);
    const launcherTarballFileName: string = launcherConfig.tarballFileName;

    const launcherStatus = new SMSimpleStatus(launcherStateMachine, LauncherStatus.creatingDir);
    if (!await isDirectoryExists(launcherConfig.path)) {
        await launcherStatus.resetStatus();
    }

    const launcherPath = launcherConfig.path;
    if (await launcherStatus.readStatus() === LauncherStatus.creatingDir) {
        await mkdir(launcherPath, {recursive: false});
        await launcherStatus.writeStatus(LauncherStatus.tarballDownloading);
    }
    const launcherTarballPath: string = path.join(await getTempPath(), launcherTarballFileName);
    if (await launcherStatus.readStatus() === LauncherStatus.tarballDownloading) {
        await asyncRetryWrapper(
            () => downloadTarball(launcherTarballURL, launcherTarballPath),
            {shouldRetryError: isNetworkError}
        );
        await launcherStatus.writeStatus(LauncherStatus.tarballExtracting);
    }
    if (await launcherStatus.readStatus() === LauncherStatus.tarballExtracting) {
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
    }
}