# Image `k8s-sync`

This image is used for code-synchronization in dev mode. It's based on the [Alpine Linux](https://www.alpinelinux.org/)
and [Mutagen](https://github.com/mutagen-io/mutagen).

## Mutagen version update

To update the mutagen version:

1. Publish new Docker images
2. Implement code changes

### Publish new Docker images

1. Update the [Dockerfile](./Dockerfile) to use the new mutagen binaries and update the image name.
   in [garden.yml](./garden.yml).
2. Build and publish the new `k8s-sync` image.
3. Increment the version of [k8s-util](../k8s-util) image by updating its [Dockerfile](../k8s-util/Dockerfile)
   and [garden.yml](../k8s-util/garden.yml).
4. Build and publish the new `k8s-util` image, because it depends on the `k8s-sync` image.

### Implement code changes

1. Update the constant `mutagenCliSpec` object in the [mutagen.ts](../../core/src/plugins/kubernetes/mutagen.ts).
2. Search for the `gardendev/k8s-sync` string in the code and change the old version to the new one.
3. Implement the necessary code changes to address the mutagen's breaking changes if any.

If the constant `mutagenCliSpec` cannot be found in the location specified above, then try a full-text search for the
old mutagen version in the source code, and change all occurrences to the new mutagen version.

If any duplicates are found for the `gardendev/k8s-sync` image name string, then refactor the code to use a single
public constant.
