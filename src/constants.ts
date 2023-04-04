export enum Inputs {
    Key = "key", // Input for cache, restore, save action
    Path = "path", // Input for cache, restore, save action
    RestoreKeys = "restore-keys" // Input for cache, restore action
    // UploadChunkSize = "upload-chunk-size", // Input for cache, save action
    // EnableCrossOsArchive = "enableCrossOsArchive", // Input for cache, restore, save action
    // FailOnCacheMiss = "fail-on-cache-miss", // Input for cache, restore action
    // LookupOnly = "lookup-only" // Input for cache, restore action
}

export enum Events {
    Key = "GITHUB_EVENT_NAME",
    Push = "push",
    PullRequest = "pull_request"
}

export const RefKey = "GITHUB_REF";
