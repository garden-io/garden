## `openfaas` reference

Below is the schema reference for the `openfaas` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

## Configuration keys

### `name`

The name of the provider plugin to use.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
name: "local-kubernetes"
```
### `hostname`

The hostname to configure for the function gateway.
Defaults to the default hostname of the configured Kubernetes provider.

Important: If you have other types of services, this should be different from their ingress hostnames,
or the other services should not expose paths under /function and /system to avoid routing conflicts.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
hostname: "functions.mydomain.com"
```

## Complete schema
```yaml
name:

hostname:
```