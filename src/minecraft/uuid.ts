import {Buffer} from "node:buffer";
import {createHash, randomBytes} from "node:crypto";

export function createRfc4122(bytes: Buffer): string {
    if (bytes.length !== 16) {
        throw new Error(`fromRfc4122() -> expects exactly 16 bytes, got ${bytes.length}!`);
    }
    return Buffer.from(bytes).toString("hex");
}

export function createUuid128(): string {
    return Buffer.from(randomBytes(16)).toString("hex");
}

export function uuid128FromUsername(userName: string): string {
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

    return createRfc4122(digest);
}