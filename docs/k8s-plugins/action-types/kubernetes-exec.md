---
title: Kubernetes-exec
order: 7
---

# `kubernetes-exec`

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
