import path from "node:path";
import {mkdir} from "node:fs/promises";
import {isDirectoryExists} from "./utils/misc.js";

const tempPath = path.join(process.cwd(), "tmp");
if (!await isDirectoryExists(tempPath)) await mkdir(tempPath, {recursive: false});

export function getTempPath() {
    return tempPath;
}

