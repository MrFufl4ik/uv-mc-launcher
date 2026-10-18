import path from "node:path";
import {launcherConfig} from "../launcher.js";
import {readFile, rename, writeFile} from "node:fs/promises";
import {isFileExists} from "../utils/misc.js";
import {z} from "zod";
import * as MainConfig from "./../main-config.js";
import {Buffer} from "node:buffer";
import {createHash, randomBytes} from "node:crypto";
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

export async function accountsEntry() {
    //todo this is simple business logic
    const mainConfig = await MainConfig.get();
    const account = await findUserAccount({name: mainConfig.account.name, id: mainConfig.account.id});
    if (account != undefined) {
        try {
            await activeAccount(account);
            console.log(`Account ${account?.name} activate!`);
        } catch {
            console.log(`Account already ${account?.name} activate!`);
        }
    } else {
        const newAccount = await createOfflineAccount(mainConfig.account.name);
        await activeAccount(newAccount);
        console.log(`New account ${newAccount.name} created!`);
    }
}

type FindUserAccountOptions = {
    name: string,
    id: string | undefined;
}

async function findUserAccount(findUserAccountOptions: FindUserAccountOptions): Promise<Account | undefined> {
    const accounts = await getAccountsByName(findUserAccountOptions.name);
    let accountById: Account | undefined;
    if (findUserAccountOptions.id !== undefined) accountById = await getAccountById(findUserAccountOptions.id);
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

async function saveAccountsJson(data: ZAccountsConfigT) {
    const accountsFilePath = getJsonAccountsFilePath();

    const atomicJsonFilePath = path.join(getTempPath(), `${path.basename(accountsFilePath)}.tmp`);
    await writeFile(atomicJsonFilePath, JSON.stringify(data, null, 4));
    await rename(atomicJsonFilePath, accountsFilePath);
}

function fromRfc4122(bytes: Buffer): string {
    if (bytes.length !== 16) {
        throw new Error(`fromRfc4122() -> expects exactly 16 bytes, got ${bytes.length}!`);
    }
    return Buffer.from(bytes).toString("hex");
}

function createUuid128(): string {
    return Buffer.from(randomBytes(16)).toString("hex");
}

function uuid128FromUsername(userName: string): string {
    const input = `OfflinePlayer:${userName}`;

    const digest: Buffer = createHash("md5").update(Buffer.from(input, "utf8")).digest();

    const bOr = (array: Buffer, index: number, value: number): void => {
        if (array[index] !== undefined) array[index] |= value;
    };
    const bAnd = (array: Buffer, index: number, value: number): void => {
        if (array[index] !== undefined) array[index] &= value;
    };

    bAnd(digest, 6, 0x0f);  // clear version
    bOr(digest, 6, 0x30);   // set to version 3
    bAnd(digest, 8, 0x3f);  // clear variant
    bOr(digest, 8, 0x80);   // set to IETF variant

    return fromRfc4122(digest);
}

function unixTimestamp(): number {
    return Math.floor(Date.now() / 1000);
}

async function createOfflineAccount(userName: string): Promise<Account> {
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