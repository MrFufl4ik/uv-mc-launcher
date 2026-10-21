import os from "node:os";
import {spawn} from "node:child_process";
import {isFileExists} from "./utils/misc.js";
import path from "node:path";
import {exitWithPause} from "./index.js";


export async function requirementsEntry() {
    if (os.platform() != "win32") {
        if (!await isGitInstalled()) {
            console.log("Install git (version control program). And add it to path.")
            exitWithPause(1);
        }
    } else {
        if (!await isGitInstalled_win32()) await installPortableGit_win32();
    }
}

async function isGitInstalled(): Promise<boolean> {
    const code = await new Promise<number | null>((resolve, reject) => {
        const child = spawn("which", ["git"], {
            stdio: 'inherit'
        });
        child.once('error', reject);
        child.once('close', resolve);
    });
    return code === 0;
}

async function isGitInstalled_win32(): Promise<boolean> {
    return await isFileExists(path.join(process.cwd(), "mingit"));
}

async function installPortableGit_win32() {

}
