import path from "node:path";
import {launcherConfig} from "../launcher.js";
import {readFile, writeFile} from "node:fs/promises";
import {isFileExists} from "../utils.js";
import {z} from "zod";
import * as MainConfig from "./../main-config.js";

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
}).loose();

const AccountsConfigSchema = z.object({
    accounts: z.array(
        AccountSchema
    ).default([])
}).loose();

type AccountsConfigT = z.infer<typeof AccountsConfigSchema>;

export async function accountsEntry() {
    //todo this is simple test
    const account = await findPlayerAccount();
    if (account != undefined){
        try {
            await activeAccount(account);
            console.log(`Account ${account?.name} activate!`);
        } catch {
            console.log(`Account already ${account?.name} activate!`);
        }
    }
    else {
        console.log("Account not found!");
    }
}

async function findPlayerAccount(): Promise<Account | undefined> {
    const mainConfig = await MainConfig.get();
    const accounts = await getAccountsByName(mainConfig.account.name);
    let accountById: Account | undefined;
    if (mainConfig.account.id !== undefined) {
        accountById = await getAccountById(mainConfig.account.id);
    }
    if (accountById !== undefined) {
        for (const account of accounts) {
            if (accountById.id === account.id) return account;
        }
        return accountById;
    } else {
        if (accounts.length > 0) return accounts[0];
    }
    return undefined;
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

async function saveAccountsJson(data: AccountsConfigT){
    const accountFilePath = getJsonAccountsFilePath();
    await writeFile(accountFilePath, JSON.stringify(data, null, 4))
}

export async function activeAccount(account: Account) {
    if (account.active) throw Error("activeAccount() -> account already active")

    const json = await readAccountsJson();
    if (json === undefined) throw Error("activeAccount() -> accounts json is undefined!");
    const zParsed = AccountsConfigSchema.parse(json);
    for (const zAccount of zParsed.accounts) {
        zAccount.active = zAccount.profile.id === account.id;
    }
    await saveAccountsJson(zParsed);
}

async function getAccounts() {
    let result: Account[] = [];
    const accountJson = await readAccountsJson();
    if (accountJson === undefined) return result;
    const zParsed = AccountsConfigSchema.parse(accountJson);
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