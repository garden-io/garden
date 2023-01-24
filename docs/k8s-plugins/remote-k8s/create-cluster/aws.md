---
title: AWS
order: 2
---

# AWS

## AWS (EKS)

Follow [these instructions](https://docs.aws.amazon.com/eks/latest/userguide/create-cluster.html) to create an EKS cluster on AWS.

## AWS (kops)

[kops](https://github.com/kubernetes/kops) is a handy tool for creating Kubernetes clusters on AWS. Follow [these instructions](https://github.com/kubernetes/kops/blob/master/docs/getting_started/aws.md) to create your cluster.

After creating the cluster, kops will create a new `kubectl` context and set it as the active context. Note the name of the context as you will need it when configuring the Garden's Kubernetes plugin.

You can check that your cluster is ready by running:

```
kops validate cluster
```

## Permissions

IAM users or roles need the following AWS permissions to interact with your EKS cluster:
eks:DescribeCluster
eks:AccessKubernetesApi

You can select these when creating the policy through the UI, or with this JSON version:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "eks:DescribeCluster",
                "eks:AccessKubernetesApi"
            ],
            "Resource": "<arn identifier>"
        }
    ]
}
```

You will also need a Kubernetes role and service account in the EKS cluster. This can be achieved with the aws-auth configmap. The [instructions are documented here](https://docs.aws.amazon.com/eks/latest/userguide/add-user-role.html). If you are interested in minimizing the permissions in the cluster, please take a look at our [Kubernetes RBAC guide](https://docs.garden.io/advanced/rbac-config).
