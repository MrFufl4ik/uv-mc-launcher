import fs from "fs/promises";
import * as Path from "node:path";
import {hideFileOnWindows, isFileExists} from "./utils.js";
import {rm} from "node:fs/promises";

export class StateMachine {
    private name: string = "";

    constructor(name: string) {
        this.name = name;
    }

    async getStateJsonFilePath(): Promise<string> {
        return Path.join(process.cwd(), `.${this.name.toLowerCase()}-state.json`);
    }

    async writeState(data: JSON): Promise<JSON> {
        let resultData: JSON | undefined;
        const jsonFilePath = await this.getStateJsonFilePath();
        if (await isFileExists(jsonFilePath)) {
            try {
                const oldData: JSON = JSON.parse(await fs.readFile(jsonFilePath, {encoding: "utf8"}));
                resultData = {
                    ...oldData,
                    ...data
                };
            } catch {
                console.log(`Json data in ${jsonFilePath} is broken`);
                fs.rm(jsonFilePath, {force: true, recursive: false});
                resultData = {...data};
            }
        } else {
            resultData = {...data};
        }

        const atomicJsonFilePath = `${jsonFilePath}.tmp`;
        await fs.writeFile(
            atomicJsonFilePath,
            JSON.stringify(resultData, null, 4)
        );
        await fs.rename(atomicJsonFilePath, jsonFilePath);

        hideFileOnWindows(jsonFilePath)

        return resultData;
    }

    async readState(): Promise<JSON | undefined> {
        const jsonFilePath = await this.getStateJsonFilePath();
        if (await isFileExists(jsonFilePath)) {
            try {
                return JSON.parse(await fs.readFile(jsonFilePath, {encoding: "utf8"}));
            } catch {
                return undefined;
            }
        }
        return undefined;
    }

    async clearState() {
        await rm(await this.getStateJsonFilePath(), {force: true, recursive: false});
    }
}

export class SMSimpleStatus {
    private stateMachine: StateMachine;
    private readonly defaultStatus: string;

    constructor(stateMachine: StateMachine, defaultStatus: string) {
        this.stateMachine = stateMachine;
        this.defaultStatus = defaultStatus;
    }

    buildStatusJson(status: string) {
        return `{"status": "${status}"}`;
    }

    async writeStatus(status: string): Promise<void> {
        await this.stateMachine.writeState(JSON.parse(this.buildStatusJson(status)));
    }

    async readStatus(): Promise<string> {
        const state = await this.stateMachine.readState();
        if (
            state != undefined &&
            "status" in state &&
            typeof state.status === "string"
        ) {
            return state.status;
        }
        return this.defaultStatus;
    }

    async resetStatus(): Promise<void> {
        await this.stateMachine.writeState(JSON.parse(this.buildStatusJson(this.defaultStatus)));
    }
}

export class SMSimpleStringVar {
    private stateMachine: StateMachine;
    private readonly varName: string;
    private readonly defaultValue: string;

    constructor(stateMachine: StateMachine, varName: string, defaultValue: string) {
        this.stateMachine = stateMachine;
        this.defaultValue = defaultValue;
        this.varName = varName;
    }

    buildVarJson(value: string) {
        return `{"${this.varName}": "${value}"}`;
    }

    async writeValue(value: string): Promise<void> {
        await this.stateMachine.writeState(JSON.parse(this.buildVarJson(value)));
    }

    async readValue(): Promise<string> {
        const state = await this.stateMachine.readState();
        if (state === undefined) return this.defaultValue;
        const stateOfRecord = state as unknown as Record<string, unknown>;
        const value = stateOfRecord[this.varName];
        return typeof value === "string" ? value : this.defaultValue;
    }

    async resetValue(): Promise<void> {
        await this.stateMachine.writeState(JSON.parse(this.buildVarJson(this.defaultValue)));
    }
}