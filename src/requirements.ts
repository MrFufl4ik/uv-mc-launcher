import os from "node:os";
import {spawn} from "node:child_process";
import {ConsoleOpts, isFileExists} from "./utils/misc.js";
import path from "node:path";
import {exitWithPause} from "./index.js";
import {StateMachine} from "./statemachine.js";

const requirementsStateMachine = new StateMachine("requirements");

export async function requirementsEntry() {
    if (os.platform() != "win32") {
        if (!await isGitInstalled()) {
            console.log(`${ConsoleOpts.yellow}Install git (version control program). And add it to path.${ConsoleOpts.reset}`)
            exitWithPause(1);
        }
    } else {
        if (!await isGitInstalled_win32()) await installPortableGit_win32();
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

async function isGitInstalled_win32(): Promise<boolean> {
    return await isFileExists(path.join(process.cwd(), "mingit"));
}

async function installPortableGit_win32() {

}
