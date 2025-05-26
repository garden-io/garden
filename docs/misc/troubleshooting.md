---
order: 2
title: Troubleshooting
---

# Troubleshooting

_This section could (obviously) use more work. Contributions are most appreciated!_

### I'm getting 401 auth errors on Azure.

When running Garden commands against an Azure AKS cluster with RBAC enabled, an error like the following may appear:

```
Failed resolving provider Kubernetes. Here's the output:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Got error from Kubernetes API - Unauthorized

StatusCodeError from Kubernetes API - 401 -
{"kind":"Status","apiVersion":"v1","metadata":{},"status":"Failure","message":"Unauthorized","reason":"Unauthorized","code":401}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

This happens because Azure with [RBAC enabled](https://docs.microsoft.com/en-us/azure/aks/manage-azure-rbac) uses a different authentication mechanism that the Kubernetes client library doesn't support. The solution is to use [Kubelogin](https://github.com/Azure/kubelogin). See also this [GitHub issue](https://github.com/garden-io/garden/issues/2330).

### I have a huge number of files in my repository and Garden is eating all my CPU/RAM.

This issue often comes up on Linux, and in other scenarios where the filesystem doesn't support event-based file watching.

Thankfully, you can in most cases avoid this problem using the `scan.exclude` field in your project config, and/or the `exclude` field in your individual action and module configs. See the [Including/excluding files and directories](../guides/include-exclude.md) section in our Configuration Files guide for details.

### I'm getting an "EPERM: operation not permitted, rename..." error on Windows.

This is a known issue with Windows and may affect many Node.js applications (and possibly others).
To fix it, you can open the Windows Defender Security Center and either

- a) disable Real-time protection; or
- b) click "Add or remove exclusions" and add "$HOME\\.garden" to the list of exclusions.

### When using Garden inside tmux, colors look wonky. What gives?

You need to set tmux to use 256 colors. As per the [official documentation](https://github.com/tmux/tmux/wiki/FAQ#how-do-i-use-a-256-colour-terminal), you can do that by adding `set -g default-terminal "screen-256color"`
or `set -g default-terminal "tmux-256color"` to your `~/.tmux.conf` file.

### Garden hangs after resolving providers.

This could be because Garden is scanning the project files. Make sure you exclude things like `node_modules` or other large vendor directories. See this [section of our docs](../guides/include-exclude.md).

### Ingress not working for `helm` and `kubernetes` modules.

Garden does create the ingress at the Kubernetes level. However, it does not print the ingresses with the CLI output and the Garden command call won't work. This is a [known issue](https://github.com/garden-io/garden/issues/718).

Pinging the service will still work, and you'll see the Ingress resource if you run `kubectl get ingress --namespace <my-namspace>`.

### A deployment is failing with: `<release-name> has no deployed releases`.

This is a well-known [Helm issue](https://github.com/helm/helm/issues/3208). You'll need to delete the release manually with `helm -n <namespace> uninstall <release-name>`

There's an [open pull request](https://github.com/helm/helm/pull/7653) for a fix.

### Files are missing from build context.

This is likely because they're being excluded somewhere, e.g. in `.gitignore` or `.gardenignore`.

{% hint style="warning" %}
Prior to Garden 0.13.0, `.gitignore` files were respected by default.
In Garden 0.13.0 that behaviour was changed.
Now it's possible to only specify a [single ".ignore" file](../guides/include-exclude.md)
in the [project-level configuration](../reference/project-config.md#dotIgnoreFile).
{% endhint %}

Please check your [dotIgnoreFile(s) configuration](../guides/include-exclude.md)
and the [project-level file exclusions](../guides/include-exclude.md).

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

### Release `garden-nginx` times out when using the `local-kubernetes` provider.

This can occur if nginx is not able to bind to its default port which is port `80`. Stopping the process that occupies the port should solve the issue.

You can also skip the nginx installation if you already have a separate ingress controller installed, by setting `setupIngressController: null` in your `local-kubernetes` provider configuration.

### On Mac: "garden" cannot be opened because the developer cannot be verified.

If this error came up when running the `garden` binary from inside your `~/Downloads` directory, try moving it outside
the `~/Downloads` directory before running it again.

If you're still getting this error, a workaround is to find the `garden` binary in Finder, CTRL-click it and choose
_Open_. This should prevent this error message from coming up again.

See also: https://support.apple.com/en-gb/guide/mac-help/mh40616/mac

### `Error response from daemon: experimental session with v1 builder is no longer supported, use builder version v2 (BuildKit) instead`

This is a bug in Docker CE (i.e. Docker for Desktop), version `2.4.x.y`. See this [GitHub issue comment](https://github.com/garden-io/garden/issues/2123#issuecomment-723780468) for a fix and more details.

### Can't reach my services on existing ingress URLs after re-installing Garden system services.

This can occur if you re-install the Garden Nginx Ingress Controller. For example because you ran `garden plugins kubernetes uninstall-garden-services` and then `garden plugins kubernetes cluster-init `when upgrading the system services.

When the Ingress Controller gets re-installed, it may be assigned a new IP address by your cloud provider, meaning that hostnames pointing to the previous one will no longer work.

To fix this, run kubectl get svc -n garden-system and look for the EXTERNAL-IP of the garden-nginx-nginx-ingress-controller service and update your DNS records with this new value.

### Deploy fails with `cannot convert int64 to string`

If a Kubernetes Deploy action fails with with a message like `The request is invalid: patch: Invalid value: [...] spec:map[template:map[spec:map[]]]]": cannot convert int64 to string` it might be because you're passing an integer value to an environment variable field in a Kubernetes manifest.

How the value gets passed depends on your set up but a common scenario would be something like:

```yaml
# In project.garden.yml
kind: Project
name: my-project
variables:
  port: 8080 # <--- This needs to be a string if it ends up in a K8s manifest

# In my-deploy-action.garden.yml
kind: Deploy
name: my-deploy-action
type: kubernetes
spec:
  # ...
  patchResources:
    - kind: Deployment
      name: my-deploy
      patch:
        spec:
          template:
            spec:
              containers:
                - name: my-deploy
                  env:
                    name: PORT
                    value: ${var.port} # <--- Oh no, this won't work because it's an integer

```

You can fix this by either changing the variable to a string like so:

```yaml
# In project.garden.yml
kind: Project
name: my-project
variables:
  port: "8080" # <--- Changed to string
```

Or by casting it to a string where it's passed to the K8s manifest via the Garden `string` template function like so:

```yaml
# In my-deploy-action.garden.yml
kind: Deploy
name: my-deploy-action
type: kubernetes
spec:
  # ...
  patchResources:
    - kind: Deployment
      name: my-deploy
      patch:
        spec:
          template:
            spec:
              containers:
                - name: my-deploy
                  env:
                    name: PORT
                    value: ${string(var.port)} # <--- Casting to string
```

You can learn more about Garden [template functions here](../reference/template-strings/functions.md).
