import * as cache from "@actions/cache";
import * as utils from "@actions/cache/lib/internal/cacheUtils";
import { extractTar, listTar } from "@actions/cache/lib/internal/tar";
import * as core from "@actions/core";
import * as minio from "minio";
import * as path from "path";

import { State } from "./state";
import {
    findObject,
    formatSize,
    getInputAsArray,
    getInputAsBoolean,
    isGhes,
    newMinio,
    saveMatchedKey,
    setCacheHitOutput
} from "./utils";

process.on("uncaughtException", e => core.info("warning: " + e.message));

async function restoreCache() {
    try {
        const bucket = core.getInput("bucket", { required: true });
        const key = core.getInput("key", { required: true });
        const useFallback = getInputAsBoolean("use-fallback");
        const paths = getInputAsArray("path");
        const restoreKeys = getInputAsArray("restore-keys");

        try {
            // Inputs are re-evaluted before the post action, so we want to store the original values
            core.saveState(State.PrimaryKey, key);
            core.saveState(State.AccessKey, core.getInput("accessKey"));
            core.saveState(State.SecretKey, core.getInput("secretKey"));
            core.saveState(State.SessionToken, core.getInput("sessionToken"));

            const mc = newMinio();

            const compressionMethod = await utils.getCompressionMethod();
            const cacheFileName = utils.getCacheFileName(compressionMethod);
            const archivePath = path.join(
                await utils.createTempDirectory(),
                cacheFileName
            );
            const efectiveKey = path.join(
                core.getInput("bucket_sub_folder"),
                key
            );
            const effectiveRestoreKey = restoreKeys.map(element => {
                return path.join(core.getInput("bucket_sub_folder"), element);
            });

            core.info("Cache path in the bucket: " + efectiveKey);

            effectiveRestoreKey.forEach(element => {
                core.info("Restore key:" + element);
            });

            const { item: obj, matchingKey } = await findObject(
                mc,
                bucket,
                efectiveKey,
                effectiveRestoreKey,
                compressionMethod
            );
            core.debug("found cache object");
            saveMatchedKey(matchingKey);
            core.info(
                `Downloading cache from s3 to ${archivePath}. bucket: ${bucket}, object: ${obj.name}`
            );

            await downloadWithRetry(mc, bucket, obj.name, archivePath);

            if (core.isDebug()) {
                await listTar(archivePath, compressionMethod);
            }

            core.info(
                `Cache Size: ${formatSize(obj.size)} (${obj.size} bytes)`
            );

            await extractTar(archivePath, compressionMethod);
            setCacheHitOutput(matchingKey === efectiveKey);
            core.info("Cache restored from s3 successfully");
        } catch (e) {
            core.info("Restore s3 cache failed: " + (e as Error).message);
            setCacheHitOutput(false);
            if (useFallback) {
                if (isGhes()) {
                    core.warning(
                        "Cache fallback is not supported on Github Enterpise."
                    );
                } else {
                    core.info("Restore cache using fallback cache");
                    const fallbackMatchingKey = await cache.restoreCache(
                        paths,
                        key,
                        restoreKeys,
                        {},
                        true
                    );
                    if (fallbackMatchingKey) {
                        setCacheHitOutput(fallbackMatchingKey === key);
                        core.info("Fallback cache restored successfully");
                    } else {
                        core.info("Fallback cache restore failed");
                    }
                }
            }
        }
    } catch (e) {
        core.setFailed((e as Error).message);
    }
}

async function downloadWithRetry(
    mc: minio.Client,
    bucketName: string,
    objectName: string,
    archivePath: string
): Promise<void> {
    const retryCount = 3;
    const interval = 5000;
    for (let i = 0; i <= 3; i++) {
        try {
            await mc.fGetObject(bucketName, objectName, archivePath);
            core.info(`Downloaded object "${objectName}" successfully.`);
            return;
        } catch (err: unknown) {
            if (err instanceof Error) {
                core.warning(
                    `Failed to download object "${objectName}". Error: name ${err.name} message ${
                        err.message
                    }. Retrying in ${interval / 1000} seconds...`
                );
            } else {
                core.warning(
                    `Failed to download object "${objectName}". Error: ${err}. Retrying in ${
                        interval / 1000
                    } seconds...`
                );
            }

            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
    core.error(
        `Download failed after ${retryCount} attempts. For object ${objectName}`
    );
}

restoreCache();
