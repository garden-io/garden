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

Then there are some setup steps that currently need to be run as admin:

```bash
# Admin setup steps
oc logout
oc login -u kubeadmin -p $OPENSHIFT_ADMIN_PASSWORD https://api.crc.testing:6443
oc new-project garden-system
oc adm policy add-cluster-role-to-user cluster-reader developer

cat <<EOF | oc apply -f -
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: ingressclasses-list
rules:
- apiGroups: ["networking.k8s.io"]
  resources: ["ingressclasses"]
  verbs: ["get", "list", "watch"]
EOF
oc adm policy add-cluster-role-to-user ingressclasses-list developer

cat <<EOF | oc apply -f -
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  namespace: default
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list", "watch"]
EOF
oc adm policy add-role-to-user secret-reader developer -n default

cat <<EOF | oc apply -f -
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  namespace: default
  name: deploy-services-ingresses
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["services"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
EOF
oc adm policy add-role-to-user deploy-services-ingresses developer -n default
```

Then there are some setup steps that need to be run as user:

```bash
# User setup steps
oc login -u developer -p developer https://api.crc.testing:6443
oc new-project demo-project
```

Then depending on your network configuration, you might need to forward `::1:6443` to `127.0.0.1:6443`. This is because OpenShift's kubernetes api listens only on IPv4, but Garden's kubernetes api client for some reason prefers IPv6 if available. This happens even when the kube context is set to the hostname `api.crc.testing` correctly, and `/etc/hosts` has an entry for `api.crc.testing` pointing to `127.0.0.1`.

```bash
brew install socat
socat TCP6-LISTEN:6443,fork,reuseaddr TCP4:127.0.0.1:6443
```

## Deploy

Ideally, at this point this should work:

```bash
gdev deploy
```

Currently, however, it does not.
