import os from "node:os";
import path from "node:path";
import {mingitPath} from "../requirements.js";

export function getGitBinary(): [string] {
    if (os.platform() === "win32") return [path.join(mingitPath, "cmd", "git.exe")];
    return ["/usr/bin/git"]
}