import {ConsoleOpts, createProgressBar, isFileExists} from "./misc.js";
import {Readable, Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {createWriteStream} from "node:fs";
import * as tar from "tar";


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

export async function isValidTarball(tarballPath: string) {
    if (!await isFileExists(tarballPath)) return false;
    try {
        await tar.t({
            file: tarballPath,
            gzip: true
        });
        return true;
    } catch {
        return false;
    }
}