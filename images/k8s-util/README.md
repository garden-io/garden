# Image `k8s-util`

This utility image is used to set up a sync between a local Garden project's sources and its target k8s container when
the in-cluster build mode (`kaniko` or `cluster-buildkit`) is used.

It also mounts a volume that’s shared with the builder pods (both when using `kaniko` or `cluster-buildkit` build modes)
. That is, the build context is synced from the local machine to the volume that the util pod mounts, which is then also
mounted by the builders. This shared volume is how we provide an up-to-date build context to the builder pods.

t’s also used to run [skopeo](../skopeo), which is used to check if an image has already been built (which is why it
mounts a secret that enables it to communicate with the container registry).

## Dependencies

This image depends on [k8s-sync](../k8s-sync) and used it as a base image.
So, this image should be updated on every `k8s-sync` update.

## Version update

1. First, update the [base `k8s-sync` image](../k8s-sync/README.md) if necessary.
2. Update the [Dockerfile](./Dockerfile) if necessary (this can be skipped if only the base `k8s-sync` image was updated).
3. Bump the version by updating `variables.release-tag` in [garden.yml](./garden.yml).
4. Build and publish the new `k8s-util` image.
5. Change the image name in the code by using the newly published image id in the function `getK8sUtilImagePath` in [constants.ts](../../core/src/plugins/kubernetes/constants.ts).
