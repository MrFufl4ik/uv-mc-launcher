import {mkdir, rm} from "node:fs/promises";
import git from "isomorphic-git";
import fs from "fs";
import path from "node:path";
import {asyncRetryWrapper, ConsoleOpts, createProgressBar, isDirectoryExists} from "./api/misc.js";
import http from "isomorphic-git/http/node";
import {SMSimpleSequenceVar, StateMachine} from "./api/statemachine.js";
import type {SingleBar} from "cli-progress";
import * as MainConfig from "./api/main-config.js";
import {exitWithPause} from "./index.js";
import type {ZClientT} from "./api/main-config.js";
import simpleGit from 'simple-git';

const clientStateMachine = new StateMachine("client");
const mainConfig = await MainConfig.get();

const clientsPath = path.join(process.cwd(), "clients")
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
    const client: ZClientT | null = getClientByClientId(clientId)
    if (client === null){
        console.log(`${ConsoleOpts.yellow}Client '${clientId}' not found in config!${ConsoleOpts.reset}`);
        exitWithPause(1);
    }
    if (client.git === undefined){
        console.log(`Git not configured for this client`)
        return
    }
    const gitConfig: GitConfig = {
        repository: client.git.httpUrl,
        branch: client.git.branch,
        remote: client.git.remote,
        userName: client.git.userName,
        authKey: client.git.authKey,
    }
    await initGitClient(client.id, gitConfig);
    await updateClient(client.id, gitConfig);
}

function getClientByClientId(clientId: string): ZClientT | null{
    for (const client of mainConfig.clients){
        if (client.id == clientId) return client;
    }
    return null;
}

async function initGitClient(clientId: string, gitConfig: GitConfig) {
    const enum GitInitStatus {
        creatingDir = "creating dir",
        gitInit = "git init",
        gitInitStart = "git init start",
        gitInitEnd = "git init end",
        fullyInit = "fully init"
    }
    const smInitStatus = new SMSimpleSequenceVar<string>(
        clientStateMachine,
        `client-${clientId}`,
        `initGitStatus`,
        GitInitStatus.creatingDir
    );
    const clientPath = path.join(process.cwd(), clientId)

    if (!await isDirectoryExists(clientPath)) {
        await smInitStatus.resetValue();
    } else if (!await isDirectoryExists(path.join(clientPath, ".git"))) {
        await smInitStatus.writeValue(GitInitStatus.gitInit);
    } else if (await smInitStatus.readValue() === GitInitStatus.gitInitStart) {
        await rm(path.join(clientPath, ".git"));
        await smInitStatus.writeValue(GitInitStatus.gitInit);
    } else if (await smInitStatus.readValue() === GitInitStatus.fullyInit){
        console.log("Client already initialising. Skipping...");
        return
    }

    console.log("Initialising client");

    if (await smInitStatus.readValue() === GitInitStatus.creatingDir) {
        await mkdir(clientPath, {recursive: false});
        await smInitStatus.writeValue(GitInitStatus.gitInit);
    }
    if (await smInitStatus.readValue() === GitInitStatus.gitInit) {
        await smInitStatus.writeValue(GitInitStatus.gitInitStart);
        console.log("Initialising client git repository");
        await git.init({
            fs: fs,
            dir: clientPath,
            defaultBranch: gitConfig.branch
        });
        await git.addRemote({
            fs: fs,
            dir: clientPath,
            url: gitConfig.repository,
            remote: gitConfig.remote
        });
        console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
        await smInitStatus.writeValue(GitInitStatus.gitInitEnd);
    }
    if (await smInitStatus.readValue() === GitInitStatus.gitInitEnd) {
        await smInitStatus.writeValue(GitInitStatus.fullyInit);
    }
}

function isTimeoutError(error: Error): boolean {
    return (
        (
            ("code" in error && typeof error.code === "string") &&
            [
                "ETIMEDOUT",
                "ECONNRESET",
                "ECONNREFUSED",
                "EAI_AGAIN",
                "UND_ERR_CONNECT_TIMEOUT"
            ].includes(error.code)
        )
        ||
        [
            "Request timed out"
        ].includes(error.message)
    );
}

async function gitSyncLocalBranchWithRemote(
    clientId: string,
    dir: string,
    branch: string,
    localRef: string, remoteHead: string
) {
    const enum SyncStatus {
        idle = "idle",
        writeRef = "write ref",
        checkout = "checkout"
    }

    const smGitSyncStatus = new SMSimpleSequenceVar<string>(
        clientStateMachine,
        `client-${clientId}`,
        `gitSyncStatus`,
        SyncStatus.idle
    );
    if (await smGitSyncStatus.readValue() == SyncStatus.idle) {
        await smGitSyncStatus.writeValue(SyncStatus.writeRef);
    }
    if (await smGitSyncStatus.readValue() === SyncStatus.writeRef) {
        await git.writeRef({
            fs: fs,
            dir: dir,
            ref: localRef,
            value: remoteHead,
            force: true
        });
        await smGitSyncStatus.writeValue(SyncStatus.checkout);
    }
    if (await smGitSyncStatus.readValue() === SyncStatus.checkout) {
        let pBar: SingleBar | undefined;
        await git.checkout({
            fs: fs,
            dir: dir,
            ref: branch,
            force: true,
            onProgress: progress => {
                if (progress.total !== undefined) {
                    if (progress.loaded == 1) {
                        pBar = createProgressBar("Downloading", "E");
                        pBar.start(progress.total, 0);
                    }
                    if (pBar !== undefined) {
                        pBar.update(progress.loaded);
                        if (progress.loaded == progress.total) {
                            pBar.stop();
                        }
                    }
                }
            }
        });
        await smGitSyncStatus.writeValue(SyncStatus.idle);
    }
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

async function updateClient(clientId: string, gitConfig: GitConfig) {
    console.log("Check client for update");

    const enum UpdateState {
        idle = "idle",
        fetch = "fetch",
        checkout = "checkout"
    }

    const clientPath = path.join(process.cwd(), clientId)
    const smUpdateStatus = new SMSimpleSequenceVar<string>(
        clientStateMachine,
        `client-${clientId}`,
        `updateStatus`,
        UpdateState.idle
    );
    const smRemoteHead = new SMSimpleSequenceVar<string>(
        clientStateMachine,
        `client-${clientId}`,
        `remoteHead`,
        ""
    );

    if (await smUpdateStatus.readValue() === UpdateState.idle){
        await smUpdateStatus.writeValue(UpdateState.fetch);
    }

    const branch = gitConfig.branch;
    const remoteRef = `refs/remotes/origin/${branch}`;
    const localRef  = `refs/heads/${branch}`;

    const resolveRef = (ref: string) =>
        git.resolveRef({fs: fs, dir: clientPath, ref: ref}).catch(() => null);

    if (await smUpdateStatus.readValue() === UpdateState.fetch){
        //todo this maybe work bad with retry!!!!
        let pBar: SingleBar | undefined;
        await asyncRetryWrapper(() => git.fetch({
            fs: fs, http: http,
            dir: clientPath,
            onAuth: () => ({
                username: gitConfig.userName,
                password: gitConfig.authKey
            }),
            ref: branch,
            singleBranch: true,
            onProgress: progress => {
                if (progress.total !== undefined) {
                    if (progress.loaded == 1) {
                        pBar = createProgressBar("Fetching", "E");
                        pBar.start(progress.total, 0);
                    }
                    if (pBar !== undefined) {
                        pBar.update(progress.loaded);
                        if (progress.loaded == progress.total) {
                            pBar.stop();
                        }
                    }
                }
            }
            //todo add depth 1 to dev mode
        }), {shouldRetryError: isTimeoutError});

        const remoteHead = await resolveRef(remoteRef);
        const localHead = await resolveRef(localRef)
        if (!remoteHead) throw new Error(`No remote ref of ${remoteRef}`);

        if (localHead === remoteHead) {
            console.log(`${ConsoleOpts.green}Client is already up to date${ConsoleOpts.reset}`);
            await smUpdateStatus.resetValue();
            return;
        }

        await smRemoteHead.writeValue(remoteHead);
        await smUpdateStatus.writeValue(UpdateState.checkout);
    }

    if (await smUpdateStatus.readValue() === UpdateState.checkout){
        const remoteHead = await smRemoteHead.readValue();
        const localHead = await resolveRef(localRef)

        const localVer = localHead ? localHead.slice(0, 7) : "init state";
        const remoteVer = remoteHead.slice(0, 7);
        console.log(
            "Update client" + " " +
            `${ConsoleOpts.cyan}"${localVer}"${ConsoleOpts.reset}` +
            " -> " +
            `${ConsoleOpts.cyan}"${remoteVer}"${ConsoleOpts.reset}`
        );
        await gitSyncLocalBranchWithRemote(clientId, clientPath, branch, localRef, remoteHead);
        await smUpdateStatus.resetValue();
    }
}

