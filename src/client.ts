import {mkdir, rm} from "node:fs/promises";
import git from "isomorphic-git";
import fs from "fs";
import path from "node:path";
import {isDirectoryExists, asyncRetryWrapper, ConsoleOpts, createProgressBar} from "./utils.js";
import http from "isomorphic-git/http/node";
import {SMSimpleStringVar, StateMachine} from "./statemachine.js";
import type {SingleBar} from "cli-progress";
import * as MainConfig from "./main-config.js";

type GitConfig = {
    repository: string,
    branch: string,
    remote: string,
    userName: string,
    authKey: string,
}

const clientStateMachine = new StateMachine("client");

const mainConfig = await MainConfig.get();
function getClientByClientId(clientId: string){
    for (const client of mainConfig.clients){
        if (client.id == clientId) return client;
    }
    return null;
}

export async function clientEntry() {
    const clientId = mainConfig.run.clientId;
    const client = getClientByClientId(clientId)
    if (client === null){
        console.log(`Client '${clientId}' not found in config!`)
        process.exit(880001)
    }
    if (client.git === undefined){
        console.log(`Git not configured for client`)
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

const enum InitStatus {
    creatingDir = "creating dir",
    gitInit = "git init",
    gitInitStart = "git init start",
    gitInitEnd = "git init end",
    fullyInit = "fully init"
}

async function initGitClient(clientId: string, gitConfig: GitConfig) {
    const initStatus = new SMSimpleStringVar(
        clientStateMachine,
        `${clientId}-initGitStatus`,
        InitStatus.creatingDir
    );
    const clientPath = path.join(process.cwd(), clientId)

    if (!await isDirectoryExists(clientPath)) {
        await initStatus.resetValue();
    } else if (!await isDirectoryExists(path.join(clientPath, ".git"))) {
        await initStatus.writeValue(InitStatus.gitInit);
    } else if (await initStatus.readValue() === InitStatus.gitInitStart) {
        await rm(path.join(clientPath, ".git"));
        await initStatus.writeValue(InitStatus.gitInit);
    } else if (await initStatus.readValue() === InitStatus.fullyInit){
        console.log("Client already initialising. Skipping");
        return
    }

    console.log("Initialising client");

    if (await initStatus.readValue() === InitStatus.creatingDir) {
        await mkdir(clientPath, {recursive: false});
        await initStatus.writeValue(InitStatus.gitInit);
    }
    if (await initStatus.readValue() === InitStatus.gitInit) {
        await initStatus.writeValue(InitStatus.gitInitStart);
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
        await initStatus.writeValue(InitStatus.gitInitEnd);
    }
    if (await initStatus.readValue() === InitStatus.gitInitEnd) {
        await initStatus.writeValue(InitStatus.fullyInit);
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

    const gitSyncStatus = new SMSimpleStringVar(
        clientStateMachine,
        `${clientId}-gitSyncStatus`,
        SyncStatus.idle
    );
    if (await gitSyncStatus.readValue() == SyncStatus.idle) {
        await gitSyncStatus.writeValue(SyncStatus.writeRef);
    }
    if (await gitSyncStatus.readValue() === SyncStatus.writeRef) {
        await git.writeRef({
            fs: fs,
            dir: dir,
            ref: localRef,
            value: remoteHead,
            force: true
        });
        await gitSyncStatus.writeValue(SyncStatus.checkout);
    }
    if (await gitSyncStatus.readValue() === SyncStatus.checkout) {
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
        await gitSyncStatus.writeValue(SyncStatus.idle);
    }
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

async function updateClient(clientId: string, gitConfig: GitConfig) {
    console.log("Check client for update");

    const enum UpdateStatus {
        idle = "idle",
        fetch = "fetch",
        checkout = "checkout"
    }

    const clientPath = path.join(process.cwd(), clientId)

    const updateStatus = new SMSimpleStringVar(clientStateMachine, `${clientId}-updateStatus`, UpdateStatus.idle);
    const updateTarget = new SMSimpleStringVar(clientStateMachine, `${clientId}-updateTarget`, "");

    if (await updateStatus.readValue() === UpdateStatus.idle){
        await updateStatus.writeValue(UpdateStatus.fetch);
    }

    const branch = gitConfig.branch;
    const remoteRef = `refs/remotes/origin/${branch}`;
    const localRef  = `refs/heads/${branch}`;

    const resolveRef = (ref: string) =>
        git.resolveRef({fs: fs, dir: clientPath, ref: ref}).catch(() => null);

    if (await updateStatus.readValue() === UpdateStatus.fetch){
        await asyncRetryWrapper(() => git.fetch({
            fs: fs, http: http,
            dir: clientPath,
            onAuth: () => ({
                username: gitConfig.userName,
                password: gitConfig.authKey
            }),
            ref: branch,
            singleBranch: true
        }), {shouldRetryError: isTimeoutError});

        const remoteHead = await resolveRef(remoteRef);
        const localHead = await resolveRef(localRef)
        if (!remoteHead) throw new Error(`No remote ref of ${remoteRef}`);

        if (localHead === remoteHead) {
            console.log("Client is already up to date");
            await updateStatus.resetValue();
            return;
        }

        await updateTarget.writeValue(remoteHead);
        await updateStatus.writeValue(UpdateStatus.checkout);
    }

    if (await updateStatus.readValue() === UpdateStatus.checkout){
        const remoteHead = await updateTarget.readValue();
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
        await updateStatus.resetValue();
    }
}

