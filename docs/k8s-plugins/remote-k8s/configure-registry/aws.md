---
title: AWS 
order: 1
---

# AWS

## Setting up an ECR registry

Follow [this guide](https://docs.aws.amazon.com/AmazonECR/latest/userguide/repository-create.html) to create a private ECR registry on AWS.

Then follow [this guide](https://kubernetes.io/docs/concepts/containers/images/#using-a-private-registry) to create an image pull secret
so that your cluster can pull images from your registry.

Make note of the ImagePullSecret name and namespace.

## Enabling in-cluster building

For AWS ECR (Elastic Container Registry), you need to enable the ECR credential helper once for the repository by adding an `imagePullSecret` for you ECR repository.

First create a `config.json` somewhere with the following contents (`<aws_account_id>` and `<region>` are placeholders that you need to replace for your repo):

```json
{
  "credHelpers": {
    "<aws_account_id>.dkr.ecr.<region>.amazonaws.com": "ecr-login"
  }
}
```

Next create the _imagePullSecret_ in your cluster (feel free to replace the default namespace, just make sure it's correctly referenced in the config below):

```sh
kubectl --namespace default create secret generic ecr-config \
  --from-file=.dockerconfigjson=./config.json \
  --type=kubernetes.io/dockerconfigjson
```

Make note of the ImagePullSecret name and namespace.

### Configuring Access

To grant your service account the right permission to push to ECR, add this policy to each of the repositories in the container registry that you want to use with in-cluster building:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowPushPull",
            "Effect": "Allow",
            "Principal": {
                "AWS": [
                    "arn:aws:iam::<account-id>:role/<k8s_worker_iam_role>"                ]
            },
            "Action": [
                "ecr:BatchGetImage",
                "ecr:BatchCheckLayerAvailability",
                "ecr:CompleteLayerUpload",
                "ecr:GetDownloadUrlForLayer",
                "ecr:InitiateLayerUpload",
                "ecr:PutImage",
                "ecr:UploadLayerPart"
            ]
        }
    ]
}
```

To grant developers permission to push and pull directly from a repository, see [the AWS documentation](https://docs.aws.amazon.com/AmazonECR/latest/userguide/security_iam_id-based-policy-examples.html).

