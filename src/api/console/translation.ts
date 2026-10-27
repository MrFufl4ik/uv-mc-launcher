import {z} from "zod";
import {colorizeString} from "./formating.js";

const TranslationSchema = z.object({
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
        programUpToDate: z.string()
    })
}).default({
    exit: {
        pressEnterToExit: "Press Enter to exit...",
        successfulExit: "<green>All operation's done successful!</green>",
        runtimeError: "<red>Runtime error (contact to developer):</red>",
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
        checkToUpDate: "Start checking client for updates",
        initLocalRepo: "Initializing local repository",
        programUpToDate: "<green>Client is already up to date</green>",
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