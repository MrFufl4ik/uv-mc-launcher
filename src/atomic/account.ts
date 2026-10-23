import * as MainConfig from "../api/main-config.js";
import {ConsoleOpts} from "../api/misc.js";
import {exitWithPause} from "../index.js";
import {
    Account,
    activeAccount,
    createOfflineAccount,
    getAccountById,
    getAccountsByName,
    isValidUsername
} from "../api/account.js";

export async function accountsEntry() {
    const mainConfig = await MainConfig.get();
    if (!isValidUsername(mainConfig.account.name)) {
        console.log(`${ConsoleOpts.yellow}Account name "${mainConfig.account.name}" is not valid!${ConsoleOpts.yellow}`);
        exitWithPause(1);
    }
    const account = await findUserAccount(mainConfig.account.name, mainConfig.account.id);
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
    console.log(`${ConsoleOpts.green}Done${ConsoleOpts.reset}`);
}

async function findUserAccount(name: string, id: string | undefined): Promise<Account | undefined> {
    const accounts = await getAccountsByName(name);
    let accountById: Account | undefined;
    if (id !== undefined) accountById = await getAccountById(id);
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