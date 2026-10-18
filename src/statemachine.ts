import {hideFileOnWindows, isFileExists} from "./utils/misc.js";
import {readFile, rename, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {getTempPath} from "./temp.js";

export function jsonDeepMerge(target: any, source: any): JSON {
    const result = {...target};
    for (const key in source) {
        if (
            source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key])
        ) {
            result[key] = jsonDeepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

export class StateMachine {
    private name: string = "";

    constructor(name: string) {
        this.name = name;
    }

    getStateJsonFilePath() {
        return path.join(process.cwd(), `.${this.name.toLowerCase()}-state.json`);
    }

    async writeState(data: JSON): Promise<JSON> {
        let resultData: JSON;
        const jsonFilePath = this.getStateJsonFilePath();
        if (await isFileExists(jsonFilePath)) {
            try {
                const oldData: JSON = JSON.parse(await readFile(jsonFilePath, {encoding: "utf8"}));
                resultData = jsonDeepMerge(oldData, data);
            } catch {
                console.log(`Json data in ${jsonFilePath} is broken`);
                await rm(jsonFilePath, {force: true, recursive: false});
                resultData = {...data};
            }
        } else {
            resultData = {...data};
        }

        const atomicJsonFilePath = path.join(getTempPath(), `${path.basename(jsonFilePath)}.tmp`);
        await writeFile(
            atomicJsonFilePath,
            JSON.stringify(resultData, null, 4)
        );
        await rename(atomicJsonFilePath, jsonFilePath);

        hideFileOnWindows(jsonFilePath);

        return resultData;
    }

    async readState(): Promise<JSON | undefined> {
        const jsonFilePath = this.getStateJsonFilePath();
        if (await isFileExists(jsonFilePath)) {
            try {
                return JSON.parse(await readFile(jsonFilePath, {encoding: "utf8"}));
            } catch {
                return undefined;
            }
        }
        return undefined;
    }

    async clearState() {
        await rm(this.getStateJsonFilePath(), {force: true, recursive: false});
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