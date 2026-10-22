import os from "node:os";
import {spawn} from "node:child_process";
import {
    asyncRetryWrapper,
    cleanDirectory,
    ConsoleOpts,
    isDirectoryEmpty,
    isDirectoryExists,
    isNetworkError
} from "../api/misc.js";
import path from "node:path";
import {exitWithPause} from "../index.js";
import {SMSimpleSequenceVar, StateMachine} from "../api/statemachine.js";
import {mkdir, rm, rmdir} from "node:fs/promises";
import {downloadFile} from "../api/response.js";
import {getTempPath} from "../api/temp.js";
import {extractArchive, isValidArchive} from "../api/archive.js";
import * as MainConfig from "../api/main-config.js";

const mainConfig = await MainConfig.get();

export const mingitPath = path.join(process.cwd(), "mingit");

const requirementsStateMachine = new StateMachine("requirements");

export async function requirementsEntry(): Promise<void> {
    if (os.platform() != "win32") {
        if (!await isGitInstalled()) {
            console.log(`${ConsoleOpts.yellow}Install git (version control program). And add it to path.${ConsoleOpts.reset}`);
            exitWithPause(1);
        }
    } else {
        await installMinGit_win32();
    }
}

async function isGitInstalled(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const child = spawn("git", ["--version"], {
            stdio: "ignore"
        });

        child.once("error", () => resolve(false));
        child.once("close", (code) => {
            resolve(code === 0);
        });
    });
}

async function installMinGit_win32(): Promise<void> {
    const enum MingitState {
        creatingDir = "creating dir",
        archiveDownloading = "archive downloading",
        archiveExtracting = "archive extracting",
        cleanup = "cleanup",
        fullyInstalled = "fully installed"
    }

    const sequenceName = "mingit";
    const smStatus = new SMSimpleSequenceVar<string>(
        requirementsStateMachine,
        sequenceName,
        "status",
        MingitState.creatingDir
    );
    const smMingitArchivePath = new SMSimpleSequenceVar<string>(
        requirementsStateMachine,
        sequenceName,
        "archiveFileName",
        ""
    );

    if (!await isDirectoryExists(mingitPath)) {
        await smStatus.resetValue();
    } else if (await smStatus.readValue() === MingitState.fullyInstalled) {
        //mingit installed
        return;
    }

    console.log("Installing git");

    while (true) {
        if (await smStatus.readValue() === MingitState.creatingDir) {
            //cleanup
            if (await isDirectoryExists(mingitPath)) {
                await rmdir(mingitPath);
            }
            await mkdir(mingitPath, {recursive: false});
            await smStatus.writeValue(MingitState.archiveDownloading);
        }
        if (await smStatus.readValue() === MingitState.archiveDownloading) {
            const mingitArchiveURL: URL = new URL(mainConfig.urls.mingitWin32Archive);
            const mingitArchivePath = await asyncRetryWrapper<string>(
                () => downloadFile(mingitArchiveURL, getTempPath()),
                {shouldRetryError: isNetworkError}
            );
            await smMingitArchivePath.writeValue(mingitArchivePath);
            await smStatus.writeValue(MingitState.archiveExtracting);
        }
        if (await smStatus.readValue() === MingitState.archiveExtracting) {
            //validating
            const launcherArchivePath = await smMingitArchivePath.readValue();
            if (
                launcherArchivePath == smMingitArchivePath.defaultValue ||
                !await isValidArchive(launcherArchivePath)
            ) {
                await smStatus.writeValue(MingitState.archiveDownloading);
                continue;
            }
            //cleanup
            if (!await isDirectoryEmpty(mingitPath)) {
                await cleanDirectory(mingitPath);
            }
            await extractArchive(launcherArchivePath, mingitPath);
            await smStatus.writeValue(MingitState.cleanup);
        }
        if (await smStatus.readValue() == MingitState.cleanup) {
            console.log("Cleanup");
            const mingitArchivePath = await smMingitArchivePath.readValue();
            if (mingitArchivePath != smMingitArchivePath.defaultValue) {
                await rm(mingitArchivePath, {recursive: false, force: true});
            }
            await smStatus.writeValue(MingitState.fullyInstalled);
            await smMingitArchivePath.resetValue();
            console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
            break;
        }
    }

}
