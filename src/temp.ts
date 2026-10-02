import path from "node:path";
import {mkdir} from "node:fs/promises";
import {isDirectoryExists} from "./utils.js";

const tempPath = path.join(process.cwd(), "tmp");
if (!isDirectoryExists(tempPath)) await mkdir(tempPath, {recursive: false});

export async function getTempPath() {
    return tempPath;
}

