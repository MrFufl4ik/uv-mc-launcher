import {ConsoleOpts, createProgressBar, getFileSuffix, isFileExists} from "./misc.js";
import * as tar from "tar";
import * as unzipper from "unzipper";
import path, {basename} from "node:path";
import {exitWithPause} from "../index.js";
import {pipeline} from "node:stream/promises";
import fs from "fs";

const validArchiveSuffixes = [".tar.gz", ".zip"];

export async function extractArchive(archivePath: string, destinationPath: string): Promise<void> {
    console.log(`Extracting archive ${archivePath} to ${destinationPath}`);
    const archiveFileName = basename(archivePath);
    const suffix = getFileSuffix(archiveFileName);
    if (!validArchiveSuffixes.includes(suffix)) {
        console.log(`${ConsoleOpts.red}Archive ${archiveFileName} cannot be open by this program${ConsoleOpts.reset}`);
        exitWithPause(1);
    }
    switch (suffix) {
        case ".tar.gz":
            await extractTarball(archivePath, destinationPath);
            break;
        case ".zip":
            await extractZip(archivePath, destinationPath);
            break;
    }
}

export async function isValidArchive(archivePath: string): Promise<boolean> {
    const archiveFileName = basename(archivePath);
    const suffix = getFileSuffix(archiveFileName);
    if (!validArchiveSuffixes.includes(suffix)){
        console.log(`${ConsoleOpts.red}Archive ${archiveFileName} cannot be open by this program${ConsoleOpts.reset}`);
        exitWithPause(1);
    }
    if (!await isFileExists(archivePath)) return false;
    switch (suffix) {
        case ".tar.gz":
            return await isValidTarball(archivePath);
        case ".zip":
            return await isValidZip(archivePath);
    }
    return false;
}

async function extractTarball(tarballPath: string, destinationPath: string): Promise<void> {
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
        cwd: destinationPath,
        gzip: true,
        strict: true,
        onReadEntry() {
            writeCount++;
            bar.update(writeCount);
        }
    });
    bar.stop();
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

async function isValidTarball(tarballPath: string): Promise<boolean> {
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

async function extractZip(zipPath: string, destinationPath: string): Promise<void> {
    const directory = await unzipper.Open.file(zipPath);
    const entries = directory.files;

    const entryCount = entries.length;
    const bar = createProgressBar("Extracting", "F");
    bar.start(entryCount, 0);

    let writeCount = 0;

    for (const entry of entries) {
        const targetPath = path.resolve(destinationPath, entry.path);
        const rootPath = path.resolve(destinationPath);

        if (
            targetPath !== rootPath &&
            !targetPath.startsWith(rootPath + path.sep)
        ) {
            throw new Error(`Invalid archive path: ${entry.path}`);
        }

        if (entry.type === "Directory") {
            await fs.promises.mkdir(targetPath, {recursive: true});
        } else {
            await fs.promises.mkdir(path.dirname(targetPath), {
                recursive: true,
            });

            await pipeline(
                entry.stream(),
                fs.createWriteStream(targetPath)
            );
        }

        writeCount++;
        bar.update(writeCount);
    }

    bar.stop();

    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

async function isValidZip(zipPath: string): Promise<boolean> {
    try {
        await unzipper.Open.file(zipPath);
        return true;
    } catch {
        return false;
    }
}