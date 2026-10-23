import path from "node:path";
import {readFile, rename, writeFile} from "node:fs/promises";
import {isFileExists, unixTimestamp} from "./misc.js";
import {z} from "zod";
import {getTempPath} from "./temp.js";
import {createUuid128, uuid128FromUsername} from "./minecraft/uuid.js";
import {launcherConfig} from "../atomic/launcher.js";

enum AccountType {
    online = "Online",
    offline = "Offline"
}

function parseAccountType(s: string) {
    return Object.values(AccountType).find(element => element === s);
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
    type: z.enum([AccountType.offline, AccountType.online]),
    ygg: z.object({
        extra: z.object({
            clientToken: z.string(),
            userName: z.string()
        }).optional(),
        iat: z.number(),
        token: z.string()
    })
}).loose();
type ZAccountT = z.infer<typeof AccountSchema>;

const AccountsConfigSchema = z.object({
    accounts: z.array(
        AccountSchema
    ).default([]),
    formatVersion: z.number().default(3)
}).loose();
type ZAccountsConfigT = z.infer<typeof AccountsConfigSchema>;

export class Account {
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


function getJsonAccountsFilePath() {
    return path.join(launcherConfig.path, "accounts.json");
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

async function saveAccountsJson(data: ZAccountsConfigT) {
    const accountsFilePath = getJsonAccountsFilePath();

    const atomicJsonFilePath = path.join(getTempPath(), `${path.basename(accountsFilePath)}.tmp`);
    await writeFile(atomicJsonFilePath, JSON.stringify(data, null, 4));
    await rename(atomicJsonFilePath, accountsFilePath);
}

export function isValidUsername(userName: string): Boolean {
    const regex = /^[A-Za-z0-9_]{3,16}$/;
    return regex.test(userName);
}

export async function createOfflineAccount(userName: string): Promise<Account> {
    const json = await readAccountsJson();
    let zData: ZAccountsConfigT = AccountsConfigSchema.parse(json !== undefined ? json : {});
    const account: ZAccountT = AccountSchema.parse({
        profile: {
            id: uuid128FromUsername(userName),
            name: userName,
        },
        type: "Offline",
        ygg: {
            extra: {
                clientToken: createUuid128(),
                userName: userName
            },
            iat: unixTimestamp(),
            token: "0"
        }
    });
    zData.accounts.push(account);
    await saveAccountsJson(zData);
    return new Account(account.profile.id, account.profile.name, account.type, false);
}

export async function activeAccount(account: Account) {
    if (account.active) throw Error("activeAccount() -> account already active");

    const json = await readAccountsJson();
    if (json === undefined) throw Error("activeAccount() -> accounts json is undefined!");
    const zParsed: ZAccountsConfigT = AccountsConfigSchema.parse(json);
    for (const zAccount of zParsed.accounts) {
        zAccount.active = zAccount.profile.id === account.id;
    }
    await saveAccountsJson(zParsed);
}

async function getAccounts() {
    let result: Account[] = [];
    const json = await readAccountsJson();
    if (json === undefined) return result;
    const zParsed: ZAccountsConfigT = AccountsConfigSchema.parse(json);
    for (const zAccount of zParsed.accounts) {
        const accountType = parseAccountType(zAccount.type);
        if (accountType === undefined) {
            throw Error("getAccount() -> accountType not equals to AccountType enum declaration!");
        }
        const accountActive = zAccount.active !== undefined && zAccount.active;
        result.push(new Account(zAccount.profile.id, zAccount.profile.name, accountType, accountActive));
    }
    return result;
}

export async function getAccountsByName(name: string): Promise<Account[]> {
    const accounts: Account[] = await getAccounts();
    let result: Account[] = [];
    for (const account of accounts) {
        if (account.name === name) result.push(account);
    }
    return result;
}

export async function getAccountById(id: string): Promise<Account | undefined> {
    const accounts: Account[] = await getAccounts();
    for (const account of accounts) {
        if (account.id === id) return account;
    }
    return undefined;
}