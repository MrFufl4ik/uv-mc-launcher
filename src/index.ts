import {clientEntry} from "./atomic/client.js";
import {launcherEntry} from "./atomic/launcher.js";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import lockfile from 'proper-lockfile';
import {ConsoleOpts, sleep} from "./api/misc.js";
import {requirementsEntry} from "./atomic/requirements.js";
import * as readlineSync from "readline-sync";
import {accountsEntry} from "./atomic/account.js";
import {runGameEntry} from "./atomic/run-game.js";

async function main() {
    await requirementsEntry();
    await launcherEntry();
    await clientEntry();
    await accountsEntry();
    // await runGameEntry();
    console.log(`${ConsoleOpts.green}All operation's done!${ConsoleOpts.reset}`);
    sleep(1000 * 3);
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
            console.log('Application already started!');
            process.exit(1);
        }
        //todo dev mode
        console.log(`${ConsoleOpts.red}Runtime error (contact to developer):${ConsoleOpts.reset} "${err}"`);
        exitWithPause(1, err);
    } finally {
        if (release) {
            await release();
        }
    }
}

export function exitWithPause(code: number, err?: any): never {
    readlineSync.question("Press Enter to exit...");
    //todo dev mode
    if (err !== undefined) throw err;
    process.exit(code);
}

await mainWithLock();