import * as utils from "@actions/cache/lib/internal/cacheUtils";
import { CompressionMethod } from "@actions/cache/lib/internal/constants";
import * as core from "@actions/core";
import assert from "assert";
import * as minio from "minio";

import { State } from "../state";

export const RefKey = "GITHUB_REF";

export enum Events {
    Key = "GITHUB_EVENT_NAME",
    Push = "push",
    PullRequest = "pull_request"
}

export function isGhes(): boolean {
    const ghUrl = new URL(
        process.env["GITHUB_SERVER_URL"] || "https://github.com"
    );
    return ghUrl.hostname.toUpperCase() !== "GITHUB.COM";
}

const isDefined = (i: unknown) => !!i;
const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_SESSION_TOKEN,
    AWS_DEFAULT_REGION,
    AWS_REGION
} = process.env;

if (getInputAsBoolean("requrie_aws_login")) {
    assert(
        [
            AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY,
            AWS_SESSION_TOKEN,
            AWS_DEFAULT_REGION,
            AWS_REGION
        ].every(isDefined),
        "Missing required environment value. Are you perform aws login?"
    );
}

export function newMinio({
    accessKey,
    secretKey,
    sessionToken
}: {
    accessKey?: string;
    secretKey?: string;
    sessionToken?: string;
} = {}) {
    return new minio.Client({
        endPoint: core.getInput("endpoint"),
        port: getInputAsInt("port"),
        useSSL: !getInputAsBoolean("insecure"),
        accessKey: accessKey ?? AWS_ACCESS_KEY_ID ?? core.getInput("accessKey"),
        secretKey:
            secretKey ?? AWS_SECRET_ACCESS_KEY ?? core.getInput("secretKey"),
        sessionToken:
            sessionToken ?? AWS_SESSION_TOKEN ?? core.getInput("sessionToken"),
        region:
            AWS_REGION ?? core.getInput("aws-region") ?? core.getInput("region")
    });
}

export function getInputAsBoolean(
    name: string,
    options?: core.InputOptions
): boolean {
    return core.getInput(name, options) === "true";
}

export function getInputAsArray(
    name: string,
    options?: core.InputOptions
): string[] {
    return core
    .getInput(name, options)
    .split("\n")
    .map(s => s.replace(/^!\s+/, "!").trim())
    .filter(x => x !== "");
}

export function getInputAsInt(
    name: string,
    options?: core.InputOptions
): number | undefined {
    const value = parseInt(core.getInput(name, options));
    if (isNaN(value) || value < 0) {
        return undefined;
    }
    return value;
}

export function formatSize(value?: number, format = "bi") {
    if (!value) return "";
    const [multiple, k, suffix] = (
        format === "bi" ? [1000, "k", "B"] : [1024, "K", "iB"]
    ) as [number, string, string];
    const exp = (Math.log(value) / Math.log(multiple)) | 0;
    const size = Number((value / Math.pow(multiple, exp)).toFixed(2));
    return (
        size +
        (exp
            ? (k + "MGTPEZY")[exp - 1] + suffix
            : "byte" + (size !== 1 ? "s" : ""))
    );
}

export function setCacheHitOutput(isCacheHit: boolean): void {
    core.setOutput("cache-hit", isCacheHit.toString());
}

type FindObjectResult = {
    item: minio.BucketItem;
    matchingKey: string;
};

export async function findObject(
    mc: minio.Client,
    bucket: string,
    key: string,
    restoreKeys: string[],
    compressionMethod: CompressionMethod
): Promise<FindObjectResult> {
    core.debug("Key: " + JSON.stringify(key));
    core.debug("Restore keys: " + JSON.stringify(restoreKeys));

    core.debug(`Finding exact macth for: ${key}`);
    const exactMatch = await listObjects(mc, bucket, key);
    core.debug(`Found ${JSON.stringify(exactMatch, null, 2)}`);
    if (exactMatch.length) {
        const result = { item: exactMatch[0], matchingKey: key };
        core.debug(`Using ${JSON.stringify(result)}`);
        return result;
    }

    for (const restoreKey of restoreKeys) {
        const fn = utils.getCacheFileName(compressionMethod);
        core.debug(`Finding object with prefix: ${restoreKey}`);
        let objects = await listObjects(mc, bucket, restoreKey);
        objects = objects.filter(o => o.name.includes(fn));
        core.debug(`Found ${JSON.stringify(objects, null, 2)}`);
        if (objects.length < 1) {
            continue;
        }
        const sorted = objects.sort(
            (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
        );
        const result = { item: sorted[0], matchingKey: restoreKey };
        core.debug(`Using latest ${JSON.stringify(result)}`);
        return result;
    }
    throw new Error("Cache item not found");
}

export function listObjects(
    mc: minio.Client,
    bucket: string,
    prefix: string
): Promise<minio.BucketItem[]> {
    return new Promise((resolve, reject) => {
        const h = mc.listObjectsV2(bucket, prefix, true);
        const r: minio.BucketItem[] = [];
        let resolved = false;
        h.on("data", obj => {
            r.push(obj);
        });
        h.on("error", e => {
            resolved = true;
            reject(e);
        });
        h.on("end", () => {
            resolved = true;
            resolve(r);
        });
        setTimeout(() => {
            if (!resolved)
                reject(new Error("list objects no result after 10 seconds"));
        }, 10000);
    });
}

export function saveMatchedKey(matchedKey: string) {
    return core.saveState(State.MatchedKey, matchedKey);
}

export function logWarning(message: string): void {
    const warningPrefix = "[warning]";
    core.info(`${warningPrefix}${message}`);
}

function getMatchedKey() {
    return core.getState(State.MatchedKey);
}

// Cache token authorized for all events that are tied to a ref
// See GitHub Context https://help.github.com/actions/automating-your-workflow-with-github-actions/contexts-and-expression-syntax-for-github-actions#github-context
export function isValidEvent(): boolean {
    return RefKey in process.env && Boolean(process.env[RefKey]);
}

export function isExactKeyMatch(): boolean {
    const matchedKey = getMatchedKey();
    const inputKey =
        core.getState(State.PrimaryKey) ||
        core.getInput("key", { required: true });
    const result=
    !!(
        matchedKey &&
        matchedKey.localeCompare(inputKey, undefined, {
            sensitivity: "accent"
        }) === 0
    );
    core.debug(
        `isExactKeyMatch: matchedKey=${matchedKey} inputKey=${inputKey}, result=${result}`
    );
    return result;
}
