# Environments and Namespaces

Every Garden project has one or more environments that are defined in the project level Garden configuration. Teams often define environments such as `dev`, `ci`, and `prod`. 

Each environment can be broken down into several "namespaces", and each Garden run operates in a specific namespace. (This is not to be confused with a Kubernetes Namespace resource, although you will often use the same name for your Garden Namespace and your Kubernetes Namespace.)

To specify which Garden Namespace to use, you can use either of the following:

- Set a specific Namespace using the CLI with the `--env` flag and prepending the Namespace to the environment name using the following format `--env <namespace>.<environment>`
- Specify the default Namespace in your Garden configuration file, using the `defaultNamespace` field under the `environments` specification.

## Using Namespaces

You can use Namespaces in various ways. Some common use cases include

* **Unique Namespaces per developer:** These are typically long-running and belong to the same environment (e.g. `dev`).
* **Ephemeral Namespaces for each CI run:** These are deleted after the run completes.
* **Short-lived preview Namespaces for each pull request:** These are created when the pull request is opened, updated on every push, and deleted when the pull request is closed.

## An opinionated guide on using Namespaces


Below is an opinionated guide on configuring environments and namespaces and the corresponding config.

1. Add any of ``dev``, `ci`, `preview` and `prod` environments to your project.
2. For namespaces in the `dev` environment, template in the user’s name.
3. For namespaces in the `ci` environment, template in the build number from your CI runner. 
4. For namespaces in the `preview` environment, template in the PR number.
5. Use a deterministic namespace for your `prod` environment.
6. In the `kubernetes` provider config, set `namespace: ${environment.namespace}`. This ensures the Kubernetes namespace corresponds to the  Garden namespace.
7. Define your namespace names as variables so that you can, for example, re-use them in hostnames to ensure each instance of your project has a unique hostname.

The example configuration for this setup would look as follows:

```yaml
kind: Project
name: my-project
defaultEnvironment: dev
id: <cloud-id>
domain: <cloud-domain>

variables:
  ci-env-name: my-project-ci-${local.env.BUILD_NUMBER || 0} # <--- Depends on your CI provider
  prev-env-name: my-project-preview-${local.env.PR_NUMBER || 0} # <--- Depends on your CI provider
  dev-env-name: my-project-${local.username}

environments:
  - name: ci
    defaultNamespace: ${var.ci-env-name}
    variables:
      hostname: ${var.ci-env-name}.ci.<my-company>.com # <--- Use this in your service config to ensure unique hostnames per instance
  - name: preview
    defaultNamespace: ${var.prev-env-name}
    variables:
      hostname: ${var.prev-env-name}.preview.<my-company>.com
  - name: dev
    defaultNamespace: ${var.dev-env-name}
    variables:
      hostname: ${var.dev-env-name}.dev.<my-company>.com
  - name: prod
		defaultNamespace: my-project
		variables:
      hostname: app.<my-company>.com

providers:
  - name: kubernetes
    namespace: ${environment.namespace} # <--- Ensure the K8s namespace matches the Garden namespace
    defaultHostname: ${var.hostname}
    # ...
```

This allows each developer to get a unique namespace and a unique hostname for each service. Some further notes:

* The `dev-env-name` namespace will be something like `my-project-janedoe` so each developer has a unique namespace per project.
* This namespace is set at a provider level, so Garden will always deploy the project to that namespace when that developer runs `garden deploy`.
* The `base-hostname` variable gives a unique hostname per project and per developer too. For example, if Jane Doe is working on a project called "Phoenix Project" at a company called Acme, her hostname would be `phoenix-project-janedoe.acme.com`
* This can also be used in the container module, to add another level of subdomains for individual services. So if the "Phoenix Project" includes a Redis database, the hostname could be `redis.phoenix-project.janedoe.acme.com`. This also works for Kubernetes modules.

This serves as a good base for naming your hostnames and namespaces, but you can tweak it further to meet your specific needs. For example, at Garden we use a similar scheme for our CI and preview environments, but we use the PR or build number as a further unique identifier.

