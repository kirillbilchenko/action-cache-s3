# S3-cache

This action caches and restores caches from S3

## Original action

[actions-cache](https://github.com/tespkg/actions-cache)

## :warning: Important note

When using the GitHub Actions cache, it is important to ensure that the cache is created and restored in the same environment. This means that if you create a cache in a certain container or environment, you should make sure to restore the cache in the same type of container or environment.

The reason for this is that the cache compression and decompression algorithms used by this action are dependent on the tools and libraries available in the container or environment. If you create a cache in one environment and try to restore it in a different environment, the cache may not be compatible due to differences in the compression/decompression algorithms.

## Usage

```yaml
steps:
  - uses: actions/checkout@v3
  - uses: xxxx@main
    with:
      endpoint: play.min.io # optional, default s3.amazonaws.com
      insecure: false # optional, use http instead of https. default false
      accessKey: "xxxx" # required
      secretKey: xxxx" # required
      sessionToken: "xxxx" # optional
      bucket: actions-cache # required
      use-fallback: true # optional, use github actions cache fallback, default true

      # actions/cache compatible properties: https://github.com/actions/cache
      key: ${{ runner.os }}-yarn-${{ hashFiles('**/yarn.lock') }}
      path: |
        node_modules
        .cache
      restore-keys: |
        ${{ runner.os }}-yarn-
```

## License

[MIT License](https://github.com/tespkg/actions-cache/blob/main/LICENSE) - Copyright (c) 2022 Target Energy Solutions
