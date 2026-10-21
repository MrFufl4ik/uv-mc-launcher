import {ConsoleOpts, createProgressBar, isFileExists} from "./misc.js";
import {Readable, Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {createWriteStream} from "node:fs";
import path from "node:path";

export function getFileNameFromDownloadResponse(response: Response): string | undefined {
    const contentDisposition = response.headers.get("content-disposition");

    if (contentDisposition) {
        // RFC 5987: filename*=UTF-8''archive%20name.tar.gz
        const filenameStar = contentDisposition.match(
            /filename\*\s*=\s*UTF-8''([^;]+)/i,
        )?.[1];

        if (filenameStar) {
            try {
                return decodeURIComponent(
                    filenameStar.trim().replace(/^["']|["']$/g, ""),
                );
            } catch {
            }
        }

        const filename = contentDisposition.match(
            /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i,
        );

        const value = filename?.[1] ?? filename?.[2]?.trim();

        if (value) {
            return value;
        }
    }

    const pathname = new URL(response.url).pathname;
    const basename = pathname.split("/").pop();

    if (basename) {
        try {
            return decodeURIComponent(basename);
        } catch {
            return basename;
        }
    }

    return undefined;
}

export async function downloadFile(url: URL, destinationPath: string) {
    const response: Response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Http ${response.status}`);
    }
    if (!response.body) {
        throw new Error("Response body is empty");
    }
    const totalBytes = Number(response.headers.get("content-length"));
    if (totalBytes === 0){
        throw new Error("Response body is empty");
    }

    const fileName = getFileNameFromDownloadResponse(response);
    if (fileName === undefined){
        throw new Error("Failed to retrieve the file name")
    }

    console.log(`Download file ${fileName} to ${destinationPath}`);

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

    const resultPath = path.join(destinationPath, fileName);
    try {
        await pipeline(
            Readable.fromWeb(<ReadableStream>response.body),
            progressTransform,
            createWriteStream(resultPath)
        );
    } finally {
        bar.stop();
    }
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
    return resultPath
}