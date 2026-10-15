import path from "node:path";
import {launcherConfig} from "../launcher.js";
import {readFile} from "node:fs/promises";
import {isFileExists, jsonDeepMerge} from "../utils.js";
import {z} from "zod";
import fs from "fs/promises";
import {getTempPath} from "../temp.js";

enum AccountType {
    online = "Online",
    offline = "Offline"
}

function parseAccountType(s: string) {
    return Object.values(AccountType).find(element => element === s);
}

class Account {
    readonly id: string;
    readonly name: string;
    readonly type: AccountType;
    readonly active: boolean;

    constructor(id: string, name: string, type: AccountType, active: boolean) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.active = active;
    }
}

const AccountSchema = z.object({
    active: z.boolean().optional(),
    entitlement: z.object({
        canPlayMinecraft: z.boolean(),
        ownsMinecraft: z.boolean()
    }).default({canPlayMinecraft: true, ownsMinecraft: true}),
    profile: z.object({
        id: z.string(),
        name: z.string(),
        skin: z.object({
            id: z.string(),
            url: z.string(),
            variant: z.string()
        }).default({id: "", url: "", variant: ""}),
        capes: z.array(z.string()).default([])
    }),
    type: z.enum([AccountType.offline, AccountType.online])
})

const AccountsConfigSchema = z.object({
    accounts: z.array(
        AccountSchema
    ).default([])
});

function getJsonAccountsFilePath() {
    return path.join(launcherConfig.path, "accounts.json");
}

export async function writeAccountJson(data: JSON) {
    let resultData: JSON;
    const jsonFilePath = getJsonAccountsFilePath();
    if (await isFileExists(jsonFilePath)) {
        try {
            const oldData: JSON = JSON.parse(await fs.readFile(jsonFilePath, {encoding: "utf8"}));
            resultData = jsonDeepMerge(oldData, data);
        } catch {
            throw Error(`writeAccountJson() -> json data in ${jsonFilePath} is broken.`);
        }
    } else {
        resultData = {...data};
    }

    const atomicJsonFilePath = path.join(getTempPath(), `${path.basename(jsonFilePath)}.tmp`);
    await fs.writeFile(
        atomicJsonFilePath,
        JSON.stringify(resultData, null, 4)
    );
    await fs.rename(atomicJsonFilePath, jsonFilePath);
}

async function readAccountsJson(): Promise<JSON | undefined> {
    const accountFilePath = getJsonAccountsFilePath();
    if (await isFileExists(accountFilePath)) {
        try {
            return JSON.parse(await readFile(accountFilePath, {encoding: "utf8"}));
        } catch {
            return undefined;
        }
    }
    return undefined;
}

async function getAccounts() {
    let result: Account[] = [];
    const accountJson = await readAccountsJson();
    if (accountJson === undefined) return result;
    const config = AccountsConfigSchema.parse(accountJson);
    for (const zAccount of config.accounts) {
        const accountType = parseAccountType(zAccount.type);
        if (accountType === undefined) {
            throw Error("getAccount() -> accountType not equals to AccountType enum declaration. :(");
        }
        const accountActive = zAccount.active !== undefined && zAccount.active;
        result.push(new Account(zAccount.profile.id, zAccount.profile.name, accountType, accountActive));
    }
    return result;
}

export async function getAccountByName(name: string): Promise<Account | undefined> {
    const accounts: Account[] = await getAccounts();
    for (const account of accounts) {
        if (account.name === name) return account;
    }
    return undefined;
}

export async function getAccountById(id: string): Promise<Account | undefined> {
    const accounts: Account[] = await getAccounts();
    for (const account of accounts) {
        if (account.id === id) return account;
    }
    return undefined;
}