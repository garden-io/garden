---
title: "`kubernetes-pod` Run"
tocTitle: "`kubernetes-pod` Run"
---

# `kubernetes-pod` Run

## Description

Run an ad-hoc instance of a Kubernetes Pod and wait for it to complete.

TODO-G2

Below is the full schema reference for the action. For an introduction to configuring Garden, please look at our [Configuration
guide](../../../using-garden/configuration-overview.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`kubernetes-pod` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
# The schema version of this config (currently not used).
apiVersion: garden.io/v0

# The kind of action you want to define (one of Build, Deploy, Run or Test).
kind:

# The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will be
# defined by your configured providers.
type:

# A valid name for the action. Must be unique across all actions of the same _kind_ in your project.
name:

# A description of the action.
description:

# By default, the directory where the action is defined is used as the source for the build context.
#
# You can override this by setting either `source.path` to another (POSIX-style) path relative to the action source
# directory, or `source.repository` to get the source from an external repository.
#
# If using `source.path`, you must make sure the target path is in a git repository.
#
# For `source.repository` behavior, please refer to the [Remote Sources
# guide](https://docs.garden.io/advanced/using-remote-sources).
source:
  # A relative POSIX-style path to the source directory for this action. You must make sure this path exists and is
  # ina git repository!
  path:

  # When set, Garden will import the action source from this repository, but use this action configuration (and not
  # scan for configs in the separate repository).
  repository:
    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    url:

# A list of other actions that this action depends on, and should be built, deployed or run (depending on the action
# type) before processing this action.
#
# Each dependency should generally be expressed as a `"<kind>.<name>"` string, where _<kind>_ is one of `build`,
# `deploy`, `run` or `test`, and _<name>_ is the name of the action to depend on.
#
# You may also optionally specify a dependency as an object, e.g. `{ kind: "Build", name: "some-image" }`.
#
# Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency via
# template expressions.
dependencies: []

# Set this to `true` to disable the action. You can use this with conditional template strings to disable actions
# based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name == "prod"}`).
# This can be handy when you only need certain actions for specific environments, e.g. only for development.
#
# For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another enabled
# action (in which case the Build is assumed to be necessary for the dependant action to be run or built).
#
# For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored. Note
# however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the action is
# disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional
# expressions.
disabled: false

# Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will
# affect the computed _version_ of the action.
#
# For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An
# exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be inferred
# and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run
# when certain files are modified.
#
# _Build_ actions have a different behavior, since they generally are based on some files in the source tree, so
# please reference the docs for more information on those.
#
# Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source
# tree, which use the same format as `.gitignore` files. See the [Configuration Files
# guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
# details.
include:

# Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's version.
#
# For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For
# _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set `include`
# paths, or such paths inferred by providers. See the [Configuration Files
# guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
# details.
#
# Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
# directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect those,
# if you have large directories that should not be watched for changes.
exclude:

# A map of variables scoped to this particular action. These are resolved before any other parts of the action
# configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in that
# order. They may reference group-scoped and project-scoped variables, and generally can use any template strings
# normally allowed when resolving the action.
variables:

# Specify a list of paths (relative to the directory where the action is defined) to a file containing variables, that
# we apply on top of the action-level `variables` field, and take precedence over group-level variables (if
# applicable) and project-level variables, in that order.
#
# If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the
# previous ones.
#
# The format of the files is determined by the configured file's extension:
#
# * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
# * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
# contain any value type.
# * `.json` - JSON. Must contain a single JSON _object_ (not an array).
#
# _NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of nested
# objects and arrays._
#
# To use different varfiles in different environments, you can template in the environment name to the varfile name,
# e.g. `varfile: "my-action.\$\{environment.name\}.env` (this assumes that the corresponding varfiles exist).
#
# If a listed varfile cannot be found, it is ignored.
varfiles: []

# Specify a _Build_ action, and resolve this action from the context of that Build.
#
# For example, you might create an `exec` Build which prepares some manifests, and then reference that in a
# `kubernetes` _Deploy_ action, and the resulting manifests from the Build.
#
# This would mean that instead of looking for manifest files relative to this action's location in your project
# structure, the output directory for the referenced `exec` Build would be the source.
build:

# Set a timeout for the run to complete, in seconds.
timeout:

spec:
  # Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any time your
  # project (or one or more of the task's dependants) is deployed. Otherwise the task is only re-run when its version
  # changes (i.e. the module or one of its dependencies is modified), or when you run `garden run`.
  cacheResult: true

  # The command/entrypoint used to run inside the container.
  command:

  # The arguments to pass to the command/entypoint used for execution.
  args:

  # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
  # `GARDEN`) and values must be primitives or references to secrets.
  env: {}

  # Specify artifacts to copy out of the container after the run. The artifacts are stored locally under
  # the `.garden/artifacts` directory.
  artifacts:
    - # A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.
      source:

      # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at
      # `.garden/artifacts`.
      target: .

  # A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters,
  # numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63
  # characters.
  namespace:

  # Specify a Kubernetes resource to derive the Pod spec from for the run.
  #
  # This resource will be fetched from the target namespace, so you'll need to make sure it's been deployed previously
  # (say, by configuring a dependency on a `helm` or `kubernetes` Deploy).
  #
  # The following fields from the Pod will be used (if present) when executing the task:
  # * `affinity`
  # * `automountServiceAccountToken`
  # * `containers`
  # * `dnsConfig`
  # * `dnsPolicy`
  # * `enableServiceLinks`
  # * `hostAliases`
  # * `hostIPC`
  # * `hostNetwork`
  # * `hostPID`
  # * `hostname`
  # * `imagePullSecrets`
  # * `nodeName`
  # * `nodeSelector`
  # * `overhead`
  # * `preemptionPolicy`
  # * `priority`
  # * `priorityClassName`
  # * `runtimeClassName`
  # * `schedulerName`
  # * `securityContext`
  # * `serviceAccount`
  # * `serviceAccountName`
  # * `shareProcessNamespace`
  # * `subdomain`
  # * `tolerations`
  # * `topologySpreadConstraints`
  # * `volumes`
  resource:
    # The kind of Kubernetes resource to find.
    kind:

    # The name of the resource, of the specified `kind`. If specified, you must also specify `kind`.
    name:

    # A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with
    # matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.
    podSelector:

    # The name of a container in the target. Specify this if the target contains more than one container and the main
    # container is not the first container in the spec.
    containerName:

  # Supply a custom Pod specification. This should be a normal Kubernetes Pod manifest. Note that the spec will be
  # modified for the run, including overriding with other fields you may set here (such as `args` and `env`), and
  # removing certain fields that are not supported.
  #
  # The following Pod spec fields from the will be used (if present) when executing the task:
  # * `affinity`
  # * `automountServiceAccountToken`
  # * `containers`
  # * `dnsConfig`
  # * `dnsPolicy`
  # * `enableServiceLinks`
  # * `hostAliases`
  # * `hostIPC`
  # * `hostNetwork`
  # * `hostPID`
  # * `hostname`
  # * `imagePullSecrets`
  # * `nodeName`
  # * `nodeSelector`
  # * `overhead`
  # * `preemptionPolicy`
  # * `priority`
  # * `priorityClassName`
  # * `runtimeClassName`
  # * `schedulerName`
  # * `securityContext`
  # * `serviceAccount`
  # * `serviceAccountName`
  # * `shareProcessNamespace`
  # * `subdomain`
  # * `tolerations`
  # * `topologySpreadConstraints`
  # * `volumes`
  podSpec:
    # Optional duration in seconds the pod may be active on the node relative to StartTime before the system will
    # actively try to mark it failed and kill associated containers. Value must be a positive integer.
    activeDeadlineSeconds:

    # Affinity is a group of affinity scheduling rules.
    affinity:
      # Node affinity is a group of node affinity scheduling rules.
      nodeAffinity:
        # The scheduler will prefer to schedule pods to nodes that satisfy the affinity expressions specified by this
        # field, but it may choose a node that violates one or more of the expressions. The node that is most
        # preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling
        # requirements (resource request, requiredDuringScheduling affinity expressions, etc.), compute a sum by
        # iterating through the elements of this field and adding "weight" to the sum if the node matches the
        # corresponding matchExpressions; the node(s) with the highest sum are the most preferred.
        preferredDuringSchedulingIgnoredDuringExecution:

        # A node selector represents the union of the results of one or more label queries over a set of nodes; that
        # is, it represents the OR of the selectors represented by the node selector terms.
        requiredDuringSchedulingIgnoredDuringExecution:
          # Required. A list of node selector terms. The terms are ORed.
          nodeSelectorTerms:

      # Pod affinity is a group of inter pod affinity scheduling rules.
      podAffinity:
        # The scheduler will prefer to schedule pods to nodes that satisfy the affinity expressions specified by this
        # field, but it may choose a node that violates one or more of the expressions. The node that is most
        # preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling
        # requirements (resource request, requiredDuringScheduling affinity expressions, etc.), compute a sum by
        # iterating through the elements of this field and adding "weight" to the sum if the node has pods which
        # matches the corresponding podAffinityTerm; the node(s) with the highest sum are the most preferred.
        preferredDuringSchedulingIgnoredDuringExecution:

        # If the affinity requirements specified by this field are not met at scheduling time, the pod will not be
        # scheduled onto the node. If the affinity requirements specified by this field cease to be met at some point
        # during pod execution (e.g. due to a pod label update), the system may or may not try to eventually evict the
        # pod from its node. When there are multiple elements, the lists of nodes corresponding to each
        # podAffinityTerm are intersected, i.e. all terms must be satisfied.
        requiredDuringSchedulingIgnoredDuringExecution:

      # Pod anti affinity is a group of inter pod anti affinity scheduling rules.
      podAntiAffinity:
        # The scheduler will prefer to schedule pods to nodes that satisfy the anti-affinity expressions specified by
        # this field, but it may choose a node that violates one or more of the expressions. The node that is most
        # preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling
        # requirements (resource request, requiredDuringScheduling anti-affinity expressions, etc.), compute a sum by
        # iterating through the elements of this field and adding "weight" to the sum if the node has pods which
        # matches the corresponding podAffinityTerm; the node(s) with the highest sum are the most preferred.
        preferredDuringSchedulingIgnoredDuringExecution:

        # If the anti-affinity requirements specified by this field are not met at scheduling time, the pod will not
        # be scheduled onto the node. If the anti-affinity requirements specified by this field cease to be met at
        # some point during pod execution (e.g. due to a pod label update), the system may or may not try to
        # eventually evict the pod from its node. When there are multiple elements, the lists of nodes corresponding
        # to each podAffinityTerm are intersected, i.e. all terms must be satisfied.
        requiredDuringSchedulingIgnoredDuringExecution:

    # AutomountServiceAccountToken indicates whether a service account token should be automatically mounted.
    automountServiceAccountToken:

    # List of containers belonging to the pod. Containers cannot currently be added or removed. There must be at least
    # one container in a Pod. Cannot be updated.
    containers:

    # PodDNSConfig defines the DNS parameters of a pod in addition to those generated from DNSPolicy.
    dnsConfig:
      # A list of DNS name server IP addresses. This will be appended to the base nameservers generated from
      # DNSPolicy. Duplicated nameservers will be removed.
      nameservers:

      # A list of DNS resolver options. This will be merged with the base options generated from DNSPolicy. Duplicated
      # entries will be removed. Resolution options given in Options will override those that appear in the base
      # DNSPolicy.
      options:

      # A list of DNS search domains for host-name lookup. This will be appended to the base search paths generated
      # from DNSPolicy. Duplicated search paths will be removed.
      searches:

    # Set DNS policy for the pod. Defaults to "ClusterFirst". Valid values are 'ClusterFirstWithHostNet',
    # 'ClusterFirst', 'Default' or 'None'. DNS parameters given in DNSConfig will be merged with the policy selected
    # with DNSPolicy. To have DNS options set along with hostNetwork, you have to specify DNS policy explicitly to
    # 'ClusterFirstWithHostNet'.
    dnsPolicy:

    # EnableServiceLinks indicates whether information about services should be injected into pod's environment
    # variables, matching the syntax of Docker links. Optional: Defaults to true.
    enableServiceLinks:

    # List of ephemeral containers run in this pod. Ephemeral containers may be run in an existing pod to perform
    # user-initiated actions such as debugging. This list cannot be specified when creating a pod, and it cannot be
    # modified by updating the pod spec. In order to add an ephemeral container to an existing pod, use the pod's
    # ephemeralcontainers subresource. This field is alpha-level and is only honored by servers that enable the
    # EphemeralContainers feature.
    ephemeralContainers:

    # HostAliases is an optional list of hosts and IPs that will be injected into the pod's hosts file if specified.
    # This is only valid for non-hostNetwork pods.
    hostAliases:

    # Use the host's ipc namespace. Optional: Default to false.
    hostIPC:

    # Host networking requested for this pod. Use the host's network namespace. If this option is set, the ports that
    # will be used must be specified. Default to false.
    hostNetwork:

    # Use the host's pid namespace. Optional: Default to false.
    hostPID:

    # Specifies the hostname of the Pod If not specified, the pod's hostname will be set to a system-defined value.
    hostname:

    # ImagePullSecrets is an optional list of references to secrets in the same namespace to use for pulling any of
    # the images used by this PodSpec. If specified, these secrets will be passed to individual puller implementations
    # for them to use. For example, in the case of docker, only DockerConfig type secrets are honored. More info:
    # https://kubernetes.io/docs/concepts/containers/images#specifying-imagepullsecrets-on-a-pod
    imagePullSecrets:

    # List of initialization containers belonging to the pod. Init containers are executed in order prior to
    # containers being started. If any init container fails, the pod is considered to have failed and is handled
    # according to its restartPolicy. The name for an init container or normal container must be unique among all
    # containers. Init containers may not have Lifecycle actions, Readiness probes, Liveness probes, or Startup
    # probes. The resourceRequirements of an init container are taken into account during scheduling by finding the
    # highest request/limit for each resource type, and then using the max of of that value or the sum of the normal
    # containers. Limits are applied to init containers in a similar fashion. Init containers cannot currently be
    # added or removed. Cannot be updated. More info:
    # https://kubernetes.io/docs/concepts/workloads/pods/init-containers/
    initContainers:

    # NodeName is a request to schedule this pod onto a specific node. If it is non-empty, the scheduler simply
    # schedules this pod onto that node, assuming that it fits resource requirements.
    nodeName:

    # NodeSelector is a selector which must be true for the pod to fit on a node. Selector which must match a node's
    # labels for the pod to be scheduled on that node. More info:
    # https://kubernetes.io/docs/concepts/configuration/assign-pod-node/
    nodeSelector:

    # Overhead represents the resource overhead associated with running a pod for a given RuntimeClass. This field
    # will be autopopulated at admission time by the RuntimeClass admission controller. If the RuntimeClass admission
    # controller is enabled, overhead must not be set in Pod create requests. The RuntimeClass admission controller
    # will reject Pod create requests which have the overhead already set. If RuntimeClass is configured and selected
    # in the PodSpec, Overhead will be set to the value defined in the corresponding RuntimeClass, otherwise it will
    # remain unset and treated as zero.
    overhead:

    # PreemptionPolicy is the Policy for preempting pods with lower priority. One of Never, PreemptLowerPriority.
    # Defaults to PreemptLowerPriority if unset. This field is alpha-level and is only honored by servers that enable
    # the NonPreemptingPriority feature.
    preemptionPolicy:

    # The priority value. Various system components use this field to find the priority of the pod. When Priority
    # Admission Controller is enabled, it prevents users from setting this field. The admission controller populates
    # this field from PriorityClassName. The higher the value, the higher the priority.
    priority:

    # If specified, indicates the pod's priority. "system-node-critical" and "system-cluster-critical" are two special
    # keywords which indicate the highest priorities with the former being the highest priority. Any other name must
    # be defined by creating a PriorityClass object with that name. If not specified, the pod priority will be default
    # or zero if there is no default.
    priorityClassName:

    # If specified, all readiness gates will be evaluated for pod readiness. A pod is ready when all its containers
    # are ready AND all conditions specified in the readiness gates have status equal to "True"
    readinessGates:

    # Restart policy for all containers within the pod. One of Always, OnFailure, Never. Default to Always. More info:
    # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#restart-policy
    restartPolicy:

    # RuntimeClassName refers to a RuntimeClass object in the node.k8s.io group, which should be used to run this pod.
    # If no RuntimeClass resource matches the named class, the pod will not be run. If unset or empty, the "legacy"
    # RuntimeClass will be used, which is an implicit class with an empty definition that uses the default runtime
    # handler.
    runtimeClassName:

    # If specified, the pod will be dispatched by specified scheduler. If not specified, the pod will be dispatched by
    # default scheduler.
    schedulerName:

    # PodSecurityContext holds pod-level security attributes and common container settings. Some fields are also
    # present in container.securityContext.  Field values of container.securityContext take precedence over field
    # values of PodSecurityContext.
    securityContext:
      # A special supplemental group that applies to all containers in a pod. Some volume types allow the Kubelet to
      # change the ownership of that volume to be owned by the pod:
      #
      # 1. The owning GID will be the FSGroup 2. The setgid bit is set (new files created in the volume will be owned
      # by FSGroup) 3. The permission bits are OR'd with rw-rw----
      #
      # If unset, the Kubelet will not modify the ownership and permissions of any volume.
      fsGroup:

      # fsGroupChangePolicy defines behavior of changing ownership and permission of the volume before being exposed
      # inside Pod. This field will only apply to volume types which support fsGroup based ownership(and permissions).
      # It will have no effect on ephemeral volume types such as: secret, configmaps and emptydir. Valid values are
      # "OnRootMismatch" and "Always". If not specified defaults to "Always".
      fsGroupChangePolicy:

      # The GID to run the entrypoint of the container process. Uses runtime default if unset. May also be set in
      # SecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in
      # SecurityContext takes precedence for that container.
      runAsGroup:

      # Indicates that the container must run as a non-root user. If true, the Kubelet will validate the image at
      # runtime to ensure that it does not run as UID 0 (root) and fail to start the container if it does. If unset or
      # false, no such validation will be performed. May also be set in SecurityContext.  If set in both
      # SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.
      runAsNonRoot:

      # The UID to run the entrypoint of the container process. Defaults to user specified in image metadata if
      # unspecified. May also be set in SecurityContext.  If set in both SecurityContext and PodSecurityContext, the
      # value specified in SecurityContext takes precedence for that container.
      runAsUser:

      # SELinuxOptions are the labels to be applied to the container
      seLinuxOptions:
        # Level is SELinux level label that applies to the container.
        level:

        # Role is a SELinux role label that applies to the container.
        role:

        # Type is a SELinux type label that applies to the container.
        type:

        # User is a SELinux user label that applies to the container.
        user:

      # A list of groups applied to the first process run in each container, in addition to the container's primary
      # GID.  If unspecified, no groups will be added to any container.
      supplementalGroups:

      # Sysctls hold a list of namespaced sysctls used for the pod. Pods with unsupported sysctls (by the container
      # runtime) might fail to launch.
      sysctls:

      # WindowsSecurityContextOptions contain Windows-specific options and credentials.
      windowsOptions:
        # GMSACredentialSpec is where the GMSA admission webhook (https://github.com/kubernetes-sigs/windows-gmsa)
        # inlines the contents of the GMSA credential spec named by the GMSACredentialSpecName field.
        gmsaCredentialSpec:

        # GMSACredentialSpecName is the name of the GMSA credential spec to use.
        gmsaCredentialSpecName:

        # The UserName in Windows to run the entrypoint of the container process. Defaults to the user specified in
        # image metadata if unspecified. May also be set in PodSecurityContext. If set in both SecurityContext and
        # PodSecurityContext, the value specified in SecurityContext takes precedence.
        runAsUserName:

    # DeprecatedServiceAccount is a depreciated alias for ServiceAccountName. Deprecated: Use serviceAccountName
    # instead.
    serviceAccount:

    # ServiceAccountName is the name of the ServiceAccount to use to run this pod. More info:
    # https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/
    serviceAccountName:

    # Share a single process namespace between all of the containers in a pod. When this is set containers will be
    # able to view and signal processes from other containers in the same pod, and the first process in each container
    # will not be assigned PID 1. HostPID and ShareProcessNamespace cannot both be set. Optional: Default to false.
    shareProcessNamespace:

    # If specified, the fully qualified Pod hostname will be "<hostname>.<subdomain>.<pod namespace>.svc.<cluster
    # domain>". If not specified, the pod will not have a domainname at all.
    subdomain:

    # Optional duration in seconds the pod needs to terminate gracefully. May be decreased in delete request. Value
    # must be non-negative integer. The value zero indicates delete immediately. If this value is nil, the default
    # grace period will be used instead. The grace period is the duration in seconds after the processes running in
    # the pod are sent a termination signal and the time when the processes are forcibly halted with a kill signal.
    # Set this value longer than the expected cleanup time for your process. Defaults to 30 seconds.
    terminationGracePeriodSeconds:

    # If specified, the pod's tolerations.
    tolerations:

    # TopologySpreadConstraints describes how a group of pods ought to spread across topology domains. Scheduler will
    # schedule pods in a way which abides by the constraints. This field is only honored by clusters that enable the
    # EvenPodsSpread feature. All topologySpreadConstraints are ANDed.
    topologySpreadConstraints:

    # List of volumes that can be mounted by containers belonging to the pod. More info:
    # https://kubernetes.io/docs/concepts/storage/volumes
    volumes:
```

## Configuration Keys

### `apiVersion`

The schema version of this config (currently not used).

| Type     | Allowed Values | Default          | Required |
| -------- | -------------- | ---------------- | -------- |
| `string` | "garden.io/v0" | `"garden.io/v0"` | Yes      |

### `kind`

The kind of action you want to define (one of Build, Deploy, Run or Test).

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `type`

The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will be defined by your configured providers.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `name`

A valid name for the action. Must be unique across all actions of the same _kind_ in your project.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `description`

A description of the action.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `source`

By default, the directory where the action is defined is used as the source for the build context.

You can override this by setting either `source.path` to another (POSIX-style) path relative to the action source directory, or `source.repository` to get the source from an external repository.

If using `source.path`, you must make sure the target path is in a git repository.

For `source.repository` behavior, please refer to the [Remote Sources guide](https://docs.garden.io/advanced/using-remote-sources).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `source.path`

[source](#source) > path

A relative POSIX-style path to the source directory for this action. You must make sure this path exists and is ina git repository!

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `source.repository`

[source](#source) > repository

When set, Garden will import the action source from this repository, but use this action configuration (and not scan for configs in the separate repository).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `source.repository.url`

[source](#source) > [repository](#sourcerepository) > url

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

| Type               | Required |
| ------------------ | -------- |
| `gitUrl \| string` | Yes      |

Example:

```yaml
source:
  ...
  repository:
    ...
    url: "git+https://github.com/org/repo.git#v2.0"
```

### `dependencies[]`

A list of other actions that this action depends on, and should be built, deployed or run (depending on the action type) before processing this action.

Each dependency should generally be expressed as a `"<kind>.<name>"` string, where _<kind>_ is one of `build`, `deploy`, `run` or `test`, and _<name>_ is the name of the action to depend on.

You may also optionally specify a dependency as an object, e.g. `{ kind: "Build", name: "some-image" }`.

Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency via template expressions.

| Type                     | Default | Required |
| ------------------------ | ------- | -------- |
| `array[actionReference]` | `[]`    | No       |

Example:

```yaml
dependencies:
  - build.my-image
  - deploy.api
```

### `disabled`

Set this to `true` to disable the action. You can use this with conditional template strings to disable actions based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name == "prod"}`). This can be handy when you only need certain actions for specific environments, e.g. only for development.

For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or built).

For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored. Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the action is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `include[]`

Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will affect the computed _version_ of the action.

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run when certain files are modified.

_Build_ actions have a different behavior, since they generally are based on some files in the source tree, so please reference the docs for more information on those.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
include:
  - my-app.js
  - some-assets/**/*
```

### `exclude[]`

Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's version.

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set `include` paths, or such paths inferred by providers. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect those, if you have large directories that should not be watched for changes.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
exclude:
  - tmp/**/*
  - '*.log'
```

### `variables`

A map of variables scoped to this particular action. These are resolved before any other parts of the action configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in that order. They may reference group-scoped and project-scoped variables, and generally can use any template strings normally allowed when resolving the action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `varfiles[]`

Specify a list of paths (relative to the directory where the action is defined) to a file containing variables, that we apply on top of the action-level `variables` field, and take precedence over group-level variables (if applicable) and project-level variables, in that order.

If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the previous ones.

The format of the files is determined by the configured file's extension:

* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type.
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

To use different varfiles in different environments, you can template in the environment name to the varfile name, e.g. `varfile: "my-action.\$\{environment.name\}.env` (this assumes that the corresponding varfiles exist).

If a listed varfile cannot be found, it is ignored.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

Example:

```yaml
varfiles:
  "my-action.env"
```

### `build`

Specify a _Build_ action, and resolve this action from the context of that Build.

For example, you might create an `exec` Build which prepares some manifests, and then reference that in a `kubernetes` _Deploy_ action, and the resulting manifests from the Build.

This would mean that instead of looking for manifest files relative to this action's location in your project structure, the output directory for the referenced `exec` Build would be the source.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `timeout`

Set a timeout for the run to complete, in seconds.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `spec`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.cacheResult`

[spec](#spec) > cacheResult

Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any time your project (or one or more of the task's dependants) is deployed. Otherwise the task is only re-run when its version changes (i.e. the module or one of its dependencies is modified), or when you run `garden run`.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `spec.command[]`

[spec](#spec) > command

The command/entrypoint used to run inside the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
spec:
  ...
  command:
    - /bin/sh
    - '-c'
```

### `spec.args[]`

[spec](#spec) > args

The arguments to pass to the command/entypoint used for execution.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
spec:
  ...
  args:
    - rake
    - 'db:migrate'
```

### `spec.env`

[spec](#spec) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
spec:
  ...
  env:
      - MY_VAR: some-value
        MY_SECRET_VAR:
          secretRef:
            name: my-secret
            key: some-key
      - {}
```

### `spec.artifacts[]`

[spec](#spec) > artifacts

Specify artifacts to copy out of the container after the run. The artifacts are stored locally under
the `.garden/artifacts` directory.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `spec.artifacts[].source`

[spec](#spec) > [artifacts](#specartifacts) > source

A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
spec:
  ...
  artifacts:
    - source: "/output/**/*"
```

### `spec.artifacts[].target`

[spec](#spec) > [artifacts](#specartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
spec:
  ...
  artifacts:
    - target: "outputs/foo/"
```

### `spec.namespace`

[spec](#spec) > namespace

A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.resource`

[spec](#spec) > resource

Specify a Kubernetes resource to derive the Pod spec from for the run.

This resource will be fetched from the target namespace, so you'll need to make sure it's been deployed previously (say, by configuring a dependency on a `helm` or `kubernetes` Deploy).

The following fields from the Pod will be used (if present) when executing the task:
* `affinity`
* `automountServiceAccountToken`
* `containers`
* `dnsConfig`
* `dnsPolicy`
* `enableServiceLinks`
* `hostAliases`
* `hostIPC`
* `hostNetwork`
* `hostPID`
* `hostname`
* `imagePullSecrets`
* `nodeName`
* `nodeSelector`
* `overhead`
* `preemptionPolicy`
* `priority`
* `priorityClassName`
* `runtimeClassName`
* `schedulerName`
* `securityContext`
* `serviceAccount`
* `serviceAccountName`
* `shareProcessNamespace`
* `subdomain`
* `tolerations`
* `topologySpreadConstraints`
* `volumes`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.resource.kind`

[spec](#spec) > [resource](#specresource) > kind

The kind of Kubernetes resource to find.

| Type     | Allowed Values                           | Required |
| -------- | ---------------------------------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | Yes      |

### `spec.resource.name`

[spec](#spec) > [resource](#specresource) > name

The name of the resource, of the specified `kind`. If specified, you must also specify `kind`.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.resource.podSelector`

[spec](#spec) > [resource](#specresource) > podSelector

A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.resource.containerName`

[spec](#spec) > [resource](#specresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec`

[spec](#spec) > podSpec

Supply a custom Pod specification. This should be a normal Kubernetes Pod manifest. Note that the spec will be modified for the run, including overriding with other fields you may set here (such as `args` and `env`), and removing certain fields that are not supported.

The following Pod spec fields from the will be used (if present) when executing the task:
* `affinity`
* `automountServiceAccountToken`
* `containers`
* `dnsConfig`
* `dnsPolicy`
* `enableServiceLinks`
* `hostAliases`
* `hostIPC`
* `hostNetwork`
* `hostPID`
* `hostname`
* `imagePullSecrets`
* `nodeName`
* `nodeSelector`
* `overhead`
* `preemptionPolicy`
* `priority`
* `priorityClassName`
* `runtimeClassName`
* `schedulerName`
* `securityContext`
* `serviceAccount`
* `serviceAccountName`
* `shareProcessNamespace`
* `subdomain`
* `tolerations`
* `topologySpreadConstraints`
* `volumes`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.activeDeadlineSeconds`

[spec](#spec) > [podSpec](#specpodspec) > activeDeadlineSeconds

Optional duration in seconds the pod may be active on the node relative to StartTime before the system will actively try to mark it failed and kill associated containers. Value must be a positive integer.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.affinity`

[spec](#spec) > [podSpec](#specpodspec) > affinity

Affinity is a group of affinity scheduling rules.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.nodeAffinity`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > nodeAffinity

Node affinity is a group of node affinity scheduling rules.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > preferredDuringSchedulingIgnoredDuringExecution

The scheduler will prefer to schedule pods to nodes that satisfy the affinity expressions specified by this field, but it may choose a node that violates one or more of the expressions. The node that is most preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling requirements (resource request, requiredDuringScheduling affinity expressions, etc.), compute a sum by iterating through the elements of this field and adding "weight" to the sum if the node matches the corresponding matchExpressions; the node(s) with the highest sum are the most preferred.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > requiredDuringSchedulingIgnoredDuringExecution

A node selector represents the union of the results of one or more label queries over a set of nodes; that is, it represents the OR of the selectors represented by the node selector terms.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecution) > nodeSelectorTerms

Required. A list of node selector terms. The terms are ORed.

| Type    | Required |
| ------- | -------- |
| `array` | Yes      |

### `spec.podSpec.affinity.podAffinity`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > podAffinity

Pod affinity is a group of inter pod affinity scheduling rules.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > preferredDuringSchedulingIgnoredDuringExecution

The scheduler will prefer to schedule pods to nodes that satisfy the affinity expressions specified by this field, but it may choose a node that violates one or more of the expressions. The node that is most preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling requirements (resource request, requiredDuringScheduling affinity expressions, etc.), compute a sum by iterating through the elements of this field and adding "weight" to the sum if the node has pods which matches the corresponding podAffinityTerm; the node(s) with the highest sum are the most preferred.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > requiredDuringSchedulingIgnoredDuringExecution

If the affinity requirements specified by this field are not met at scheduling time, the pod will not be scheduled onto the node. If the affinity requirements specified by this field cease to be met at some point during pod execution (e.g. due to a pod label update), the system may or may not try to eventually evict the pod from its node. When there are multiple elements, the lists of nodes corresponding to each podAffinityTerm are intersected, i.e. all terms must be satisfied.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAntiAffinity`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > podAntiAffinity

Pod anti affinity is a group of inter pod anti affinity scheduling rules.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > preferredDuringSchedulingIgnoredDuringExecution

The scheduler will prefer to schedule pods to nodes that satisfy the anti-affinity expressions specified by this field, but it may choose a node that violates one or more of the expressions. The node that is most preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling requirements (resource request, requiredDuringScheduling anti-affinity expressions, etc.), compute a sum by iterating through the elements of this field and adding "weight" to the sum if the node has pods which matches the corresponding podAffinityTerm; the node(s) with the highest sum are the most preferred.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > requiredDuringSchedulingIgnoredDuringExecution

If the anti-affinity requirements specified by this field are not met at scheduling time, the pod will not be scheduled onto the node. If the anti-affinity requirements specified by this field cease to be met at some point during pod execution (e.g. due to a pod label update), the system may or may not try to eventually evict the pod from its node. When there are multiple elements, the lists of nodes corresponding to each podAffinityTerm are intersected, i.e. all terms must be satisfied.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.automountServiceAccountToken`

[spec](#spec) > [podSpec](#specpodspec) > automountServiceAccountToken

AutomountServiceAccountToken indicates whether a service account token should be automatically mounted.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[]`

[spec](#spec) > [podSpec](#specpodspec) > containers

List of containers belonging to the pod. Containers cannot currently be added or removed. There must be at least one container in a Pod. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.dnsConfig`

[spec](#spec) > [podSpec](#specpodspec) > dnsConfig

PodDNSConfig defines the DNS parameters of a pod in addition to those generated from DNSPolicy.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.dnsConfig.nameservers[]`

[spec](#spec) > [podSpec](#specpodspec) > [dnsConfig](#specpodspecdnsconfig) > nameservers

A list of DNS name server IP addresses. This will be appended to the base nameservers generated from DNSPolicy. Duplicated nameservers will be removed.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.dnsConfig.options[]`

[spec](#spec) > [podSpec](#specpodspec) > [dnsConfig](#specpodspecdnsconfig) > options

A list of DNS resolver options. This will be merged with the base options generated from DNSPolicy. Duplicated entries will be removed. Resolution options given in Options will override those that appear in the base DNSPolicy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.dnsConfig.searches[]`

[spec](#spec) > [podSpec](#specpodspec) > [dnsConfig](#specpodspecdnsconfig) > searches

A list of DNS search domains for host-name lookup. This will be appended to the base search paths generated from DNSPolicy. Duplicated search paths will be removed.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.dnsPolicy`

[spec](#spec) > [podSpec](#specpodspec) > dnsPolicy

Set DNS policy for the pod. Defaults to "ClusterFirst". Valid values are 'ClusterFirstWithHostNet', 'ClusterFirst', 'Default' or 'None'. DNS parameters given in DNSConfig will be merged with the policy selected with DNSPolicy. To have DNS options set along with hostNetwork, you have to specify DNS policy explicitly to 'ClusterFirstWithHostNet'.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.enableServiceLinks`

[spec](#spec) > [podSpec](#specpodspec) > enableServiceLinks

EnableServiceLinks indicates whether information about services should be injected into pod's environment variables, matching the syntax of Docker links. Optional: Defaults to true.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[]`

[spec](#spec) > [podSpec](#specpodspec) > ephemeralContainers

List of ephemeral containers run in this pod. Ephemeral containers may be run in an existing pod to perform user-initiated actions such as debugging. This list cannot be specified when creating a pod, and it cannot be modified by updating the pod spec. In order to add an ephemeral container to an existing pod, use the pod's ephemeralcontainers subresource. This field is alpha-level and is only honored by servers that enable the EphemeralContainers feature.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.hostAliases[]`

[spec](#spec) > [podSpec](#specpodspec) > hostAliases

HostAliases is an optional list of hosts and IPs that will be injected into the pod's hosts file if specified. This is only valid for non-hostNetwork pods.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.hostIPC`

[spec](#spec) > [podSpec](#specpodspec) > hostIPC

Use the host's ipc namespace. Optional: Default to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.hostNetwork`

[spec](#spec) > [podSpec](#specpodspec) > hostNetwork

Host networking requested for this pod. Use the host's network namespace. If this option is set, the ports that will be used must be specified. Default to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.hostPID`

[spec](#spec) > [podSpec](#specpodspec) > hostPID

Use the host's pid namespace. Optional: Default to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.hostname`

[spec](#spec) > [podSpec](#specpodspec) > hostname

Specifies the hostname of the Pod If not specified, the pod's hostname will be set to a system-defined value.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.imagePullSecrets[]`

[spec](#spec) > [podSpec](#specpodspec) > imagePullSecrets

ImagePullSecrets is an optional list of references to secrets in the same namespace to use for pulling any of the images used by this PodSpec. If specified, these secrets will be passed to individual puller implementations for them to use. For example, in the case of docker, only DockerConfig type secrets are honored. More info: https://kubernetes.io/docs/concepts/containers/images#specifying-imagepullsecrets-on-a-pod

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[]`

[spec](#spec) > [podSpec](#specpodspec) > initContainers

List of initialization containers belonging to the pod. Init containers are executed in order prior to containers being started. If any init container fails, the pod is considered to have failed and is handled according to its restartPolicy. The name for an init container or normal container must be unique among all containers. Init containers may not have Lifecycle actions, Readiness probes, Liveness probes, or Startup probes. The resourceRequirements of an init container are taken into account during scheduling by finding the highest request/limit for each resource type, and then using the max of of that value or the sum of the normal containers. Limits are applied to init containers in a similar fashion. Init containers cannot currently be added or removed. Cannot be updated. More info: https://kubernetes.io/docs/concepts/workloads/pods/init-containers/

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.nodeName`

[spec](#spec) > [podSpec](#specpodspec) > nodeName

NodeName is a request to schedule this pod onto a specific node. If it is non-empty, the scheduler simply schedules this pod onto that node, assuming that it fits resource requirements.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.nodeSelector`

[spec](#spec) > [podSpec](#specpodspec) > nodeSelector

NodeSelector is a selector which must be true for the pod to fit on a node. Selector which must match a node's labels for the pod to be scheduled on that node. More info: https://kubernetes.io/docs/concepts/configuration/assign-pod-node/

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.overhead`

[spec](#spec) > [podSpec](#specpodspec) > overhead

Overhead represents the resource overhead associated with running a pod for a given RuntimeClass. This field will be autopopulated at admission time by the RuntimeClass admission controller. If the RuntimeClass admission controller is enabled, overhead must not be set in Pod create requests. The RuntimeClass admission controller will reject Pod create requests which have the overhead already set. If RuntimeClass is configured and selected in the PodSpec, Overhead will be set to the value defined in the corresponding RuntimeClass, otherwise it will remain unset and treated as zero.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.preemptionPolicy`

[spec](#spec) > [podSpec](#specpodspec) > preemptionPolicy

PreemptionPolicy is the Policy for preempting pods with lower priority. One of Never, PreemptLowerPriority. Defaults to PreemptLowerPriority if unset. This field is alpha-level and is only honored by servers that enable the NonPreemptingPriority feature.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.priority`

[spec](#spec) > [podSpec](#specpodspec) > priority

The priority value. Various system components use this field to find the priority of the pod. When Priority Admission Controller is enabled, it prevents users from setting this field. The admission controller populates this field from PriorityClassName. The higher the value, the higher the priority.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.priorityClassName`

[spec](#spec) > [podSpec](#specpodspec) > priorityClassName

If specified, indicates the pod's priority. "system-node-critical" and "system-cluster-critical" are two special keywords which indicate the highest priorities with the former being the highest priority. Any other name must be defined by creating a PriorityClass object with that name. If not specified, the pod priority will be default or zero if there is no default.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.readinessGates[]`

[spec](#spec) > [podSpec](#specpodspec) > readinessGates

If specified, all readiness gates will be evaluated for pod readiness. A pod is ready when all its containers are ready AND all conditions specified in the readiness gates have status equal to "True"

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.restartPolicy`

[spec](#spec) > [podSpec](#specpodspec) > restartPolicy

Restart policy for all containers within the pod. One of Always, OnFailure, Never. Default to Always. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#restart-policy

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.runtimeClassName`

[spec](#spec) > [podSpec](#specpodspec) > runtimeClassName

RuntimeClassName refers to a RuntimeClass object in the node.k8s.io group, which should be used to run this pod.  If no RuntimeClass resource matches the named class, the pod will not be run. If unset or empty, the "legacy" RuntimeClass will be used, which is an implicit class with an empty definition that uses the default runtime handler.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.schedulerName`

[spec](#spec) > [podSpec](#specpodspec) > schedulerName

If specified, the pod will be dispatched by specified scheduler. If not specified, the pod will be dispatched by default scheduler.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.securityContext`

[spec](#spec) > [podSpec](#specpodspec) > securityContext

PodSecurityContext holds pod-level security attributes and common container settings. Some fields are also present in container.securityContext.  Field values of container.securityContext take precedence over field values of PodSecurityContext.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.securityContext.fsGroup`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > fsGroup

A special supplemental group that applies to all containers in a pod. Some volume types allow the Kubelet to change the ownership of that volume to be owned by the pod:

1. The owning GID will be the FSGroup 2. The setgid bit is set (new files created in the volume will be owned by FSGroup) 3. The permission bits are OR'd with rw-rw----

If unset, the Kubelet will not modify the ownership and permissions of any volume.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.securityContext.fsGroupChangePolicy`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > fsGroupChangePolicy

fsGroupChangePolicy defines behavior of changing ownership and permission of the volume before being exposed inside Pod. This field will only apply to volume types which support fsGroup based ownership(and permissions). It will have no effect on ephemeral volume types such as: secret, configmaps and emptydir. Valid values are "OnRootMismatch" and "Always". If not specified defaults to "Always".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.securityContext.runAsGroup`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > runAsGroup

The GID to run the entrypoint of the container process. Uses runtime default if unset. May also be set in SecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence for that container.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.securityContext.runAsNonRoot`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > runAsNonRoot

Indicates that the container must run as a non-root user. If true, the Kubelet will validate the image at runtime to ensure that it does not run as UID 0 (root) and fail to start the container if it does. If unset or false, no such validation will be performed. May also be set in SecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.securityContext.runAsUser`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > runAsUser

The UID to run the entrypoint of the container process. Defaults to user specified in image metadata if unspecified. May also be set in SecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence for that container.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.securityContext.seLinuxOptions`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > seLinuxOptions

SELinuxOptions are the labels to be applied to the container

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.securityContext.seLinuxOptions.level`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > [seLinuxOptions](#specpodspecsecuritycontextselinuxoptions) > level

Level is SELinux level label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.securityContext.seLinuxOptions.role`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > [seLinuxOptions](#specpodspecsecuritycontextselinuxoptions) > role

Role is a SELinux role label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.securityContext.seLinuxOptions.type`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > [seLinuxOptions](#specpodspecsecuritycontextselinuxoptions) > type

Type is a SELinux type label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.securityContext.seLinuxOptions.user`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > [seLinuxOptions](#specpodspecsecuritycontextselinuxoptions) > user

User is a SELinux user label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.securityContext.supplementalGroups[]`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > supplementalGroups

A list of groups applied to the first process run in each container, in addition to the container's primary GID.  If unspecified, no groups will be added to any container.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.securityContext.sysctls[]`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > sysctls

Sysctls hold a list of namespaced sysctls used for the pod. Pods with unsupported sysctls (by the container runtime) might fail to launch.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.securityContext.windowsOptions`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > windowsOptions

WindowsSecurityContextOptions contain Windows-specific options and credentials.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.securityContext.windowsOptions.gmsaCredentialSpec`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > [windowsOptions](#specpodspecsecuritycontextwindowsoptions) > gmsaCredentialSpec

GMSACredentialSpec is where the GMSA admission webhook (https://github.com/kubernetes-sigs/windows-gmsa) inlines the contents of the GMSA credential spec named by the GMSACredentialSpecName field.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.securityContext.windowsOptions.gmsaCredentialSpecName`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > [windowsOptions](#specpodspecsecuritycontextwindowsoptions) > gmsaCredentialSpecName

GMSACredentialSpecName is the name of the GMSA credential spec to use.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.securityContext.windowsOptions.runAsUserName`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > [windowsOptions](#specpodspecsecuritycontextwindowsoptions) > runAsUserName

The UserName in Windows to run the entrypoint of the container process. Defaults to the user specified in image metadata if unspecified. May also be set in PodSecurityContext. If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.serviceAccount`

[spec](#spec) > [podSpec](#specpodspec) > serviceAccount

DeprecatedServiceAccount is a depreciated alias for ServiceAccountName. Deprecated: Use serviceAccountName instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.serviceAccountName`

[spec](#spec) > [podSpec](#specpodspec) > serviceAccountName

ServiceAccountName is the name of the ServiceAccount to use to run this pod. More info: https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.shareProcessNamespace`

[spec](#spec) > [podSpec](#specpodspec) > shareProcessNamespace

Share a single process namespace between all of the containers in a pod. When this is set containers will be able to view and signal processes from other containers in the same pod, and the first process in each container will not be assigned PID 1. HostPID and ShareProcessNamespace cannot both be set. Optional: Default to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.subdomain`

[spec](#spec) > [podSpec](#specpodspec) > subdomain

If specified, the fully qualified Pod hostname will be "<hostname>.<subdomain>.<pod namespace>.svc.<cluster domain>". If not specified, the pod will not have a domainname at all.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.terminationGracePeriodSeconds`

[spec](#spec) > [podSpec](#specpodspec) > terminationGracePeriodSeconds

Optional duration in seconds the pod needs to terminate gracefully. May be decreased in delete request. Value must be non-negative integer. The value zero indicates delete immediately. If this value is nil, the default grace period will be used instead. The grace period is the duration in seconds after the processes running in the pod are sent a termination signal and the time when the processes are forcibly halted with a kill signal. Set this value longer than the expected cleanup time for your process. Defaults to 30 seconds.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.tolerations[]`

[spec](#spec) > [podSpec](#specpodspec) > tolerations

If specified, the pod's tolerations.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.topologySpreadConstraints[]`

[spec](#spec) > [podSpec](#specpodspec) > topologySpreadConstraints

TopologySpreadConstraints describes how a group of pods ought to spread across topology domains. Scheduler will schedule pods in a way which abides by the constraints. This field is only honored by clusters that enable the EvenPodsSpread feature. All topologySpreadConstraints are ANDed.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[]`

[spec](#spec) > [podSpec](#specpodspec) > volumes

List of volumes that can be mounted by containers belonging to the pod. More info: https://kubernetes.io/docs/concepts/storage/volumes

| Type    | Required |
| ------- | -------- |
| `array` | No       |


## Outputs

The following keys are available via the `${actions.run.<name>}` template string key for `kubernetes-pod`
modules.

### `${actions.run.<name>.buildPath}`

The build path of the action/module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.my-run.buildPath}
```

### `${actions.run.<name>.name}`

The name of the action/module.

| Type     |
| -------- |
| `string` |

### `${actions.run.<name>.path}`

The source path of the action/module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.my-run.path}
```

### `${actions.run.<name>.var.*}`

A map of all variables defined in the module.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.run.<name>.var.<variable-name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.run.<name>.version}`

The current version of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.my-run.version}
```

### `${actions.run.<name>.outputs.log}`

The full log output from the executed action. (Pro-tip: Make it machine readable so it can be parsed by dependants)

| Type     | Default |
| -------- | ------- |
| `string` | `""`    |
