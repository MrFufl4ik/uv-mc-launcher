import fs from "node:fs";
import * as ResEdit from "resedit";

const EXECUTABLE = "build/uv-mc-launcher.exe";
const ICON = "assets/uv-mv-launcher-icon.ico";

const executable = ResEdit.NtExecutable.from(fs.readFileSync(EXECUTABLE), { ignoreCert: true });
const resource = ResEdit.NtExecutableResource.from(executable);
const icon = ResEdit.Data.IconFile.from(fs.readFileSync(ICON));

ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resource.entries,
    1,
    1033,
    icon.icons.map((i) => i.data)
);

resource.outputResource(executable);
fs.writeFileSync(EXECUTABLE, Buffer.from(executable.generate()));
console.log(`Icon updated: ${EXECUTABLE}`);