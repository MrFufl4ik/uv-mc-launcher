# [mrfufl4ik](https://github.com/mrfufl4ik)/[uv-mc-launcher](https://github.com/mrfufl4ik/uv-mc-launcher)

Is a so convenient way to deliver minecraft to your users with your custom instance.
This software is not a launcher in the literal sense of the word! It’s a wrapper over [Prism Launcher](https://github.com/prismlauncher/PrismLauncher).

> [!CAUTION]
>
> ### Stop slop-coding!
> AI is not used in the development of this project.
> However, commit messages may use AI‑generated text to speed up the release of updates.
> Otherwise, all code is written by humans.
> The project does not approve of vibe coding!

## Using

### Download
Download and extract latest archive from [latest release](https://github.com/MrFufl4ik/uv-mc-launcher/releases/latest). 

### Configuration file
```yaml
# config.yaml
urls:
  launcherArchive: "https://github.com/PrismLauncher/PrismLauncher/releases/download/11.1.1/PrismLauncher-Linux-Qt6-Portable-11.1.1.tar.gz"
  mingitWin32Archive: "https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.1/MinGit-2.56.0-64-bit.zip"
account:
  name: "MinecraftPlayer1"
  id: "super-default-id" # optional, define specific player id. can be find in /launcher/accounts.json.
clients:
  - id: "test-client" # use only [a-Z-_]. this apply's to client path: /run/test-client.
    displayName: "Default" # so far, it’s not doing anything.
    git: # optional, define your remote rep config to auto install and to get update's.
      httpUrl: "https://git.example.ru/minecraftdev1/myproject-client.git"
      branch: "main"
      remote: "origin"
      userName: "minecraftdev1"
      authKey: "super-secret-authkey!"
run:
  clientId: "test-client" # client to run.
```
*PS: In the future, files will be able to be encrypted.*
### Run
#### For linux:
1. Install git.
2. `chmod +x ./uv-mc-launcher`.
3. Run `uv-mc-launcher` binary.
#### For windows:
Run `uv-mc-launcher.exe` binary.
The software itself does not require administrator rights.
However, the launcher may request them in order to create a symlink via `make-symlink-win32.exe`.
## Build process
To build, you need **node v26.12.0** and **magick**. What is written below is relevant for **Linux**. For Windows, some steps will look different!
### Clone remote repo
```bash
git clone https://github.com/MrFufl4ik/uv-mc-launcher.git
```
### Init
```bash
npm si
```
### Build
```bash
mkdir ./build # make build folder for next steps

npm run build # run full build.

# -----------------------------
# or build steps (in order)
npm run build-ts          # build typescript (/build/dist/)
npm run build-es          # esbuild process (/build/)
npm run build-sea         # build posix bin (/build/)
npm run build-sea-win32   # build win32 bin (/build/)
npm run build-icon-win32  # build icon file from png with magick (/assets/)
npm run set-icon-win32    # set icon file to win32 bin
```
