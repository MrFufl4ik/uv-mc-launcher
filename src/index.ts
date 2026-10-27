import lockfile from 'proper-lockfile';
import path from "node:path";
import os from "node:os";
import {writeFile} from "node:fs/promises";
import * as readlineSync from "readline-sync";
import {sleep} from "./api/misc.js";
import {launcherEntry} from "./atomic/launcher.js";
import {requirementsEntry} from "./atomic/requirements.js";
import {clientEntry} from "./atomic/client.js";
import {accountsEntry} from "./atomic/account.js";
import {runGameEntry} from "./atomic/run-game.js";
import {trSingle} from "./api/console/translation.js";

export function exitWithPause(code: number, err?: any): never {
    readlineSync.question(trSingle.getTranslation().exit.pressEnterToExit);
    if (err !== undefined) throw err;
    process.exit(code);
}

async function mainWithLock() {
    const lockFile = path.join(process.cwd(), ".lock");
    await writeFile(lockFile, "", {encoding: "utf8"});

    let release: (() => Promise<void>) | undefined;
    try {
        release = await lockfile.lock(lockFile);
        await main();
    } catch (err: any) {
        if ("code" in err && err.code === 'ELOCKED') {
            console.log(trSingle.getTranslation().errors.applicationAlreadyStarted);
            process.exit(1);
        }
        console.log(trSingle.getTranslation().exit.runtimeError + ` "${err}"`);
        exitWithPause(1, err);
    } finally {
        if (release) {
            await release();
        }
    }
}

async function main() {
    await requirementsEntry();
    await launcherEntry();
    await clientEntry();
    await accountsEntry();
    await runGameEntry();
    console.log(trSingle.getTranslation().exit.successfulExit);
    sleep(1000 * 3);
}


if (!["linux", "win32"].includes(os.platform())) {
    console.log(trSingle.getTranslation().errors.notSupportedPlatform);
    process.exit(1);
}

await mainWithLock();