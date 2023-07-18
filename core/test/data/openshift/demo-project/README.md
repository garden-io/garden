# OpenShift Local setup

**WARNING: this is work in progress**

There are no guarantees for feature support, correctness, stability, or ice cream.

This is mostly internal documentation while we work through adding support for OpenShift.

This document has been written using the following:

```
CRC version: 2.20.0+f3a947
OpenShift version: 4.13.0
```

## Preparation

If you are using Docker Desktop and its builtin Kubernetes support, you need to do the following cleanup steps first:

- Go to Docker Desktop settings, Kubernetes tab, and disable it with the checkbox
- Quit Docker Desktop from the menu - using the Restart button is not enough
- Start Docker Desktop
- Verify that Docker Desktop is no longer binding the port for Kubernetes API server: `lsof -i :6443`
- If the port is still active, you may need to quit and start Docker Desktop again
- Move `~/.kube/config` to another location, both as a backup as well as to give OpenShift the room to create its own

## Setup

- Download OpenShift Local from RedHat's website
- This will require you to create a RedHat account and log in
- Follow the setup instructions from the website, including e.g.
  - downloading/copying the pull secret
  - running `crc setup`
  - pasting the secret in when prompted
  - take note of the generated kubeadmin password
- Run `oc login -u developer -p developer https://api.crc.testing:6443` once and accept the certificate
- Run `oc new-project demo-project` to create the project

Then depending on your network configuration, you might need to forward `::1:6443` to `127.0.0.1:6443`. This is because OpenShift's kubernetes api listens only on IPv4, but Garden's kubernetes api client for some reason prefers IPv6 if available. This happens even when the kube context is set to the hostname `api.crc.testing` correctly, and `/etc/hosts` has an entry for `api.crc.testing` pointing to `127.0.0.1`.

```bash
brew install socat
socat TCP6-LISTEN:6443,fork,reuseaddr TCP4:127.0.0.1:6443
```

This needs to be kept running in the background.

## Optional: enabling in-cluster builds

Allow anyuid to enable `kaniko` builder to work on the cluster:

_TODO: we should fix this properly by editing the `garden-util` image, and make this section obsolete_

```bash
oc login -u kubeadmin https://api.crc.testing:6443
oc adm policy add-scc-to-user anyuid -z default --namespace demo-project
oc logout
oc login -u developer -p developer
```

Optionally, increase the resources on the VM to make sure the builder does not run into limits:

```bash
crc config set memory 10240
crc config set cpus 4
crc stop
crc start
```

Configure the image pull secrets:

```bash
oc registry login --to auth.json
oc create secret docker-registry imagepullsecrets --from-file=.dockerconfigjson=auth.json
rm auth.json
```

## Deploy

Let's make sure your terminal has fresh credentials in the environment:

```bash
oc login -u developer -p developer https://api.crc.testing:6443
oc registry login --insecure=true
```

Ideally, at this point this should work:

```bash
garden deploy
open http://hello.local.demo.garden/
garden logs nginx-hello # NOTE: this will be empty due to https://github.com/sclorg/nginx-container/issues/94
garden delete deploy
```

## Cleanup

If you want to reset your environment, you can run:

```bash
crc delete
```

This will delete the VM running OpenShift, including any configuration done within it. Remember to also delete or move the `~/.kube.config` file.

You can create a new one by running `crc start` and repeating setup steps for the project, permissions, registry, etc.
Note that creating a new VM will generate a new kubeadmin password.

# OpenShift Cloud setup

If you have set up an OpenShift Dedicated Cloud cluster, there should be fairly few setup steps to do.

Check the project and action configuration files for more details and examples.

If you want to enable **in-cluster builds**, currently we require you to set up these additional permissions:

_TODO: we should fix this properly by editing the `garden-util` image, and make this section obsolete_

## Using the CLI

```bash
# replace with your own cluster authentication url
oc login -u kubeadmin https://api.openshift-trial.23q9.p1.openshiftapps.com:6443
oc adm policy add-scc-to-user anyuid -z default --namespace demo-project
oc logout
```

## Using the Web UI

Alternatively, if you have sufficient permissions, you can do this in the OpenShift web UI

1. Administrator role
2. User Management tab
3. Role Bindings section
4. Create binding

```
name: allow-anyuid
namespace: demo-project
role name: system:openshift:scc:anyuid
subject: servicegroup
subject namespace: demo-project
subject name: default
```

# OpenShift demos

There are two examples that have been verified to work with OpenShift:

- `openshift-nginx-hello` which included in this directory, and
- `vote` which can be copied from examples and made to work with slightly modified project configuration.

Copy the vote example to the `vote` directory, and remove the project configuration included with it:

```bash
cp -r ../../../../../examples/vote/ vote/
rm vote/garden.yml
```

NOTE: in case you run into issues, you might need to edit the `Build` actions to have `buildAtSource: true` and/or specify the target platform as `linux/amd64` in additional build arguments.

## OpenShift Local

```bash
oc logout
oc login -u developer -p developer https://api.crc.testing:6443
oc delete secret imagepullsecrets && oc registry login --to auth.json && oc create secret docker-registry imagepullsecrets --from-file=.dockerconfigjson=auth.json && rm auth.json
oc registry login
gdev --env local deploy openshift-nginx-hello --sync
```

## OpenShift Cloud

```bash
oc logout
open https://oauth-openshift.apps.openshift-trial.23q9.p1.openshiftapps.com/oauth/token/request
oc delete secret imagepullsecrets && oc registry login --to auth.json && oc create secret docker-registry imagepullsecrets --from-file=.dockerconfigjson=auth.json && rm auth.json
oc registry login
gdev --env remote deploy vote
gdev --env remote logs worker
gdev --env remote run db-init --force
gdev --env remote deploy worker --force
```
