import {clientEntry} from "./client.js";
import {launcherEntry} from "./launcher.js";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import lockfile from 'proper-lockfile';
import {gameEntry} from "./minecraft/run.js";
import {accountsEntry} from "./minecraft/account.js";
import {ConsoleOpts, sleep} from "./utils/misc.js";
import * as readline from "node:readline/promises";

//todo add flag to disable global try catch in dev environment!

async function main() {
    await launcherEntry();
    await clientEntry();
    await accountsEntry();
    await gameEntry();
    console.log(`${ConsoleOpts.green}All operation's done!${ConsoleOpts.reset}`);
    sleep(1000 * 3);
    //todo ждет завершения под win32 хотя не должен
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
        console.log(`${ConsoleOpts.red}Runtime error (contact to developer):${ConsoleOpts.reset} "${err}"`);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        await rl.question("Press any button to exit...");
        throw err;
    } finally {
        if (release) {
            await release();
        }
    }
}

await mainWithLock();