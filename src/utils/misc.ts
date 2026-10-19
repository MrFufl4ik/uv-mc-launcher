import {readdir, rm, stat} from "node:fs/promises";
import fs from "fs/promises";
import * as cliProgress from "cli-progress";
import os from "node:os";
import {execFile} from "node:child_process";
import path from "node:path";

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
        await fs.access(path);
        return true;
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


export function hideFileOnWindows(filePath: string) {
    if (os.platform() == "win32") {
        execFile("attrib", ["+H", filePath]);
    }
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
