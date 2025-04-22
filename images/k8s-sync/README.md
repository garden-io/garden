# Image `k8s-sync`

This image is used for code synchronization. It's based on the [Alpine Linux](https://www.alpinelinux.org/)
and [Mutagen](https://github.com/mutagen-io/mutagen).

## Mutagen version update

To update the mutagen version:

1. Publish new Docker images
2. Implement code changes

### Publish new Docker images

1. Update the [Dockerfile](./Dockerfile) to use the new mutagen binaries and update the image name
   in [garden.yml](./garden.yml).
2. Build and publish the new `k8s-sync` image.
3. Increment the version of [k8s-util](../k8s-util) image by updating its [Dockerfile](../k8s-util/Dockerfile).
   and [garden.yml](../k8s-util/garden.yml). See the details in the [`k8s-util` description](../k8s-util/README.md).
4. Build and publish the new `k8s-util` image, because it depends on the `k8s-sync` image.

### Implement code changes

1. Update the constant `mutagenVersion` in the [mutagen.ts](../../core/src/mutagen.ts).
2. Recompile the code and run the tests to verify the version hashes by running the following command from the `core` subdirectory of the repo root:
   ```console
   npm run test -- -g "Mutagen binaries"
   ```
3. Fix the assertions for the failed tests.
4. Change the image name in the code by using the newly published image id in the function `getK8sUtilImagePath` in [constants.ts](../../core/src/plugins/kubernetes/constants.ts).
5. Implement the necessary code changes to address the mutagen's breaking changes if any.
6. Test the code syncing manually with the [vote example](../../examples/vote/README.md) by running `deploy --sync command` with the current binaries.

If the constant `mutagenCliSpec` cannot be found in the location specified above, then try a full-text search for the
old mutagen version in the source code, and change all occurrences to the new mutagen version.

If any duplicates are found for the `gardendev/k8s-sync` image name string, then refactor the code to use a single
public constant.

### Example

A typical changeset for Mutagen version update can be found in https://github.com/garden-io/garden/pull/6665.
