# OpenShift Local demo project

**WARNING: this is work in progress**

There are no guarantees for feature support, correctness, stability, or ice cream.

This is mostly internal documentation while we work through adding support for OpenShift.

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

## Deploy

Ideally, at this point this should work:

```bash
garden deploy
open http://hello.local.demo.garden/
garden delete deploy
```
