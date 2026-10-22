import {mkdir, rmdir} from "node:fs/promises";
import path from "node:path";
import {asyncRetryWrapper, ConsoleOpts, createProgressBar, isDirectoryExists, isNetworkError} from "../api/misc.js";
import {SMSimpleSequenceVar, StateMachine} from "../api/statemachine.js";
import type {ZClientT} from "../api/main-config.js";
import * as MainConfig from "../api/main-config.js";
import {exitWithPause} from "../index.js";
import {getGitBinary} from "../api/git.js";
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
        //error state
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
            const gitInstance = simpleGit({binary: getGitBinary(), baseDir: clientPath});
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


async function gitWriteRef(git: SimpleGit, ref: string, sha: string): Promise<void> {
    await git.raw(['update-ref', ref, sha]);
}

async function gitSyncLocalBranchWithRemote(
    clientId: string,
    baseDir: string, branch: string, localRef: string, remoteHead: string
) {
    const enum SyncStatus {
        idle = "idle",
        writeRef = "write ref",
        checkout = "checkout"
    }

    const smStatus = new SMSimpleSequenceVar<string>(
        clientStateMachine,
        `client-${clientId}`,
        `gitSyncStatus`,
        SyncStatus.idle
    );

    const clientPath = getClientPath(clientId);

    if (await smStatus.readValue() == SyncStatus.idle) {
        await smStatus.writeValue(SyncStatus.writeRef);
    }
    if (await smStatus.readValue() === SyncStatus.writeRef) {
        const gitInstance = simpleGit({binary: getGitBinary(), baseDir: clientPath});
        await gitWriteRef(gitInstance, localRef, remoteHead);
        await smStatus.writeValue(SyncStatus.checkout);
    }
    if (await smStatus.readValue() === SyncStatus.checkout) {
        const gitInstance = simpleGit({binary: getGitBinary(), baseDir: clientPath,});
        await gitInstance.checkout(["--force", branch]);
        await smStatus.writeValue(SyncStatus.idle);
    }
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

async function updateClient(clientId: string, gitConfig: GitConfig) {
    console.log("Check client for update");

    const enum UpdateStatus {
        idle = "idle",
        fetch = "fetch",
        headsChecking = "heads checking",
        checkout = "checkout"
    }

    const clientPath = getClientPath(clientId);
    const smStatus = new SMSimpleSequenceVar<string>(
        clientStateMachine,
        `client-${clientId}`,
        `updateStatus`,
        UpdateStatus.idle
    );
    const smRemoteHead = new SMSimpleSequenceVar<string>(
        clientStateMachine,
        `client-${clientId}`,
        `remoteHead`,
        ""
    );

    if (await smStatus.readValue() === UpdateStatus.idle) {
        await smStatus.writeValue(UpdateStatus.fetch);
    }

    const branch = gitConfig.branch;
    const remoteRef = `refs/remotes/origin/${branch}`;
    const localRef = `refs/heads/${branch}`;

    if (await smStatus.readValue() === UpdateStatus.fetch) {
        let pBar: SingleBar | undefined;
        const httpExtraHeader = `http.extraHeader=Authorization: Basic ${Buffer
            .from(`x-access-token:${gitConfig.authKey}`)
            .toString('base64')}`;
        const gitInstance = simpleGit({
            binary: getGitBinary(),
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

        await asyncRetryWrapper(() => gitInstance.fetch(gitConfig.remote, branch, ["--depth=1"]),
            {shouldRetryError: isNetworkError});

        await smStatus.writeValue(UpdateStatus.headsChecking);
    }

    if (await smStatus.readValue() === UpdateStatus.headsChecking) {
        const gitInstance = simpleGit({binary: getGitBinary(), baseDir: clientPath});
        const remoteHead = await gitResolveRef(gitInstance, remoteRef);
        const localHead = await gitResolveRef(gitInstance, localRef);
        if (!remoteHead) throw new Error(`No remote ref of ${remoteRef}`);

        if (localHead === remoteHead) {
            console.log(`${ConsoleOpts.green}Client is already up to date${ConsoleOpts.reset}`);
            await smStatus.resetValue();
            return;
        }

        await smRemoteHead.writeValue(remoteHead);
        await smStatus.writeValue(UpdateStatus.checkout);
    }

    if (await smStatus.readValue() === UpdateStatus.checkout) {
        const remoteHead = await smRemoteHead.readValue();
        const gitInstance = simpleGit({binary: getGitBinary(), baseDir: clientPath});
        const localHead = await gitResolveRef(gitInstance, localRef);

        const localVer = localHead ? localHead.slice(0, 7) : "init state";
        const remoteVer = remoteHead.slice(0, 7);
        console.log(
            "Client updated" + " " +
            `${ConsoleOpts.cyan}"${localVer}"${ConsoleOpts.reset}` +
            " -> " +
            `${ConsoleOpts.cyan}"${remoteVer}"${ConsoleOpts.reset}`
        );
        await gitSyncLocalBranchWithRemote(clientId, clientPath, branch, localRef, remoteHead);
        await smStatus.resetValue();
    }
}

