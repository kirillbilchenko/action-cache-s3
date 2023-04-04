import { getCompressionMethod } from "@actions/cache/lib/internal/cacheUtils";
import { BucketItem as BucketItem, Client as MinioClient } from "minio";
import { Readable } from "stream";

import { findObject } from "../src/utils/utils";

jest.mock("minio");
const myBucketItems: BucketItem[] = [
    {
        name: "test-Linux-4604445832-a3ad8045f14cd7127d9e2a4e973040a6db853bf2/cache.tzst",
        lastModified: new Date("2023-04-04T05:54:13.700Z"),
        prefix: "",
        etag: "2c52510a62a9628fff959f4e2abdc58e",
        size: 375
    },
    {
        name: "test-Linux-4604445832/cache.tzst",
        lastModified: new Date("2023-04-04T05:53:29.822Z"),
        prefix: "",
        etag: "5e7e3837cc4ea5636be29074b9fbd57a",
        size: 383
    }
];
const dataStream = Readable["from"](myBucketItems);
const minioConfig = {
    accessKey: "minio",
    endPoint: "minio-service.kubeflow",
    secretKey: "minio123"
};

describe("utils", () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });
    test("getLatestObj", async () => {
        const mc = new MinioClient(minioConfig);
        (
            MinioClient.prototype.listObjectsV2 as jest.Mock
        ).mockImplementationOnce(() => Readable["from"]([]));
        (
            MinioClient.prototype.listObjectsV2 as jest.Mock
        ).mockImplementationOnce(() => dataStream);
        const got = await findObject(
            mc,
            "actions-cache",
            "foo.bar",
            ["test-Linux-"],
            await getCompressionMethod()
        );
        expect(got).toBeTruthy();
        console.log(got);
    });
});
