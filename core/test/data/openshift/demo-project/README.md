# OpenShift Local demo project

**WARNING: this is work in progress**

There are no guarantees for feature support, correctness, stability, or ice cream.

This is mostly internal documentation while we work through adding support for OpenShift.

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
  - save the kubeadmin password to your password manager
  - add the kubeadmin password to your `.zshrc` or similar as `export OPENSHIFT_ADMIN_PASSWORD=password`
- Run `oc login -u developer -p developer https://api.crc.testing:6443` once and accept the certificate
- Run `oc new-project demo-project` to create the project

Then depending on your network configuration, you might need to forward `::1:6443` to `127.0.0.1:6443`. This is because OpenShift's kubernetes api listens only on IPv4, but Garden's kubernetes api client for some reason prefers IPv6 if available. This happens even when the kube context is set to the hostname `api.crc.testing` correctly, and `/etc/hosts` has an entry for `api.crc.testing` pointing to `127.0.0.1`.

```bash
brew install socat
socat TCP6-LISTEN:6443,fork,reuseaddr TCP4:127.0.0.1:6443
```

This needs to be kept running in the background.

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
