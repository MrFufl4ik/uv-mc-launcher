import fs from "fs/promises";
import * as Path from "node:path";
import {hideFileOnWindows, isFileExists, jsonDeepMerge} from "./utils.js";
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
        let resultData: JSON;
        const jsonFilePath = await this.getStateJsonFilePath();
        if (await isFileExists(jsonFilePath)) {
            try {
                const oldData: JSON = JSON.parse(await fs.readFile(jsonFilePath, {encoding: "utf8"}));
                resultData = jsonDeepMerge(oldData, data);
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

        hideFileOnWindows(jsonFilePath);

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

export class SMSimpleVar<T extends string | number | boolean> {
    protected stateMachine: StateMachine;
    protected readonly valueName: string;
    protected readonly defaultValue: T;

    constructor(stateMachine: StateMachine, valueName: string, defaultValue: T) {
        this.stateMachine = stateMachine;
        this.valueName = valueName;
        this.defaultValue = defaultValue;
    }

    buildJson(value: T): string {
        switch (typeof value) {
            case "string":
                return `{"${this.valueName}":"${value}"}`;
            default:
                return `{"${this.valueName}":${value}}`;
        }
    }

    async writeValue(value: T): Promise<void> {
        await this.stateMachine.writeState(JSON.parse(this.buildJson(value)));
    }

    async readValue(): Promise<T> {
        const state = await this.stateMachine.readState();
        if (state === undefined) return this.defaultValue;
        const stateOfRecord = state as unknown as Record<string, unknown>;
        const value = stateOfRecord[this.valueName];
        if (value === undefined || typeof value !== typeof this.defaultValue) {
            return this.defaultValue;
        }
        return value as T;
    }

    async resetValue(): Promise<void> {
        await this.stateMachine.writeState(JSON.parse(this.buildJson(this.defaultValue)));
    }
}

export class SMSimpleSequenceVar<T extends string | number | boolean> extends SMSimpleVar<T> {
    protected sequenceName: string;

    constructor(stateMachine: StateMachine, sequenceName: string, valueName: string, defaultValue: T) {
        super(stateMachine, valueName, defaultValue);
        this.sequenceName = sequenceName;
    }

    buildJson(value: T): string {
        switch (typeof value) {
            case "string":
                return `{"${this.sequenceName}":{"${this.valueName}":"${value}"}}`;
            default:
                return `{"${this.sequenceName}":{"${this.valueName}":${value}}}`;
        }
    }

    async readValue(): Promise<T> {
        const state = await this.stateMachine.readState();
        if (state === undefined) return this.defaultValue;

        const stateOfRecord = state as unknown as Record<string, unknown>;
        const sequence = stateOfRecord[this.sequenceName];
        if (sequence === undefined || typeof sequence !== "object") {
            return this.defaultValue;
        }

        const sequenceRecord = sequence as Record<string, unknown>;
        const value = sequenceRecord[this.valueName];
        if (value === undefined || typeof value !== typeof this.defaultValue) {
            return this.defaultValue;
        }

        return value as T;
    }
}