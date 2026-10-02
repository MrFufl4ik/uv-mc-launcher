import {mkdir, rm} from "node:fs/promises";
import git from "isomorphic-git";
import fs from "fs";
import path from "node:path";
import {isDirectoryExists, asyncRetryWrapper, ConsoleOpts, createProgressBar} from "./utils.js";
import http from "isomorphic-git/http/node";
import {SMSimpleStatus, SMSimpleStringVar, StateMachine} from "./statemachine.js";
import type {SingleBar} from "cli-progress";

let clientConfig = {
    path: path.join(process.cwd(), "client"),
    gitBranch: "main",
    gitRemote: "origin",
    gitUserName: "rockrezator",
    gitAuthKey: "e9646ad8ecb4ada84d6c02c064cab70513d46bd5",
    gitRepository: "https://git.croakland.ru/mrfufl4ik/croakfront-client.git"
};

const clientStateMachine = new StateMachine("client");

export async function clientEntry() {
    await initClient();
    await updateClient();
}

const enum InitStatus {
    creatingDir = "creating dir",
    gitInit = "git init",
    gitInitStart = "git init start",
    gitInitEnd = "git init end",
    fullyInit = "fully init"
}

async function initClient() {
    console.log("Initialising client");

    const initStatus = new SMSimpleStringVar(clientStateMachine, "initStatus", InitStatus.creatingDir);

    if (!await isDirectoryExists(clientConfig.path)) {
        await initStatus.resetValue();
    } else if (!await isDirectoryExists(path.join(clientConfig.path, ".git"))) {
        await initStatus.writeValue(InitStatus.gitInit);
    } else if (await initStatus.readValue() === InitStatus.gitInitStart) {
        await rm(path.join(clientConfig.path, ".git"));
        await initStatus.writeValue(InitStatus.gitInit);
    } else if (await initStatus.readValue() === InitStatus.fullyInit){
        return
    }

    if (await initStatus.readValue() === InitStatus.creatingDir) {
        await mkdir(clientConfig.path, {recursive: false});
        await initStatus.writeValue(InitStatus.gitInit);
    }
    if (await initStatus.readValue() === InitStatus.gitInit) {
        await initStatus.writeValue(InitStatus.gitInitStart);
        console.log("Initialising git repository");
        await git.init({
            fs: fs,
            dir: clientConfig.path,
            defaultBranch: clientConfig.gitBranch
        });
        await git.addRemote({
            fs: fs,
            dir: clientConfig.path,
            url: clientConfig.gitRepository,
            remote: clientConfig.gitRemote
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
    dir: string,
    branch: string,
    localRef: string, remoteHead: string
) {
    const enum SyncStatus {
        idle = "idle",
        writeRef = "write ref",
        checkout = "checkout"
    }

    const gitSyncStatus = new SMSimpleStringVar(clientStateMachine, "gitSyncStatus", SyncStatus.idle);
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

async function updateClient() {
    console.log("Check client for update");

    const enum UpdateStatus {
        idle = "idle",
        fetch = "fetch",
        checkout = "checkout"
    }

    const updateStatus = new SMSimpleStringVar(clientStateMachine, "updateStatus", UpdateStatus.idle);
    const updateTarget = new SMSimpleStringVar(clientStateMachine, "updateTarget", "");

    if (await updateStatus.readValue() === UpdateStatus.idle){
        await updateStatus.writeValue(UpdateStatus.fetch);
    }

    const branch = clientConfig.gitBranch;
    const remoteRef = `refs/remotes/origin/${branch}`;
    const localRef  = `refs/heads/${branch}`;

    const resolveRef = (ref: string) =>
        git.resolveRef({fs: fs, dir: clientConfig.path, ref: ref}).catch(() => null);

    if (await updateStatus.readValue() === UpdateStatus.fetch){
        await asyncRetryWrapper(() => git.fetch({
            fs: fs, http: http,
            dir: clientConfig.path,
            onAuth: () => ({
                username: clientConfig.gitUserName,
                password: clientConfig.gitAuthKey
            }),
            ref: branch,
            singleBranch: true
        }), {shouldRetryError: isTimeoutError});

        const remoteHead = await resolveRef(remoteRef);
        const localHead = await resolveRef(localRef)
        if (!remoteHead) throw new Error(`No remote ref of ${remoteRef}`);

        if (localHead === remoteHead) {
            console.log("Client is already up to date");
            await updateStatus.writeValue(UpdateStatus.idle);
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
        await gitSyncLocalBranchWithRemote(clientConfig.path, branch, localRef, remoteHead);
        await updateStatus.writeValue(UpdateStatus.idle);
    }
}

