import path from "node:path";
import {launcherConfig} from "../launcher.js";
import {readFile} from "node:fs/promises";
import {isFileExists} from "../utils.js";
import {z} from "zod";

class BaseAccount {
    readonly id: string;
    readonly name: string;

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
    }
}

const AccountsConfigSchema = z.object({
    accounts: z.array(
        z.object({
            profile: z.object({
                id: z.string(),
                name: z.string()
            }),
            type: z.enum(["Offline", "Online"])
        })
    ).default([])
})

function getAccountsFilePath() {
    return path.join(launcherConfig.path, "accounts.json");
}

async function readAccountsJson(): Promise<JSON | undefined> {
    const accountFilePath = getAccountsFilePath();
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
    let result: BaseAccount[] = [];
    const accountJson = await readAccountsJson();
    if (accountJson === undefined) return result;
    const config = AccountsConfigSchema.parse(accountJson);
    for (const zAccount of config.accounts){
        result.push(new BaseAccount(zAccount.profile.id, zAccount.profile.name));
    }
    return result;
}

export async function getOfflineAccountByName(name: string): Promise<BaseAccount | undefined> {
    const accounts = await getAccounts()
    for (const account of accounts){
        if (account.name == name){
            return account;
        }
    }
    return undefined;
}