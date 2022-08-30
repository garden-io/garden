# Cloud Permissions for Cluster Access

For each environment cluster, you will want permissions for various members of your company to have access.

## AWS

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

## GCP

When using a GKE cluster with Garden, you can use the following [predefined roles](https://cloud.google.com/kubernetes-engine/docs/how-to/iam#predefined):
* Kubernetes Engine Developer
* Kubernetes Engine Cluster Viewer

These roles allow users to list all GKE clusters in a project and access the Kubernetes API and objects inside clusters.

To ensure that developers only have access to a single kubernetes cluster, create a separate project for that cluster.
