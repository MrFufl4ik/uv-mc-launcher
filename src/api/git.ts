import os from "node:os";
import path from "node:path";
import {mingitPath} from "../atomic/requirements.js";

export function getCrossPlatformGitBinary(): [string] {
    if (os.platform() === "linux") return ["/usr/bin/git"]
    else if (os.platform() === "win32") return [path.join(mingitPath, "cmd", "git.exe")];
    process.exit(1); // impossible state
}