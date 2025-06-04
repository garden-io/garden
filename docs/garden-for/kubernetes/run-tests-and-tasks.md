---
title: Running Tests and Tasks
order: 7
---

{% hint style="info" %}
To use Garden to run Kubernetes tests and tasks you need to configure the [remote](./remote-kubernetes.md) or [local](./local-kubernetes.md) Kubernetes providers.
{% endhint %}

## Tests

### Container

The `container` Run and Test actions can be used for running one off jobs as a Pod using a given container image and similarly for running test. For example:

```yaml
kind: Build
name: api
type: container
---
kind: Test
name: api
type: container
dependencies: [build.api]
spec:
  image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action
  command: [npm, run, test]
---
kind: Run
name: seed-db
type: container
dependencies: [build.api]
spec:
  image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action
  command: [npm, run, seed-db]
```

### Helm Pod

This action type can be used for Run and Test actions where you already have the corresponding Helm charts. It's similar to the `kubernetes-pod` action type.

See the [`helm-pod` Run](../../reference/action-types/Run/helm-pod.md) and [`helm-pod` Test](../../reference/action-types/Test/helm-pod.md) reference docs for more details.

### Kubernetes Pod

For Run and Test actions, either the `kubernetes-pod` or `kubernetes-exec` actions can be used.

[`kubernetes-pod` Run](../../reference/action-types/Run/kubernetes-pod.md) and [`kubernetes-pod` test](../../reference/action-types/Test/kubernetes-pod.md) will create a fresh Kubernetes workload and run your command in it. These actions are cached. This means that Garden will not rerun them if the version of the action hasn't changed. If a remote Kubernetes cluster is used, test results are stored there which allows to share test results between the team or CI runs to decrease the number or re-runs.

`kubernetes-pod` actions don't have to depend on the deploy actions. The manifests are gathered from the kubernetes manifests and deployed to the cluster.

```yaml
kind: Test
name: vote-integ-pod
type: kubernetes-pod
dependencies:
  - deploy.api
variables:
  hostname: vote.${var.baseHostname}
timeout: 60
spec:
  resource:
    kind: Deployment
    name: vote-integ-pod
  command: [/bin/sh, -c, "npm run test:integ"]
  values:
...
```

### Kubernetes Exec

[`kubernetes-exec` Run](../../reference/action-types/Run/kubernetes-exec.md) and
[`kubernetes-exec` Test](../../reference/action-types/Test/kubernetes-exec.md) actions are used to execute a command in an already deployed
Kubernetes Pod and wait for it to complete. These actions are not cached. They can be used with deploys running in sync mode
for rapid testing and development. These actions should depend on the deploy action that creates the kubernetes workloads they run in.

Here's a run action from the [vote-helm example](../../../examples/vote-helm/postgres/garden.yml)
that initializes the database by running a command in the already deployed kubernetes workload.

```yaml
kind: Run
name: db-init
type: kubernetes-exec
dependencies: [deploy.db]
spec:
  resource:
    kind: "StatefulSet"
    name: "postgres"
  command:
    [
      "/bin/sh",
      "-c",
      "PGPASSWORD=postgres psql -w -U postgres --host=postgres --port=5432 -d postgres -c 'CREATE TABLE IF NOT EXISTS votes (id VARCHAR(255) NOT NULL UNIQUE, vote VARCHAR(255) NOT NULL, created_at timestamp default NULL)'",
    ]

```

### Test Artifacts

Many action types, including `container`, `exec` and `helm`, allow you to extract artifacts after Tests have completed. This can be handy when you'd like to view reports or logs, or if you'd like a script (via a local `exec` action, for instance) to validate the output from a Test.

Desired artifacts can be specified using the `spec.artifacts` field on Test configurations. For example, for the `container` Test, you can do something like this:

```yaml
kind: Test
type: container
name: my-test
...
spec:
  command: [some, command]
  artifacts:
    - source: /report/*
      target: my-test-report
```

After running `my-test`, you can find the contents of the `report` directory in the test's container, locally under `.garden/artifacts/my-test-report`.

Please look at individual [action type references](../../reference/action-types/README.md) to see how to configure each Run to extract artifacts.

## Tasks


### Container

The `container` Run and Test actions can be used for running one off jobs as a Pod using a given container image and similarly for running test. For example:

```yaml
kind: Build
name: api
type: container
---
kind: Test
name: api
type: container
dependencies: [build.api]
spec:
  image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action
  command: [npm, run, test]
---
kind: Run
name: seed-db
type: container
dependencies: [build.api]
spec:
  image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action
  command: [npm, run, seed-db]
```

### Helm Pod

This action can be used for Run and Test actions where you already have the corresponding Helm charts. It's similar to the `kubernetes-pod` action.

See the [`helm-pod` Run](../../reference/action-types/Run/helm-pod.md) and [`helm-pod` Test](../../reference/action-types/Test/helm-pod.md) reference docs for more details.

### Kubernetes Pod

For Run and Test actions, either the `kubernetes-pod` or `kubernetes-exec` actions can be used.

[`kubernetes-pod` Run](../../reference/action-types/Run/kubernetes-pod.md) and [`kubernetes-pod` test](../../reference/action-types/Test/kubernetes-pod.md) will create a fresh Kubernetes workload and run your command in it. These actions are cached. This means that Garden will not rerun them if the version of the action hasn't changed. If a remote Kubernetes cluster is used, test results are stored there which allows to share test results between the team or CI runs to decrease the number or re-runs.

`kubernetes-pod` actions don't have to depend on the deploy actions. The manifests are gathered from the kubernetes manifests and deployed to the cluster.

```yaml
kind: Test
name: vote-integ-pod
type: kubernetes-pod
dependencies:
  - deploy.api
variables:
  hostname: vote.${var.baseHostname}
timeout: 60
spec:
  resource:
    kind: Deployment
    name: vote-integ-pod
  command: [/bin/sh, -c, "npm run test:integ"]
  values:
...
```

### Kubernetes Exec

[`kubernetes-exec` Run](../../reference/action-types/Run/kubernetes-exec.md) and [`kubernetes-exec` Test](../../reference/action-types/Test/kubernetes-exec.md) actions are used to execute a command in an already deployed Kubernetes Pod and wait for it to complete. These actions are not cached. They can be used with deploys running in sync mode for rapid testing and development. These actions should depend on the deploy action that creates the kubernetes workloads they run in.

Here's a run action from the [vote-helm example](../../../examples/vote-helm/postgres/garden.yml) that initializes the database by running a command in the already deployed kubernetes workload.

```yaml
kind: Run
name: db-init
type: kubernetes-exec
dependencies: [deploy.db]
spec:
  resource:
    kind: "StatefulSet"
    name: "postgres"
  command:
    [
      "/bin/sh",
      "-c",
      "PGPASSWORD=postgres psql -w -U postgres --host=postgres --port=5432 -d postgres -c 'CREATE TABLE IF NOT EXISTS votes (id VARCHAR(255) NOT NULL UNIQUE, vote VARCHAR(255) NOT NULL, created_at timestamp default NULL)'",
    ]

```
