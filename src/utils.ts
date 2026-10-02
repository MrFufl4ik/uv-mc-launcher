import * as tar from "tar";
import {pipeline} from "node:stream/promises";
import {Readable, Transform} from "node:stream";
import {createWriteStream} from "node:fs";
import {stat} from "node:fs/promises";
import fs from "fs/promises";
import * as cliProgress from "cli-progress";
import os from "node:os";
import {execFile} from "node:child_process";


export const ConsoleOpts = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
};

export function createProgressBar(name: string, currency?: string) {
    return new cliProgress.SingleBar({
        format: `${name} | {bar} | {percentage}% | {value}/{total}${currency ?? ""}`,
        barCompleteChar: `█`,
        barIncompleteChar: '░',
        clearOnComplete: false
    }, cliProgress.Presets.shades_classic);
}

export async function downloadTarball(url: URL, tarballPath: string) {
    console.log(`Download tarball from ${url} to ${tarballPath}`);
    const response: Response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Http ${response.status}`);
    }
    if (!response.body) {
        throw new Error("Response body is empty");
    }

    const totalBytes = Number(response.headers.get("content-length"));

    const bar = createProgressBar("Downloading", "MB");
    bar.start(
        totalBytes ? Math.round(totalBytes / 1024 / 1024) : 0,
        0
    );

    let downloaded = 0;

    const progressTransform = new Transform({
        transform(chunk, encoding, callback) {
            downloaded += chunk.length;

            bar.update(
                Math.round(downloaded / 1024 / 1024)
            );

            callback(null, chunk);
        }
    });

    try {
        await pipeline(
            Readable.fromWeb(<ReadableStream>response.body),
            progressTransform,
            createWriteStream(tarballPath)
        );
    } finally {
        bar.stop();
    }
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

export async function extractTarball(tarballPath: string, cwd: string) {
    console.log(`Extracting tarball ${tarballPath} to ${cwd}`);

    let entryCount = 0;
    await tar.t({
        file: tarballPath,
        gzip: true,
        onReadEntry() {
            entryCount++;
        }
    });

    const bar = createProgressBar("Extracting", "F");
    bar.start(entryCount, 0);

    let writeCount = 0;
    await tar.x({
        file: tarballPath,
        cwd: cwd,
        gzip: true,
        onReadEntry() {
            writeCount++;
            bar.update(writeCount);
        }
    });
    bar.stop();
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

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
    for (let attempt = 0; attempt <= attempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (error instanceof Error) {
                if (attempt === attempts || !shouldRetryError(error)) {
                    throw error;
                }
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error(`${attempts} retry attempts on ${fn.name} function didn't yield results`);
}

export function hideFileOnWindows(filePath: string){
    if (os.platform() == "win32") {
        execFile("attrib", ["+H", filePath]);
    }
}