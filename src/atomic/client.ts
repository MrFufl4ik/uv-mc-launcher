import {mkdir, rm, rmdir} from "node:fs/promises";
import path from "node:path";
import {asyncRetryWrapper, ConsoleOpts, createProgressBar, isDirectoryExists, isNetworkError} from "../api/misc.js";
import {SMSimpleSequenceVar, StateMachine} from "../api/statemachine.js";
import type {ZClientT} from "../api/main-config.js";
import * as MainConfig from "../api/main-config.js";
import {exitWithPause} from "../index.js";
import {getCrossPlatformGitBinary} from "../api/git.js";
import {type SimpleGit, simpleGit, type SimpleGitProgressEvent} from "simple-git";
import type {SingleBar} from "cli-progress";

const clientStateMachine = new StateMachine("client");
const mainConfig = await MainConfig.get();

const clientsPath = path.join(process.cwd(), "run");
if (!await isDirectoryExists(clientsPath)) await mkdir(clientsPath, {recursive: false});

type GitConfig = {
    repository: string,
    branch: string,
    remote: string,
    userName: string,
    authKey: string,
}

export async function clientEntry() {
    const clientId = mainConfig.run.clientId;
    const client: ZClientT | null = getClientByClientId(clientId);
    if (client === null) {
        console.log(`${ConsoleOpts.yellow}Client '${clientId}' not found in config!${ConsoleOpts.reset}`);
        exitWithPause(1);
    }
    if (client.git === undefined) {
        console.log(`Git not configured for this client`);
        return;
    }
    const gitConfig: GitConfig = {
        repository: client.git.httpUrl,
        branch: client.git.branch,
        remote: client.git.remote,
        userName: client.git.userName,
        authKey: client.git.authKey,
    };
    await initGitForClient(client.id, gitConfig);
    await updateClient(client.id, gitConfig);
}

function getClientByClientId(clientId: string): ZClientT | null {
    for (const client of mainConfig.clients) {
        if (client.id == clientId) return client;
    }
    return null;
}

export function getClientPath(clientId: string) {
    return path.join(clientsPath, clientId);
}

async function initGitForClient(clientId: string, gitConfig: GitConfig) {
    const enum GitInitStatus {
        creatingDir = "creating dir",
        gitInit = "git init",
        workOnGitInit = "work on git init",
        done = "done"
    }

    const smStatus = new SMSimpleSequenceVar<string>(
        clientStateMachine,
        `client-${clientId}`,
        `initLocalRepository`,
        GitInitStatus.creatingDir
    );

    const clientPath = getClientPath(clientId);
    const clientGitPath = path.join(clientPath, ".git");

    while (true) {
        //error state's
        if (!await isDirectoryExists(clientPath)) {
            await smStatus.resetValue();
        } else if (!await isDirectoryExists(clientGitPath)) {
            await smStatus.writeValue(GitInitStatus.gitInit);
        }
        if (await smStatus.readValue() === GitInitStatus.workOnGitInit) {
            if (await isDirectoryExists(clientGitPath)) await rmdir(clientGitPath);
            await smStatus.writeValue(GitInitStatus.gitInit);
        }

        if (await smStatus.readValue() === GitInitStatus.done) break;

        if (await smStatus.readValue() === GitInitStatus.creatingDir) {
            console.log("Initializing local git repo")
            if (await isDirectoryExists(clientPath)) {
                await smStatus.writeValue(GitInitStatus.gitInit);
                continue;
            }
            await mkdir(clientPath, {recursive: false});
            await smStatus.writeValue(GitInitStatus.gitInit);
        }
        if (await smStatus.readValue() === GitInitStatus.gitInit) {
            if (await isDirectoryExists(clientGitPath)) {
                await smStatus.writeValue(GitInitStatus.done);
                continue;
            }
            await smStatus.writeValue(GitInitStatus.workOnGitInit);
            console.log("Initialising local git repository");
            const gitInstance = simpleGit({binary: getCrossPlatformGitBinary(), baseDir: clientPath});
            await gitInstance.init();
            await gitInstance.addRemote(gitConfig.remote, gitConfig.repository);
            await gitInstance.branch(['-M', gitConfig.branch]);
            console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
            await smStatus.writeValue(GitInitStatus.done);
        }
    }

}

async function gitResolveRef(git: SimpleGit, ref: string): Promise<string | null> {
    try {
        return (await git.raw(['rev-parse', '--verify', ref])).trim();
    } catch {
        return null;
    }
}

async function gitExecuteUpdateEntry(
    git: SimpleGit, repoPath: string, remoteHead: string,
    writeList: string[], removeList: string[]
) {
    for (let i = 0; i < writeList.length; i += 200) {
        await git.raw(['checkout', remoteHead, '--', ...writeList.slice(i, i + 200)]);
    }
    for (const entry of removeList) {
        await rm(path.join(repoPath, entry), {force: true});
    }
    await git.raw(['reset', '--mixed', remoteHead]);
}

function successUpdateMessage(localHead: string | null, remoteHead: string){
    const localVer = localHead ? localHead.slice(0, 7) : "init state";
    const remoteVer = remoteHead.slice(0, 7);
    console.log(
        "Client updated" + " " +
        `${ConsoleOpts.cyan}"${localVer}"${ConsoleOpts.reset}` +
        " -> " +
        `${ConsoleOpts.cyan}"${remoteVer}"${ConsoleOpts.reset}`
    );
}

async function updateClient(clientId: string, gitConfig: GitConfig) {
    console.log("Check client for update");

    const enum UpdateStatus {
        idle = "idle",
        fetch = "fetch",
        headsChecking = "heads checking",
        //on first install
        pull = "pull",
        //on update
        planing = "planing",
        update = "update"
    }

    const clientPath = getClientPath(clientId);
    const smStatus = new SMSimpleSequenceVar<string>(
        clientStateMachine,
        `client-${clientId}`,
        "updateStatus",
        UpdateStatus.idle
    );
    const smRemoteHead = new SMSimpleSequenceVar<string>(
        clientStateMachine,
        `client-${clientId}`,
        "remoteHead",
        ""
    );
    const smWriteList = new SMSimpleSequenceVar<string[]>(
        clientStateMachine,
        `client-${clientId}`,
        "writeList",
        []
    );
    const smRemoveList = new SMSimpleSequenceVar<string[]>(
        clientStateMachine,
        `client-${clientId}`,
        "removeList",
        []
    );


    const remoteRef = `refs/remotes/origin/${gitConfig.branch}`;
    const localRef = `refs/heads/${gitConfig.branch}`;

    while (true) {
        if (await smStatus.readValue() === UpdateStatus.idle) {
            await smStatus.writeValue(UpdateStatus.fetch);
        }

        if (await smStatus.readValue() === UpdateStatus.fetch) {
            let pBar: SingleBar | undefined;
            const httpExtraHeader = `http.extraHeader=Authorization: Basic ${Buffer
                .from(`x-access-token:${gitConfig.authKey}`)
                .toString('base64')}`;
            const gitInstance = simpleGit({
                binary: getCrossPlatformGitBinary(),
                baseDir: clientPath,
                progress(data: SimpleGitProgressEvent) {
                    if (pBar === undefined && data.progress === 1) {
                        pBar = createProgressBar("Updating", "E");
                        pBar.start(data.total, 0);
                    }
                    if (pBar !== undefined) {
                        if (data.processed > pBar.getProgress()) pBar.update(data.processed);
                        if (data.processed === data.total) {
                            pBar.stop();
                        }
                    }
                },
                config: [httpExtraHeader]
            });

            await asyncRetryWrapper(() => gitInstance.fetch(gitConfig.remote, gitConfig.branch, ["--depth=1"]),
                {shouldRetryError: isNetworkError});

            await smStatus.writeValue(UpdateStatus.headsChecking);
        }

        if (await smStatus.readValue() === UpdateStatus.headsChecking) {
            const gitInstance = simpleGit({binary: getCrossPlatformGitBinary(), baseDir: clientPath});
            const remoteHead = await gitResolveRef(gitInstance, remoteRef);
            const localHead = await gitResolveRef(gitInstance, localRef);
            if (!remoteHead) throw new Error(`No remote ref of ${remoteRef}`);

            if (localHead === remoteHead) {
                console.log(`${ConsoleOpts.green}Client is already up to date${ConsoleOpts.reset}`);
                await smStatus.resetValue();
                break;
            }

            await smRemoteHead.writeValue(remoteHead);

            if (localHead === null) {
                await smStatus.writeValue(UpdateStatus.pull);
                continue;
            }

            await smStatus.writeValue(UpdateStatus.planing);
        }

        //on first install
        if (await smStatus.readValue() === UpdateStatus.pull) {
            const remoteHead = await smRemoteHead.readValue();
            if (remoteHead === smRemoteHead.defaultValue) {
                await smStatus.resetValue();
                continue;
            }
            const httpExtraHeader = `http.extraHeader=Authorization: Basic ${Buffer
                .from(`x-access-token:${gitConfig.authKey}`)
                .toString('base64')}`;
            const gitInstance = simpleGit({
                binary: getCrossPlatformGitBinary(),
                baseDir: clientPath,
                config: [httpExtraHeader]}
            );
            const localHead = await gitResolveRef(gitInstance, localRef);

            await gitInstance.pull(gitConfig.remote, gitConfig.branch);
            successUpdateMessage(localHead, remoteHead)
            await smStatus.resetValue();
            break;
        }

        //on update
        if (await smStatus.readValue() === UpdateStatus.planing) {
            const remoteHead = await smRemoteHead.readValue();
            if (remoteHead === smRemoteHead.defaultValue) {
                await smStatus.resetValue();
                continue;
            }

            const gitInstance = simpleGit({binary: getCrossPlatformGitBinary(), baseDir: clientPath});
            const localHead = await gitResolveRef(gitInstance, localRef);
            if (localHead === null) throw new Error("Corrupted git local repository!");

            const diffOut = await gitInstance.raw([
                'diff', '--name-status', '--no-renames', '-z', localHead, remoteHead,
            ]);
            const tokens = diffOut.split('\0').filter(Boolean);

            let writeList: string[] = [];
            let removeList: string[] = [];
            for (let i = 0; i + 1 < tokens.length; i += 2) {
                const status = tokens[i];
                const forWrite = tokens[i + 1];
                if (status === undefined || forWrite === undefined) continue;
                (status === 'D' ? removeList : writeList).push(forWrite);
            }

            await smWriteList.writeValue(writeList);
            await smRemoveList.writeValue(removeList);
            await smStatus.writeValue(UpdateStatus.update);
        }

        if (await smStatus.readValue() === UpdateStatus.update) {
            const remoteHead = await smRemoteHead.readValue();
            if (remoteHead === smRemoteHead.defaultValue) {
                await smStatus.resetValue();
                continue;
            }
            const gitInstance = simpleGit({binary: getCrossPlatformGitBinary(), baseDir: clientPath});
            const localHead = await gitResolveRef(gitInstance, localRef);
            if (localHead === null) throw new Error("Corrupted git local repository!");


            const writeList: string[] = await smWriteList.readValue();
            const removeList: string[] = await smRemoveList.readValue();

            await gitExecuteUpdateEntry(gitInstance, clientPath, remoteHead, writeList, removeList);
            successUpdateMessage(localHead, remoteHead)
            await smStatus.resetValue();
            await smWriteList.resetValue();
            await smRemoveList.resetValue();
            break;
        }
    }
}