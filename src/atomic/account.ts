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
import {formatString} from "../api/console/formating.js";
import {trSingle} from "../api/console/translation.js";

export async function accountsEntry() {
    const mainConfig = await MainConfig.get();
    if (!isValidUsername(mainConfig.account.name)) {
        console.log(formatString(trSingle.getTranslation().errors.invalidAccountName, mainConfig.account.name));
        exitWithPause(1);
    }
    const account = await findUserAccount(mainConfig.account.name, mainConfig.account.id);
    if (account != undefined) {
        try {
            await activeAccount(account);
            console.log(formatString(trSingle.getTranslation().account.activate, account.name));
        } catch {}
    } else {
        const newAccount = await createOfflineAccount(mainConfig.account.name);
        await activeAccount(newAccount);
        console.log(formatString(trSingle.getTranslation().account.newAccountCreated), newAccount.name);
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