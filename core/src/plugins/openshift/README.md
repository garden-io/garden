# OpenShift plugin

**WARNING: this is work in progress**

There are no guarantees for feature support, correctness, stability, or ice cream.

This is mostly internal documentation while we work through adding support for OpenShift.

## Internal notes

- This plugin utilizes the Kubernetes plugin code heavily, often calling the same methods
- OpenShift is an officially recognized flavor of Kubernetes, so they share a lot of API surface
- There are some nuances and subtleties though, especially as OpenShift is more security-hardened by default
- This means that there are some customized copies of methods that omit certain operations, or use different params
