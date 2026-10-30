import {z} from "zod";
import {colorizeString} from "./formating.js";

const TranslationSchema = z.object({
    base: z.object({
        gapLine: z.string(),
        operationSuccessful: z.string(),
        download: z.string(),
        extract: z.string()
    }),
    dev: z.object({
        client: z.object({
            gitNotConfigured: z.string()
        })
    }),
    exit: z.object({
        pressEnterToExit: z.string(),
        successfulExit: z.string(),
        runtimeError: z.string(),
    }),
    errors: z.object({
        applicationAlreadyStarted: z.string(),
        notSupportedPlatform: z.string(),
        mainConfigNotCreated: z.string(),
        invalidAccountName: z.string(),
        archiveCannotOpen: z.string(),
        clientNotDefinedInMainConfig: z.string()
    }),
    progressBars: z.object({
        download: z.string(),
        extract: z.string(),
        fetch: z.string(),
    }),
    account: z.object({
        activate: z.string(),
        newAccountCreated: z.string(),
    }),
    client: z.object({
        checkToUpDate: z.string(),
        initLocalRepo: z.string(),
        programUpdated: z.string(),
        programAlreadyUpToDate: z.string()
    }),
    launcher: z.object({
        installingLauncher: z.string(),
        installingDefaultConfigs: z.string()
    }),
    requirements: z.object({
        pleaseInstallGit: z.string(),
        installingMingit: z.string()
    }),
    runGame: z.object({
        makingPrismLauncherInstance: z.string(),
        fileForClientNotFound: z.string(),
        entryFoundedInInstances: z.string(),
        runningGame: z.string()
    })
}).default({
    base: {
        gapLine: "<gray>-----------------------</gray>",
        operationSuccessful: "<green>Operation complete successful</green>",
        download: "Download file %s to %s",
        extract: "Extracting archive %s to %s",
    },
    dev: {
        client: {
            gitNotConfigured: "<yellow><underline>Git not configured for this client!</underline></yellow>"
        }
    },
    exit: {
        pressEnterToExit: "Press Enter to exit...",
        successfulExit: "<bold>All operation's complete, exit...</bold>",
        runtimeError: `<red>Runtime error (contact to developer):</red> "%s"`,
    },
    errors: {
        applicationAlreadyStarted: "<red>Application already started!</red>",
        notSupportedPlatform:
            "<red>This software was not developed for your platform.</red>\n" +
            "If you want to use your platform, you can modify the software for your platform and " +
            "submit a PR to <underline>https://github.com/mrfufl4ik/uv-mc-launcher</underline>. TY.",
        mainConfigNotCreated: "<red>Please create a config.yaml file!</red>",
        invalidAccountName: `<red>Account name "%s" is not valid!</red>`,
        archiveCannotOpen: "<red>Archive %s cannot be open by this program</red>",
        clientNotDefinedInMainConfig: `<red>Client "%s" not found in config</red>`,
    },
    progressBars: {
        download: "Downloading",
        extract: "Extracting",
        fetch: "Updating",
    },
    account: {
        activate: "Account %s activated",
        newAccountCreated: "New account %s created",
    },
    client: {
        checkToUpDate: "Start checking client for updates process",
        initLocalRepo: "Start initializing local repository",
        programUpdated: `Client updated <cyan>"%s"</cyan> -> <cyan>%s</cyan>`,
        programAlreadyUpToDate: "<green>Client is already up to date</green>",
    },
    launcher: {
        installingLauncher: "Start installing launcher process",
        installingDefaultConfigs: "Installing default configs",
    },
    requirements: {
        pleaseInstallGit: "Install git (version control program). And add it to path.",
        installingMingit: "Start installing mingit process",
    },
    runGame: {
        makingPrismLauncherInstance: "Making prism launcher instance",
        fileForClientNotFound: `<red>Files for client: "%S" not found!</red>`,
        entryFoundedInInstances: `<yellow>Entry "%s" founded in instances place. Symlink will not be created!</yellow>`,
        runningGame: "Running game",
    }
});

type TranslationT = z.infer<typeof TranslationSchema>;

class Translation {
    protected currentTranslation: TranslationT;
    protected id: string = "en_US";

    constructor() {
        this.currentTranslation = TranslationSchema.parse(undefined);
        this.applyFormatingToTranslation(this.currentTranslation);
    }

    getTranslationId(): string{
        return this.id;
    }

    private applyFormatingToTranslation(obj: Record<string, unknown>) {
        for (const [key, value] of Object.entries(obj)) {
            if (value !== null){
                if (typeof value === "object" && !Array.isArray(value))
                    this.applyFormatingToTranslation(value as Record<string, unknown>);
                else if (typeof value === "string")
                    obj[key] = colorizeString(value);
            }
        }
    }

    getTranslation(): TranslationT {
        return this.currentTranslation;
    }

    setTranslation(id: string, json: JSON) {
        this.id = id;
        this.currentTranslation = TranslationSchema.parse(json);
        this.applyFormatingToTranslation(this.currentTranslation);
    }
}

export let trSingle = new Translation();