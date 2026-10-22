import fs from "node:fs";
import * as ResEdit from "resedit";

const EXE = "build/uv-mc-launcher.exe";
const ICO = "assets/uv-mv-launcher-icon.ico";

const exe = ResEdit.NtExecutable.from(fs.readFileSync(EXE), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(ICO));

ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,      // ID группы иконок
    1033,   // язык (en-US)
    ico.icons.map((i) => i.data)
);

res.outputResource(exe);
fs.writeFileSync(EXE, Buffer.from(exe.generate()));
console.log("Icon updated:", EXE);