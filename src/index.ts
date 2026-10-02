import {clientEntry} from "./client.js";
import {launcherEntry} from "./launcher.js";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import lockfile from 'proper-lockfile';
import {hideFileOnWindows} from "./utils.js";

async function main() {
    await launcherEntry()
    await clientEntry();
}

async function mainWithLock(){
    const lockFile = path.join(process.cwd(), ".lock");
    await writeFile(lockFile, "", {encoding: "utf8"})
    hideFileOnWindows(lockFile)

    let release: (() => Promise<void>) | undefined;
    try {
        release = await lockfile.lock(lockFile);
        await main();
    } catch (err: any) {
        if ("code" in err && err.code === 'ELOCKED') {
            console.log('Application already started!');

            process.exit(1);
        }
        throw err;
    } finally {
        if (release) {
            await release();
        }
    }
}

await mainWithLock();