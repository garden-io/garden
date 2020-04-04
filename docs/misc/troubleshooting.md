---
order: 2
title: Troubleshooting
---

# Troubleshooting

_This section could (obviously) use more work. Contributions are most appreciated!_

### I have a huge number of files in my repository and Garden is eating all my CPU/RAM.

This issue often comes up on Linux, and in other scenarios where the filesystem doesn't support event-based file watching.

Thankfully, you can in most cases avoid this problem using the `modules.exclude` field in your project config, and/or the `exclude` field in your individual module configs. See the [Including/excluding files and directories](../guides/configuration-files.md#includingexcluding-files-and-directories) section in our Configuration Files guide for details.

### I'm getting an "EPERM: operation not permitted, rename..." error on Windows.

This is a known issue with Windows and may affect many Node.js applications (and possibly others).
To fix it, you can open the Windows Defender Security Center and either

- a) disable Real-time protection; or
- b) click "Add or remove exclusions" and add "$HOME\\.garden" to the list of exclusions.

### When using Garden inside tmux, colors look wonky. What gives?

You need to set tmux to use 256 colors. As per the [official documentation](https://github.com/tmux/tmux/wiki/FAQ#how-do-i-use-a-256-colour-terminal), you can do that by adding `set -g default-terminal "screen-256color"`
or `set -g default-terminal "tmux-256color"` to your `~/.tmux.conf` file.

### Garden hangs after resolving providers.

This could be because Garden is scanning the project files. Make sure you exclude things like `node_modules` or other large vendor directories. See this [section of our docs](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories).

### Ingress not working for `helm` and `kubernetes` modules.

Garden does create the ingress at the Kubernetes level. However, it does not print the ingresses with the CLI output and the Garden command call won't work. This is a [known issue](https://github.com/garden-io/garden/issues/718).

Pinging the service will still work and you'll see the Ingress resource if you run `kubectl get ingress --namespace <my-namspace>`.

### A deployment is failing with: `<release-name> has no deployed releases`.

This is a well-known [Helm issue](https://github.com/helm/helm/issues/3208). You'll need to delete the release manually with `helm -n <namespace> uninstall <release-name>`

There's an [open pull request](https://github.com/helm/helm/pull/7653) for a fix.

### Files are missing from build context.

This is likely because they're being excluded somewhere, e.g. in `.gitignore` or `.gardenignore`. Garden currently respects `.gitignore` but we plan to change that in our next major release.

### `ErrImagePull` when referencing an image from a `container` module in a `helm` module.

Make sure to use the `outputs` field from the container module being referenced.

For example:

```console
    kind: Module
    type: helm
    name: my-module
    values:
      image:
        # Use the outputs field from the container module
        repository: ${modules.my-module-image.outputs.deployment-image-name}
```

### `garden-build-sync` and `garden-docker-daemon` pods stuck in `ContainerCreating` on EKS or AKS.

This may be due the the NFS provisioner not playing well with EKS and AKS.

On EKS, you can use `efs` instead, which may be more stable and scalable than the default NFS storage

On AKS, you can use `azurefile`.

You'll need to install the provisioners yourself and override the [`storage.sync.storageClass`](https://docs.garden.io/reference/providers/kubernetes#providers-storage-sync) field in the `kubernetes` provider config.
