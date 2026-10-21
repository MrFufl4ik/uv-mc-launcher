import {readdir, rm, stat, symlink} from "node:fs/promises";
import * as cliProgress from "cli-progress";
import os from "node:os";
import {execFile, spawn} from "node:child_process";
import path from "node:path";
import {exitWithPause} from "../index.js";

//console

export const ConsoleOpts = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
};

//progress bar

export function createProgressBar(name: string, currency?: string) {
    return new cliProgress.SingleBar({
        format: `${name} | {bar} | {percentage}% | {value}/{total}${currency ?? ""}`,
        barCompleteChar: `█`,
        barIncompleteChar: '░',
        clearOnComplete: false
    }, cliProgress.Presets.shades_classic);
}

//fs

export async function isDirectoryExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

export async function isFileExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

export async function isDirectoryEmpty(path: string) {
    const files = await readdir(path);
    return files.length === 0;
}

export async function cleanDirectory(directoryPath: string) {
    const files = await readdir(directoryPath);
    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        await rm(filePath, {recursive: true, force: true});
    }
}

export function hideFile_win32(filePath: string) {
    if (os.platform() == "win32") {
        execFile("attrib", ["+H", filePath]);
    }
}

export function getFileSuffix(filename: string): string {
    const match = filename.match(/(\.[^.0-9][^.]*?(?:\.[^.0-9][^.]*)*)$/);
    return match?.[1] ?? "";
}

export async function makeSymLink(targetPath: string, linkPath: string) {
    if (os.platform() == "win32") {
        //todo add make-symlink-win32 to requirement
        const makeSymlinkWin32Binary = path.join(process.cwd(), "make-symlink-win32.exe");
        if (!await isFileExists(makeSymlinkWin32Binary)) {
            console.log(`${makeSymlinkWin32Binary} doesn't exists!`);
            exitWithPause(1);
        }
        await new Promise<void>((resolve, reject) => {
            const child = spawn("cmd.exe", ["/c", makeSymlinkWin32Binary, targetPath, linkPath], {
                stdio: 'inherit',
                windowsHide: true
            });
            child.once('error', reject);
            child.once('close', (code, signal) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(
                        new Error(
                            `make-symlink-win32.exe failed: code=${code}, signal=${signal}`,
                        ),
                    );
                }
            });
        });
    } else {
        await symlink(targetPath, linkPath);
    }
}

//errors

export function isNetworkError(error: Error): boolean {
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

//other

interface RetryOptions {
    attempts?: number;
    delay?: number;
    shouldRetryError?: (error: Error) => boolean;
}

export async function asyncRetryWrapper<T>(
    fn: () => Promise<T>,
    {
        attempts = 5,
        delay = 500,
        shouldRetryError = () => true
    }: RetryOptions = {}
) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (error instanceof Error) {
                if (attempt === attempts - 1 || !shouldRetryError(error)) {
                    throw error;
                }
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error(`${attempts} retry attempts on ${fn.name} function didn't yield results`);
}

export function sleep(milliSecs: number) {
    new Promise(resolve => setTimeout(resolve, milliSecs));
}

export function unixTimestamp(): number {
    return Math.floor(Date.now() / 1000);
}