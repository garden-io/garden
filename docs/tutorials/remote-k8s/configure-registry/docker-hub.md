---
title: Docker Hub
order: 4
---

# Docker Hub

To pull and push images from private Docker Hub repositories you need to create an image pull secret for Docker Hub. Creating an image pull secret for Docker Hub also reduces the chance of being [rate limited](../../../misc/faq.md#how-do-i-avoid-being-rate-limited-by-docker-hub) (e.g. when deploying Garden utility images).


{% hint style="info" %}
For a more in-depth guide on creating image pull secrets, check out the [official Kubernetes documentation](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/).
{% endhint %}

### Step 1 — Log in

Log in to the Docker Hub account you want to use with:

```sh
docker login
```

The login process creates or updates a `config.json` file that holds an authorization token. You can view it with:

```sh
cat ~/.docker/config.json
```

The output contains a section similar to this:

```json
{
    "auths": {
        "https://index.docker.io/v1/": {
            "auth": "c3R...zE2"
        }
    }
}
```

### Step 2 — Create the secret

You can now create the image pull secret with the following command:

```
kubectl create secret generic regcred \
    --from-file=.dockerconfigjson=<path/to/.docker/config.json> \
    --type=kubernetes.io/dockerconfigjson
```

Here we're creating a secret called `regcred` in the `default` namespace. Take note of the name and namespace as you'll need it when configuring the Kubernetes provider in [step 4](../configure-provider.md).
