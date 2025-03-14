---
title: AWS
order: 2
---

# AWS

## AWS (EKS)

The official [AWS EKS user guide](https://docs.aws.amazon.com/eks/latest/userguide/create-cluster.html) guides users to create their cluster using the official `eksctl` tool.

### tl;dr

The following command will create an EKS cluster with a managed node group using any AWS instances that meet the criteria of 4 vCPUs and 16 GiB of memory. It uses IAM Roles for Service Accounts (IRSA) to attach a policy to the cluster allowing power user access to AWS' Elastic Container Registry. Visit the docs for more details on the [AmazonEC2ContainerRegistryPowerUser policy](https://docs.aws.amazon.com/AmazonECR/latest/userguide/security-iam-awsmanpol.html#security-iam-awsmanpol-AmazonEC2ContainerRegistryPowerUser).

```bash
eksctl create cluster -f - <<EOF
---
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: $USER-cluster
  region: $AWS_REGION

managedNodeGroups:
- name: mng
  instanceSelector:
    vCPUs: 4
    memory: 16

iam:
  withOIDC: true
  serviceAccounts:
  - metadata:
      name: ecr-poweruser
      # set namespace to your developer namespace
      namespace: $USER-dev
    attachPolicyARNs:
    - "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser"
EOF
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

You will also need a Kubernetes role and service account in the EKS cluster. This can be achieved with the aws-auth configmap. The [instructions are documented here](https://docs.aws.amazon.com/eks/latest/userguide/add-user-role.html). If you are interested in minimizing the permissions in the cluster, please take a look at our [Kubernetes RBAC guide](../../../guides/rbac-config.md).
