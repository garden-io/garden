---
title: "`kubernetes-pod` Run"
tocTitle: "`kubernetes-pod` Run"
---

# `kubernetes-pod` Run

## Description

Executes a Run in an ad-hoc instance of a Kubernetes Pod and waits for it to complete.

The pod spec can be provided directly via the `podSpec` field, or the `resource` field can be used to find the pod spec in the Kubernetes manifests provided via the `files` and/or `manifests` fields.

Below is the full schema reference for the action. For an introduction to configuring Garden, please look at our [Configuration
guide](../../../using-garden/configuration-overview.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`kubernetes-pod` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
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
  # A relative POSIX-style path to the source directory for this action. You must make sure this path exists and is in
  # a git repository!
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

kind:

# Set a timeout for the run to complete, in seconds.
timeout: 600

spec:
  # Set to false if you don't want the Runs's result to be cached. Use this if the Run needs to be run any time your
  # project (or one or more of the Run's dependants) is deployed. Otherwise the Run is only re-run when its version
  # changes, or when you run `garden run`.
  cacheResult: true

  # The command/entrypoint used to run inside the container.
  command:

  # The arguments to pass to the command/entrypoint used for execution.
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

  # List of Kubernetes resource manifests to be searched (using `resource`e for the pod spec for the Run. If `files`
  # is also specified, this is combined with the manifests read from the files.
  manifests:
    - # The API version of the resource.
      apiVersion:

      # The kind of the resource.
      kind:

      metadata:
        # The name of the resource.
        name:

  # POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests, and can include any
  # Garden template strings, which will be resolved before searching the manifests for the resource that contains the
  # Pod spec for the Run.
  files: []

  # Specify a Kubernetes resource to derive the Pod spec from for the Run.
  #
  # This resource will be selected from the manifests provided in this Run's `files` or `manifests` config field.
  #
  # The following fields from the Pod will be used (if present) when executing the Run:
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
  # modified for the Run, including overriding with other fields you may set here (such as `args` and `env`), and
  # removing certain fields that are not supported.
  #
  # The following Pod spec fields from the selected `resource` will be used (if present) when executing the Run:
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
          - # A null or empty node selector term matches no objects. The requirements of them are ANDed. The
            # TopologySelectorTerm type implements a subset of the NodeSelectorTerm.
            preference:
              # A list of node selector requirements by node's labels.
              matchExpressions:
                - # The label key that the selector applies to.
                  key:

                  # Represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists,
                  # DoesNotExist. Gt, and Lt.
                  operator:

                  # An array of string values. If the operator is In or NotIn, the values array must be non-empty. If
                  # the operator is Exists or DoesNotExist, the values array must be empty. If the operator is Gt or
                  # Lt, the values array must have a single element, which will be interpreted as an integer. This
                  # array is replaced during a strategic merge patch.
                  values:

              # A list of node selector requirements by node's fields.
              matchFields:
                - # The label key that the selector applies to.
                  key:

                  # Represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists,
                  # DoesNotExist. Gt, and Lt.
                  operator:

                  # An array of string values. If the operator is In or NotIn, the values array must be non-empty. If
                  # the operator is Exists or DoesNotExist, the values array must be empty. If the operator is Gt or
                  # Lt, the values array must have a single element, which will be interpreted as an integer. This
                  # array is replaced during a strategic merge patch.
                  values:

            # Weight associated with matching the corresponding nodeSelectorTerm, in the range 1-100.
            weight:

        # A node selector represents the union of the results of one or more label queries over a set of nodes; that
        # is, it represents the OR of the selectors represented by the node selector terms.
        requiredDuringSchedulingIgnoredDuringExecution:
          # Required. A list of node selector terms. The terms are ORed.
          nodeSelectorTerms:
            - # A list of node selector requirements by node's labels.
              matchExpressions:
                - # The label key that the selector applies to.
                  key:

                  # Represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists,
                  # DoesNotExist. Gt, and Lt.
                  operator:

                  # An array of string values. If the operator is In or NotIn, the values array must be non-empty. If
                  # the operator is Exists or DoesNotExist, the values array must be empty. If the operator is Gt or
                  # Lt, the values array must have a single element, which will be interpreted as an integer. This
                  # array is replaced during a strategic merge patch.
                  values:

              # A list of node selector requirements by node's fields.
              matchFields:
                - # The label key that the selector applies to.
                  key:

                  # Represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists,
                  # DoesNotExist. Gt, and Lt.
                  operator:

                  # An array of string values. If the operator is In or NotIn, the values array must be non-empty. If
                  # the operator is Exists or DoesNotExist, the values array must be empty. If the operator is Gt or
                  # Lt, the values array must have a single element, which will be interpreted as an integer. This
                  # array is replaced during a strategic merge patch.
                  values:

      # Pod affinity is a group of inter pod affinity scheduling rules.
      podAffinity:
        # The scheduler will prefer to schedule pods to nodes that satisfy the affinity expressions specified by this
        # field, but it may choose a node that violates one or more of the expressions. The node that is most
        # preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling
        # requirements (resource request, requiredDuringScheduling affinity expressions, etc.), compute a sum by
        # iterating through the elements of this field and adding "weight" to the sum if the node has pods which
        # matches the corresponding podAffinityTerm; the node(s) with the highest sum are the most preferred.
        preferredDuringSchedulingIgnoredDuringExecution:
          - # Defines a set of pods (namely those matching the labelSelector relative to the given namespace(s)) that
            # this pod should be co-located (affinity) or not co-located (anti-affinity) with, where co-located is
            # defined as running on a node whose value of the label with key <topologyKey> matches that of any node on
            # which a pod of the set of pods is running
            podAffinityTerm:
              # A label selector is a label query over a set of resources. The result of matchLabels and
              # matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches
              # no objects.
              labelSelector:
                # matchExpressions is a list of label selector requirements. The requirements are ANDed.
                matchExpressions:
                  - # key is the label key that the selector applies to.
                    key:

                    # operator represents a key's relationship to a set of values. Valid operators are In, NotIn,
                    # Exists and DoesNotExist.
                    operator:

                    # values is an array of string values. If the operator is In or NotIn, the values array must be
                    # non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array
                    # is replaced during a strategic merge patch.
                    values:

                # matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent
                # to an element of matchExpressions, whose key field is "key", the operator is "In", and the values
                # array contains only "value". The requirements are ANDed.
                matchLabels:

              # namespaces specifies which namespaces the labelSelector applies to (matches against); null or empty
              # list means "this pod's namespace"
              namespaces:

              # This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching the
              # labelSelector in the specified namespaces, where co-located is defined as running on a node whose
              # value of the label with key topologyKey matches that of any node on which any of the selected pods is
              # running. Empty topologyKey is not allowed.
              topologyKey:

            # weight associated with matching the corresponding podAffinityTerm, in the range 1-100.
            weight:

        # If the affinity requirements specified by this field are not met at scheduling time, the pod will not be
        # scheduled onto the node. If the affinity requirements specified by this field cease to be met at some point
        # during pod execution (e.g. due to a pod label update), the system may or may not try to eventually evict the
        # pod from its node. When there are multiple elements, the lists of nodes corresponding to each
        # podAffinityTerm are intersected, i.e. all terms must be satisfied.
        requiredDuringSchedulingIgnoredDuringExecution:
          - # A label selector is a label query over a set of resources. The result of matchLabels and
            # matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches
            # no objects.
            labelSelector:
              # matchExpressions is a list of label selector requirements. The requirements are ANDed.
              matchExpressions:
                - # key is the label key that the selector applies to.
                  key:

                  # operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists
                  # and DoesNotExist.
                  operator:

                  # values is an array of string values. If the operator is In or NotIn, the values array must be
                  # non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array
                  # is replaced during a strategic merge patch.
                  values:

              # matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent
              # to an element of matchExpressions, whose key field is "key", the operator is "In", and the values
              # array contains only "value". The requirements are ANDed.
              matchLabels:

            # namespaces specifies which namespaces the labelSelector applies to (matches against); null or empty list
            # means "this pod's namespace"
            namespaces:

            # This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching the
            # labelSelector in the specified namespaces, where co-located is defined as running on a node whose value
            # of the label with key topologyKey matches that of any node on which any of the selected pods is running.
            # Empty topologyKey is not allowed.
            topologyKey:

      # Pod anti affinity is a group of inter pod anti affinity scheduling rules.
      podAntiAffinity:
        # The scheduler will prefer to schedule pods to nodes that satisfy the anti-affinity expressions specified by
        # this field, but it may choose a node that violates one or more of the expressions. The node that is most
        # preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling
        # requirements (resource request, requiredDuringScheduling anti-affinity expressions, etc.), compute a sum by
        # iterating through the elements of this field and adding "weight" to the sum if the node has pods which
        # matches the corresponding podAffinityTerm; the node(s) with the highest sum are the most preferred.
        preferredDuringSchedulingIgnoredDuringExecution:
          - # Defines a set of pods (namely those matching the labelSelector relative to the given namespace(s)) that
            # this pod should be co-located (affinity) or not co-located (anti-affinity) with, where co-located is
            # defined as running on a node whose value of the label with key <topologyKey> matches that of any node on
            # which a pod of the set of pods is running
            podAffinityTerm:
              # A label selector is a label query over a set of resources. The result of matchLabels and
              # matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches
              # no objects.
              labelSelector:
                # matchExpressions is a list of label selector requirements. The requirements are ANDed.
                matchExpressions:
                  - # key is the label key that the selector applies to.
                    key:

                    # operator represents a key's relationship to a set of values. Valid operators are In, NotIn,
                    # Exists and DoesNotExist.
                    operator:

                    # values is an array of string values. If the operator is In or NotIn, the values array must be
                    # non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array
                    # is replaced during a strategic merge patch.
                    values:

                # matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent
                # to an element of matchExpressions, whose key field is "key", the operator is "In", and the values
                # array contains only "value". The requirements are ANDed.
                matchLabels:

              # namespaces specifies which namespaces the labelSelector applies to (matches against); null or empty
              # list means "this pod's namespace"
              namespaces:

              # This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching the
              # labelSelector in the specified namespaces, where co-located is defined as running on a node whose
              # value of the label with key topologyKey matches that of any node on which any of the selected pods is
              # running. Empty topologyKey is not allowed.
              topologyKey:

            # weight associated with matching the corresponding podAffinityTerm, in the range 1-100.
            weight:

        # If the anti-affinity requirements specified by this field are not met at scheduling time, the pod will not
        # be scheduled onto the node. If the anti-affinity requirements specified by this field cease to be met at
        # some point during pod execution (e.g. due to a pod label update), the system may or may not try to
        # eventually evict the pod from its node. When there are multiple elements, the lists of nodes corresponding
        # to each podAffinityTerm are intersected, i.e. all terms must be satisfied.
        requiredDuringSchedulingIgnoredDuringExecution:
          - # A label selector is a label query over a set of resources. The result of matchLabels and
            # matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches
            # no objects.
            labelSelector:
              # matchExpressions is a list of label selector requirements. The requirements are ANDed.
              matchExpressions:
                - # key is the label key that the selector applies to.
                  key:

                  # operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists
                  # and DoesNotExist.
                  operator:

                  # values is an array of string values. If the operator is In or NotIn, the values array must be
                  # non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array
                  # is replaced during a strategic merge patch.
                  values:

              # matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent
              # to an element of matchExpressions, whose key field is "key", the operator is "In", and the values
              # array contains only "value". The requirements are ANDed.
              matchLabels:

            # namespaces specifies which namespaces the labelSelector applies to (matches against); null or empty list
            # means "this pod's namespace"
            namespaces:

            # This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching the
            # labelSelector in the specified namespaces, where co-located is defined as running on a node whose value
            # of the label with key topologyKey matches that of any node on which any of the selected pods is running.
            # Empty topologyKey is not allowed.
            topologyKey:

    # AutomountServiceAccountToken indicates whether a service account token should be automatically mounted.
    automountServiceAccountToken:

    # List of containers belonging to the pod. Containers cannot currently be added or removed. There must be at least
    # one container in a Pod. Cannot be updated.
    containers:
      - # Arguments to the entrypoint. The docker image's CMD is used if this is not provided. Variable references
        # $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference
        # in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie:
        # $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not.
        # Cannot be updated. More info:
        # https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell
        args:

        # Entrypoint array. Not executed within a shell. The docker image's ENTRYPOINT is used if this is not
        # provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable
        # cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be
        # escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether
        # the variable exists or not. Cannot be updated. More info:
        # https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell
        command:

        # List of environment variables to set in the container. Cannot be updated.
        env:
          - # Name of the environment variable. Must be a C_IDENTIFIER.
            name:

            # Variable references $(VAR_NAME) are expanded using the previous defined environment variables in the
            # container and any service environment variables. If a variable cannot be resolved, the reference in the
            # input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie:
            # $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or
            # not. Defaults to "".
            value:

            # EnvVarSource represents a source for the value of an EnvVar.
            valueFrom:
              # Selects a key from a ConfigMap.
              configMapKeyRef:
                # The key to select.
                key:

                # Name of the referent. More info:
                # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                name:

                # Specify whether the ConfigMap or its key must be defined
                optional:

              # ObjectFieldSelector selects an APIVersioned field of an object.
              fieldRef:
                # Version of the schema the FieldPath is written in terms of, defaults to "v1".
                apiVersion:

                # Path of the field to select in the specified API version.
                fieldPath:

              # ResourceFieldSelector represents container resources (cpu, memory) and their output format
              resourceFieldRef:
                # Container name: required for volumes, optional for env vars
                containerName:

                divisor:

                # Required: resource to select
                resource:

              # SecretKeySelector selects a key of a Secret.
              secretKeyRef:
                # The key of the secret to select from.  Must be a valid secret key.
                key:

                # Name of the referent. More info:
                # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                name:

                # Specify whether the Secret or its key must be defined
                optional:

        # List of sources to populate environment variables in the container. The keys defined within a source must be
        # a C_IDENTIFIER. All invalid keys will be reported as an event when the container is starting. When a key
        # exists in multiple sources, the value associated with the last source will take precedence. Values defined
        # by an Env with a duplicate key will take precedence. Cannot be updated.
        envFrom:
          - # ConfigMapEnvSource selects a ConfigMap to populate the environment variables with.
            #
            # The contents of the target ConfigMap's Data field will represent the key-value pairs as environment
            # variables.
            configMapRef:
              # Name of the referent. More info:
              # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
              name:

              # Specify whether the ConfigMap must be defined
              optional:

            # An optional identifier to prepend to each key in the ConfigMap. Must be a C_IDENTIFIER.
            prefix:

            # SecretEnvSource selects a Secret to populate the environment variables with.
            #
            # The contents of the target Secret's Data field will represent the key-value pairs as environment
            # variables.
            secretRef:
              # Name of the referent. More info:
              # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
              name:

              # Specify whether the Secret must be defined
              optional:

        # Docker image name. More info: https://kubernetes.io/docs/concepts/containers/images This field is optional
        # to allow higher level config management to default or override container images in workload controllers like
        # Deployments and StatefulSets.
        image:

        # Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is specified, or
        # IfNotPresent otherwise. Cannot be updated. More info:
        # https://kubernetes.io/docs/concepts/containers/images#updating-images
        imagePullPolicy:

        # Lifecycle describes actions that the management system should take in response to container lifecycle
        # events. For the PostStart and PreStop lifecycle handlers, management of the container blocks until the
        # action is complete, unless the container process fails, in which case the handler is aborted.
        lifecycle:
          # Handler defines a specific action that should be taken
          postStart:
            # ExecAction describes a "run in container" action.
            exec:
              # Command is the command line to execute inside the container, the working directory for the command  is
              # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell,
              # so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call
              # out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
              command:

            # HTTPGetAction describes an action based on HTTP Get requests.
            httpGet:
              # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders
              # instead.
              host:

              # Custom headers to set in the request. HTTP allows repeated headers.
              httpHeaders:
                - # The header field name
                  name:

                  # The header field value
                  value:

              # Path to access on the HTTP server.
              path:

              port:

              # Scheme to use for connecting to the host. Defaults to HTTP.
              scheme:

            # TCPSocketAction describes an action based on opening a socket
            tcpSocket:
              # Optional: Host name to connect to, defaults to the pod IP.
              host:

              port:

          # Handler defines a specific action that should be taken
          preStop:
            # ExecAction describes a "run in container" action.
            exec:
              # Command is the command line to execute inside the container, the working directory for the command  is
              # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell,
              # so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call
              # out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
              command:

            # HTTPGetAction describes an action based on HTTP Get requests.
            httpGet:
              # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders
              # instead.
              host:

              # Custom headers to set in the request. HTTP allows repeated headers.
              httpHeaders:
                - # The header field name
                  name:

                  # The header field value
                  value:

              # Path to access on the HTTP server.
              path:

              port:

              # Scheme to use for connecting to the host. Defaults to HTTP.
              scheme:

            # TCPSocketAction describes an action based on opening a socket
            tcpSocket:
              # Optional: Host name to connect to, defaults to the pod IP.
              host:

              port:

        # Probe describes a health check to be performed against a container to determine whether it is alive or ready
        # to receive traffic.
        livenessProbe:
          # ExecAction describes a "run in container" action.
          exec:
            # Command is the command line to execute inside the container, the working directory for the command  is
            # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so
            # traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to
            # that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
            command:

          # Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3.
          # Minimum value is 1.
          failureThreshold:

          # HTTPGetAction describes an action based on HTTP Get requests.
          httpGet:
            # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.
            host:

            # Custom headers to set in the request. HTTP allows repeated headers.
            httpHeaders:
              - # The header field name
                name:

                # The header field value
                value:

            # Path to access on the HTTP server.
            path:

            port:

            # Scheme to use for connecting to the host. Defaults to HTTP.
            scheme:

          # Number of seconds after the container has started before liveness probes are initiated. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          initialDelaySeconds:

          # How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.
          periodSeconds:

          # Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to
          # 1. Must be 1 for liveness and startup. Minimum value is 1.
          successThreshold:

          # TCPSocketAction describes an action based on opening a socket
          tcpSocket:
            # Optional: Host name to connect to, defaults to the pod IP.
            host:

            port:

          # Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          timeoutSeconds:

        # Name of the container specified as a DNS_LABEL. Each container in a pod must have a unique name (DNS_LABEL).
        # Cannot be updated.
        name:

        # List of ports to expose from the container. Exposing a port here gives the system additional information
        # about the network connections a container uses, but is primarily informational. Not specifying a port here
        # DOES NOT prevent that port from being exposed. Any port which is listening on the default "0.0.0.0" address
        # inside a container will be accessible from the network. Cannot be updated.
        ports:
          - # Number of port to expose on the pod's IP address. This must be a valid port number, 0 < x < 65536.
            containerPort:

            # What host IP to bind the external port to.
            hostIP:

            # Number of port to expose on the host. If specified, this must be a valid port number, 0 < x < 65536. If
            # HostNetwork is specified, this must match ContainerPort. Most containers do not need this.
            hostPort:

            # If specified, this must be an IANA_SVC_NAME and unique within the pod. Each named port in a pod must
            # have a unique name. Name for the port that can be referred to by services.
            name:

            # Protocol for port. Must be UDP, TCP, or SCTP. Defaults to "TCP".
            protocol:

        # Probe describes a health check to be performed against a container to determine whether it is alive or ready
        # to receive traffic.
        readinessProbe:
          # ExecAction describes a "run in container" action.
          exec:
            # Command is the command line to execute inside the container, the working directory for the command  is
            # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so
            # traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to
            # that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
            command:

          # Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3.
          # Minimum value is 1.
          failureThreshold:

          # HTTPGetAction describes an action based on HTTP Get requests.
          httpGet:
            # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.
            host:

            # Custom headers to set in the request. HTTP allows repeated headers.
            httpHeaders:
              - # The header field name
                name:

                # The header field value
                value:

            # Path to access on the HTTP server.
            path:

            port:

            # Scheme to use for connecting to the host. Defaults to HTTP.
            scheme:

          # Number of seconds after the container has started before liveness probes are initiated. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          initialDelaySeconds:

          # How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.
          periodSeconds:

          # Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to
          # 1. Must be 1 for liveness and startup. Minimum value is 1.
          successThreshold:

          # TCPSocketAction describes an action based on opening a socket
          tcpSocket:
            # Optional: Host name to connect to, defaults to the pod IP.
            host:

            port:

          # Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          timeoutSeconds:

        # ResourceRequirements describes the compute resource requirements.
        resources:
          # Limits describes the maximum amount of compute resources allowed. More info:
          # https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/
          limits:

          # Requests describes the minimum amount of compute resources required. If Requests is omitted for a
          # container, it defaults to Limits if that is explicitly specified, otherwise to an implementation-defined
          # value. More info: https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/
          requests:

        # SecurityContext holds security configuration that will be applied to a container. Some fields are present in
        # both SecurityContext and PodSecurityContext.  When both are set, the values in SecurityContext take
        # precedence.
        securityContext:
          # AllowPrivilegeEscalation controls whether a process can gain more privileges than its parent process. This
          # bool directly controls if the no_new_privs flag will be set on the container process.
          # AllowPrivilegeEscalation is true always when the container is: 1) run as Privileged 2) has CAP_SYS_ADMIN
          allowPrivilegeEscalation:

          # Adds and removes POSIX capabilities from running containers.
          capabilities:
            # Added capabilities
            add:

            # Removed capabilities
            drop:

          # Run container in privileged mode. Processes in privileged containers are essentially equivalent to root on
          # the host. Defaults to false.
          privileged:

          # procMount denotes the type of proc mount to use for the containers. The default is DefaultProcMount which
          # uses the container runtime defaults for readonly paths and masked paths. This requires the ProcMountType
          # feature flag to be enabled.
          procMount:

          # Whether this container has a read-only root filesystem. Default is false.
          readOnlyRootFilesystem:

          # The GID to run the entrypoint of the container process. Uses runtime default if unset. May also be set in
          # PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in
          # SecurityContext takes precedence.
          runAsGroup:

          # Indicates that the container must run as a non-root user. If true, the Kubelet will validate the image at
          # runtime to ensure that it does not run as UID 0 (root) and fail to start the container if it does. If
          # unset or false, no such validation will be performed. May also be set in PodSecurityContext.  If set in
          # both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.
          runAsNonRoot:

          # The UID to run the entrypoint of the container process. Defaults to user specified in image metadata if
          # unspecified. May also be set in PodSecurityContext.  If set in both SecurityContext and
          # PodSecurityContext, the value specified in SecurityContext takes precedence.
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

          # WindowsSecurityContextOptions contain Windows-specific options and credentials.
          windowsOptions:
            # GMSACredentialSpec is where the GMSA admission webhook (https://github.com/kubernetes-sigs/windows-gmsa)
            # inlines the contents of the GMSA credential spec named by the GMSACredentialSpecName field.
            gmsaCredentialSpec:

            # GMSACredentialSpecName is the name of the GMSA credential spec to use.
            gmsaCredentialSpecName:

            # The UserName in Windows to run the entrypoint of the container process. Defaults to the user specified
            # in image metadata if unspecified. May also be set in PodSecurityContext. If set in both SecurityContext
            # and PodSecurityContext, the value specified in SecurityContext takes precedence.
            runAsUserName:

        # Probe describes a health check to be performed against a container to determine whether it is alive or ready
        # to receive traffic.
        startupProbe:
          # ExecAction describes a "run in container" action.
          exec:
            # Command is the command line to execute inside the container, the working directory for the command  is
            # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so
            # traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to
            # that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
            command:

          # Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3.
          # Minimum value is 1.
          failureThreshold:

          # HTTPGetAction describes an action based on HTTP Get requests.
          httpGet:
            # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.
            host:

            # Custom headers to set in the request. HTTP allows repeated headers.
            httpHeaders:
              - # The header field name
                name:

                # The header field value
                value:

            # Path to access on the HTTP server.
            path:

            port:

            # Scheme to use for connecting to the host. Defaults to HTTP.
            scheme:

          # Number of seconds after the container has started before liveness probes are initiated. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          initialDelaySeconds:

          # How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.
          periodSeconds:

          # Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to
          # 1. Must be 1 for liveness and startup. Minimum value is 1.
          successThreshold:

          # TCPSocketAction describes an action based on opening a socket
          tcpSocket:
            # Optional: Host name to connect to, defaults to the pod IP.
            host:

            port:

          # Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          timeoutSeconds:

        # Whether this container should allocate a buffer for stdin in the container runtime. If this is not set,
        # reads from stdin in the container will always result in EOF. Default is false.
        stdin:

        # Whether the container runtime should close the stdin channel after it has been opened by a single attach.
        # When stdin is true the stdin stream will remain open across multiple attach sessions. If stdinOnce is set to
        # true, stdin is opened on container start, is empty until the first client attaches to stdin, and then
        # remains open and accepts data until the client disconnects, at which time stdin is closed and remains closed
        # until the container is restarted. If this flag is false, a container processes that reads from stdin will
        # never receive an EOF. Default is false
        stdinOnce:

        # Optional: Path at which the file to which the container's termination message will be written is mounted
        # into the container's filesystem. Message written is intended to be brief final status, such as an assertion
        # failure message. Will be truncated by the node if greater than 4096 bytes. The total message length across
        # all containers will be limited to 12kb. Defaults to /dev/termination-log. Cannot be updated.
        terminationMessagePath:

        # Indicate how the termination message should be populated. File will use the contents of
        # terminationMessagePath to populate the container status message on both success and failure.
        # FallbackToLogsOnError will use the last chunk of container log output if the termination message file is
        # empty and the container exited with an error. The log output is limited to 2048 bytes or 80 lines, whichever
        # is smaller. Defaults to File. Cannot be updated.
        terminationMessagePolicy:

        # Whether this container should allocate a TTY for itself, also requires 'stdin' to be true. Default is false.
        tty:

        # volumeDevices is the list of block devices to be used by the container.
        volumeDevices:
          - # devicePath is the path inside of the container that the device will be mapped to.
            devicePath:

            # name must match the name of a persistentVolumeClaim in the pod
            name:

        # Pod volumes to mount into the container's filesystem. Cannot be updated.
        volumeMounts:
          - # Path within the container at which the volume should be mounted.  Must not contain ':'.
            mountPath:

            # mountPropagation determines how mounts are propagated from the host to container and the other way
            # around. When not set, MountPropagationNone is used. This field is beta in 1.10.
            mountPropagation:

            # This must match the Name of a Volume.
            name:

            # Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false.
            readOnly:

            # Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's
            # root).
            subPath:

            # Expanded path within the volume from which the container's volume should be mounted. Behaves similarly
            # to SubPath but environment variable references $(VAR_NAME) are expanded using the container's
            # environment. Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive.
            subPathExpr:

        # Container's working directory. If not specified, the container runtime's default will be used, which might
        # be configured in the container image. Cannot be updated.
        workingDir:

    # PodDNSConfig defines the DNS parameters of a pod in addition to those generated from DNSPolicy.
    dnsConfig:
      # A list of DNS name server IP addresses. This will be appended to the base nameservers generated from
      # DNSPolicy. Duplicated nameservers will be removed.
      nameservers:

      # A list of DNS resolver options. This will be merged with the base options generated from DNSPolicy. Duplicated
      # entries will be removed. Resolution options given in Options will override those that appear in the base
      # DNSPolicy.
      options:
        - # Required.
          name:

          value:

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
      - # Arguments to the entrypoint. The docker image's CMD is used if this is not provided. Variable references
        # $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference
        # in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie:
        # $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not.
        # Cannot be updated. More info:
        # https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell
        args:

        # Entrypoint array. Not executed within a shell. The docker image's ENTRYPOINT is used if this is not
        # provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable
        # cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be
        # escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether
        # the variable exists or not. Cannot be updated. More info:
        # https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell
        command:

        # List of environment variables to set in the container. Cannot be updated.
        env:
          - # Name of the environment variable. Must be a C_IDENTIFIER.
            name:

            # Variable references $(VAR_NAME) are expanded using the previous defined environment variables in the
            # container and any service environment variables. If a variable cannot be resolved, the reference in the
            # input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie:
            # $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or
            # not. Defaults to "".
            value:

            # EnvVarSource represents a source for the value of an EnvVar.
            valueFrom:
              # Selects a key from a ConfigMap.
              configMapKeyRef:
                # The key to select.
                key:

                # Name of the referent. More info:
                # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                name:

                # Specify whether the ConfigMap or its key must be defined
                optional:

              # ObjectFieldSelector selects an APIVersioned field of an object.
              fieldRef:
                # Version of the schema the FieldPath is written in terms of, defaults to "v1".
                apiVersion:

                # Path of the field to select in the specified API version.
                fieldPath:

              # ResourceFieldSelector represents container resources (cpu, memory) and their output format
              resourceFieldRef:
                # Container name: required for volumes, optional for env vars
                containerName:

                divisor:

                # Required: resource to select
                resource:

              # SecretKeySelector selects a key of a Secret.
              secretKeyRef:
                # The key of the secret to select from.  Must be a valid secret key.
                key:

                # Name of the referent. More info:
                # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                name:

                # Specify whether the Secret or its key must be defined
                optional:

        # List of sources to populate environment variables in the container. The keys defined within a source must be
        # a C_IDENTIFIER. All invalid keys will be reported as an event when the container is starting. When a key
        # exists in multiple sources, the value associated with the last source will take precedence. Values defined
        # by an Env with a duplicate key will take precedence. Cannot be updated.
        envFrom:
          - # ConfigMapEnvSource selects a ConfigMap to populate the environment variables with.
            #
            # The contents of the target ConfigMap's Data field will represent the key-value pairs as environment
            # variables.
            configMapRef:
              # Name of the referent. More info:
              # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
              name:

              # Specify whether the ConfigMap must be defined
              optional:

            # An optional identifier to prepend to each key in the ConfigMap. Must be a C_IDENTIFIER.
            prefix:

            # SecretEnvSource selects a Secret to populate the environment variables with.
            #
            # The contents of the target Secret's Data field will represent the key-value pairs as environment
            # variables.
            secretRef:
              # Name of the referent. More info:
              # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
              name:

              # Specify whether the Secret must be defined
              optional:

        # Docker image name. More info: https://kubernetes.io/docs/concepts/containers/images
        image:

        # Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is specified, or
        # IfNotPresent otherwise. Cannot be updated. More info:
        # https://kubernetes.io/docs/concepts/containers/images#updating-images
        imagePullPolicy:

        # Lifecycle describes actions that the management system should take in response to container lifecycle
        # events. For the PostStart and PreStop lifecycle handlers, management of the container blocks until the
        # action is complete, unless the container process fails, in which case the handler is aborted.
        lifecycle:
          # Handler defines a specific action that should be taken
          postStart:
            # ExecAction describes a "run in container" action.
            exec:
              # Command is the command line to execute inside the container, the working directory for the command  is
              # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell,
              # so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call
              # out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
              command:

            # HTTPGetAction describes an action based on HTTP Get requests.
            httpGet:
              # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders
              # instead.
              host:

              # Custom headers to set in the request. HTTP allows repeated headers.
              httpHeaders:
                - # The header field name
                  name:

                  # The header field value
                  value:

              # Path to access on the HTTP server.
              path:

              port:

              # Scheme to use for connecting to the host. Defaults to HTTP.
              scheme:

            # TCPSocketAction describes an action based on opening a socket
            tcpSocket:
              # Optional: Host name to connect to, defaults to the pod IP.
              host:

              port:

          # Handler defines a specific action that should be taken
          preStop:
            # ExecAction describes a "run in container" action.
            exec:
              # Command is the command line to execute inside the container, the working directory for the command  is
              # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell,
              # so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call
              # out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
              command:

            # HTTPGetAction describes an action based on HTTP Get requests.
            httpGet:
              # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders
              # instead.
              host:

              # Custom headers to set in the request. HTTP allows repeated headers.
              httpHeaders:
                - # The header field name
                  name:

                  # The header field value
                  value:

              # Path to access on the HTTP server.
              path:

              port:

              # Scheme to use for connecting to the host. Defaults to HTTP.
              scheme:

            # TCPSocketAction describes an action based on opening a socket
            tcpSocket:
              # Optional: Host name to connect to, defaults to the pod IP.
              host:

              port:

        # Probe describes a health check to be performed against a container to determine whether it is alive or ready
        # to receive traffic.
        livenessProbe:
          # ExecAction describes a "run in container" action.
          exec:
            # Command is the command line to execute inside the container, the working directory for the command  is
            # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so
            # traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to
            # that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
            command:

          # Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3.
          # Minimum value is 1.
          failureThreshold:

          # HTTPGetAction describes an action based on HTTP Get requests.
          httpGet:
            # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.
            host:

            # Custom headers to set in the request. HTTP allows repeated headers.
            httpHeaders:
              - # The header field name
                name:

                # The header field value
                value:

            # Path to access on the HTTP server.
            path:

            port:

            # Scheme to use for connecting to the host. Defaults to HTTP.
            scheme:

          # Number of seconds after the container has started before liveness probes are initiated. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          initialDelaySeconds:

          # How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.
          periodSeconds:

          # Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to
          # 1. Must be 1 for liveness and startup. Minimum value is 1.
          successThreshold:

          # TCPSocketAction describes an action based on opening a socket
          tcpSocket:
            # Optional: Host name to connect to, defaults to the pod IP.
            host:

            port:

          # Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          timeoutSeconds:

        # Name of the ephemeral container specified as a DNS_LABEL. This name must be unique among all containers,
        # init containers and ephemeral containers.
        name:

        # Ports are not allowed for ephemeral containers.
        ports:
          - # Number of port to expose on the pod's IP address. This must be a valid port number, 0 < x < 65536.
            containerPort:

            # What host IP to bind the external port to.
            hostIP:

            # Number of port to expose on the host. If specified, this must be a valid port number, 0 < x < 65536. If
            # HostNetwork is specified, this must match ContainerPort. Most containers do not need this.
            hostPort:

            # If specified, this must be an IANA_SVC_NAME and unique within the pod. Each named port in a pod must
            # have a unique name. Name for the port that can be referred to by services.
            name:

            # Protocol for port. Must be UDP, TCP, or SCTP. Defaults to "TCP".
            protocol:

        # Probe describes a health check to be performed against a container to determine whether it is alive or ready
        # to receive traffic.
        readinessProbe:
          # ExecAction describes a "run in container" action.
          exec:
            # Command is the command line to execute inside the container, the working directory for the command  is
            # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so
            # traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to
            # that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
            command:

          # Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3.
          # Minimum value is 1.
          failureThreshold:

          # HTTPGetAction describes an action based on HTTP Get requests.
          httpGet:
            # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.
            host:

            # Custom headers to set in the request. HTTP allows repeated headers.
            httpHeaders:
              - # The header field name
                name:

                # The header field value
                value:

            # Path to access on the HTTP server.
            path:

            port:

            # Scheme to use for connecting to the host. Defaults to HTTP.
            scheme:

          # Number of seconds after the container has started before liveness probes are initiated. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          initialDelaySeconds:

          # How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.
          periodSeconds:

          # Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to
          # 1. Must be 1 for liveness and startup. Minimum value is 1.
          successThreshold:

          # TCPSocketAction describes an action based on opening a socket
          tcpSocket:
            # Optional: Host name to connect to, defaults to the pod IP.
            host:

            port:

          # Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          timeoutSeconds:

        # ResourceRequirements describes the compute resource requirements.
        resources:
          # Limits describes the maximum amount of compute resources allowed. More info:
          # https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/
          limits:

          # Requests describes the minimum amount of compute resources required. If Requests is omitted for a
          # container, it defaults to Limits if that is explicitly specified, otherwise to an implementation-defined
          # value. More info: https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/
          requests:

        # SecurityContext holds security configuration that will be applied to a container. Some fields are present in
        # both SecurityContext and PodSecurityContext.  When both are set, the values in SecurityContext take
        # precedence.
        securityContext:
          # AllowPrivilegeEscalation controls whether a process can gain more privileges than its parent process. This
          # bool directly controls if the no_new_privs flag will be set on the container process.
          # AllowPrivilegeEscalation is true always when the container is: 1) run as Privileged 2) has CAP_SYS_ADMIN
          allowPrivilegeEscalation:

          # Adds and removes POSIX capabilities from running containers.
          capabilities:
            # Added capabilities
            add:

            # Removed capabilities
            drop:

          # Run container in privileged mode. Processes in privileged containers are essentially equivalent to root on
          # the host. Defaults to false.
          privileged:

          # procMount denotes the type of proc mount to use for the containers. The default is DefaultProcMount which
          # uses the container runtime defaults for readonly paths and masked paths. This requires the ProcMountType
          # feature flag to be enabled.
          procMount:

          # Whether this container has a read-only root filesystem. Default is false.
          readOnlyRootFilesystem:

          # The GID to run the entrypoint of the container process. Uses runtime default if unset. May also be set in
          # PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in
          # SecurityContext takes precedence.
          runAsGroup:

          # Indicates that the container must run as a non-root user. If true, the Kubelet will validate the image at
          # runtime to ensure that it does not run as UID 0 (root) and fail to start the container if it does. If
          # unset or false, no such validation will be performed. May also be set in PodSecurityContext.  If set in
          # both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.
          runAsNonRoot:

          # The UID to run the entrypoint of the container process. Defaults to user specified in image metadata if
          # unspecified. May also be set in PodSecurityContext.  If set in both SecurityContext and
          # PodSecurityContext, the value specified in SecurityContext takes precedence.
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

          # WindowsSecurityContextOptions contain Windows-specific options and credentials.
          windowsOptions:
            # GMSACredentialSpec is where the GMSA admission webhook (https://github.com/kubernetes-sigs/windows-gmsa)
            # inlines the contents of the GMSA credential spec named by the GMSACredentialSpecName field.
            gmsaCredentialSpec:

            # GMSACredentialSpecName is the name of the GMSA credential spec to use.
            gmsaCredentialSpecName:

            # The UserName in Windows to run the entrypoint of the container process. Defaults to the user specified
            # in image metadata if unspecified. May also be set in PodSecurityContext. If set in both SecurityContext
            # and PodSecurityContext, the value specified in SecurityContext takes precedence.
            runAsUserName:

        # Probe describes a health check to be performed against a container to determine whether it is alive or ready
        # to receive traffic.
        startupProbe:
          # ExecAction describes a "run in container" action.
          exec:
            # Command is the command line to execute inside the container, the working directory for the command  is
            # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so
            # traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to
            # that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
            command:

          # Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3.
          # Minimum value is 1.
          failureThreshold:

          # HTTPGetAction describes an action based on HTTP Get requests.
          httpGet:
            # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.
            host:

            # Custom headers to set in the request. HTTP allows repeated headers.
            httpHeaders:
              - # The header field name
                name:

                # The header field value
                value:

            # Path to access on the HTTP server.
            path:

            port:

            # Scheme to use for connecting to the host. Defaults to HTTP.
            scheme:

          # Number of seconds after the container has started before liveness probes are initiated. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          initialDelaySeconds:

          # How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.
          periodSeconds:

          # Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to
          # 1. Must be 1 for liveness and startup. Minimum value is 1.
          successThreshold:

          # TCPSocketAction describes an action based on opening a socket
          tcpSocket:
            # Optional: Host name to connect to, defaults to the pod IP.
            host:

            port:

          # Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          timeoutSeconds:

        # Whether this container should allocate a buffer for stdin in the container runtime. If this is not set,
        # reads from stdin in the container will always result in EOF. Default is false.
        stdin:

        # Whether the container runtime should close the stdin channel after it has been opened by a single attach.
        # When stdin is true the stdin stream will remain open across multiple attach sessions. If stdinOnce is set to
        # true, stdin is opened on container start, is empty until the first client attaches to stdin, and then
        # remains open and accepts data until the client disconnects, at which time stdin is closed and remains closed
        # until the container is restarted. If this flag is false, a container processes that reads from stdin will
        # never receive an EOF. Default is false
        stdinOnce:

        # If set, the name of the container from PodSpec that this ephemeral container targets. The ephemeral
        # container will be run in the namespaces (IPC, PID, etc) of this container. If not set then the ephemeral
        # container is run in whatever namespaces are shared for the pod. Note that the container runtime must support
        # this feature.
        targetContainerName:

        # Optional: Path at which the file to which the container's termination message will be written is mounted
        # into the container's filesystem. Message written is intended to be brief final status, such as an assertion
        # failure message. Will be truncated by the node if greater than 4096 bytes. The total message length across
        # all containers will be limited to 12kb. Defaults to /dev/termination-log. Cannot be updated.
        terminationMessagePath:

        # Indicate how the termination message should be populated. File will use the contents of
        # terminationMessagePath to populate the container status message on both success and failure.
        # FallbackToLogsOnError will use the last chunk of container log output if the termination message file is
        # empty and the container exited with an error. The log output is limited to 2048 bytes or 80 lines, whichever
        # is smaller. Defaults to File. Cannot be updated.
        terminationMessagePolicy:

        # Whether this container should allocate a TTY for itself, also requires 'stdin' to be true. Default is false.
        tty:

        # volumeDevices is the list of block devices to be used by the container.
        volumeDevices:
          - # devicePath is the path inside of the container that the device will be mapped to.
            devicePath:

            # name must match the name of a persistentVolumeClaim in the pod
            name:

        # Pod volumes to mount into the container's filesystem. Cannot be updated.
        volumeMounts:
          - # Path within the container at which the volume should be mounted.  Must not contain ':'.
            mountPath:

            # mountPropagation determines how mounts are propagated from the host to container and the other way
            # around. When not set, MountPropagationNone is used. This field is beta in 1.10.
            mountPropagation:

            # This must match the Name of a Volume.
            name:

            # Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false.
            readOnly:

            # Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's
            # root).
            subPath:

            # Expanded path within the volume from which the container's volume should be mounted. Behaves similarly
            # to SubPath but environment variable references $(VAR_NAME) are expanded using the container's
            # environment. Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive.
            subPathExpr:

        # Container's working directory. If not specified, the container runtime's default will be used, which might
        # be configured in the container image. Cannot be updated.
        workingDir:

    # HostAliases is an optional list of hosts and IPs that will be injected into the pod's hosts file if specified.
    # This is only valid for non-hostNetwork pods.
    hostAliases:
      - # Hostnames for the above IP address.
        hostnames:

        # IP address of the host file entry.
        ip:

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
      - # Name of the referent. More info:
        # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
        name:

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
      - # Arguments to the entrypoint. The docker image's CMD is used if this is not provided. Variable references
        # $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference
        # in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie:
        # $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not.
        # Cannot be updated. More info:
        # https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell
        args:

        # Entrypoint array. Not executed within a shell. The docker image's ENTRYPOINT is used if this is not
        # provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable
        # cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be
        # escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether
        # the variable exists or not. Cannot be updated. More info:
        # https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell
        command:

        # List of environment variables to set in the container. Cannot be updated.
        env:
          - # Name of the environment variable. Must be a C_IDENTIFIER.
            name:

            # Variable references $(VAR_NAME) are expanded using the previous defined environment variables in the
            # container and any service environment variables. If a variable cannot be resolved, the reference in the
            # input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie:
            # $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or
            # not. Defaults to "".
            value:

            # EnvVarSource represents a source for the value of an EnvVar.
            valueFrom:
              # Selects a key from a ConfigMap.
              configMapKeyRef:
                # The key to select.
                key:

                # Name of the referent. More info:
                # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                name:

                # Specify whether the ConfigMap or its key must be defined
                optional:

              # ObjectFieldSelector selects an APIVersioned field of an object.
              fieldRef:
                # Version of the schema the FieldPath is written in terms of, defaults to "v1".
                apiVersion:

                # Path of the field to select in the specified API version.
                fieldPath:

              # ResourceFieldSelector represents container resources (cpu, memory) and their output format
              resourceFieldRef:
                # Container name: required for volumes, optional for env vars
                containerName:

                divisor:

                # Required: resource to select
                resource:

              # SecretKeySelector selects a key of a Secret.
              secretKeyRef:
                # The key of the secret to select from.  Must be a valid secret key.
                key:

                # Name of the referent. More info:
                # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                name:

                # Specify whether the Secret or its key must be defined
                optional:

        # List of sources to populate environment variables in the container. The keys defined within a source must be
        # a C_IDENTIFIER. All invalid keys will be reported as an event when the container is starting. When a key
        # exists in multiple sources, the value associated with the last source will take precedence. Values defined
        # by an Env with a duplicate key will take precedence. Cannot be updated.
        envFrom:
          - # ConfigMapEnvSource selects a ConfigMap to populate the environment variables with.
            #
            # The contents of the target ConfigMap's Data field will represent the key-value pairs as environment
            # variables.
            configMapRef:
              # Name of the referent. More info:
              # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
              name:

              # Specify whether the ConfigMap must be defined
              optional:

            # An optional identifier to prepend to each key in the ConfigMap. Must be a C_IDENTIFIER.
            prefix:

            # SecretEnvSource selects a Secret to populate the environment variables with.
            #
            # The contents of the target Secret's Data field will represent the key-value pairs as environment
            # variables.
            secretRef:
              # Name of the referent. More info:
              # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
              name:

              # Specify whether the Secret must be defined
              optional:

        # Docker image name. More info: https://kubernetes.io/docs/concepts/containers/images This field is optional
        # to allow higher level config management to default or override container images in workload controllers like
        # Deployments and StatefulSets.
        image:

        # Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is specified, or
        # IfNotPresent otherwise. Cannot be updated. More info:
        # https://kubernetes.io/docs/concepts/containers/images#updating-images
        imagePullPolicy:

        # Lifecycle describes actions that the management system should take in response to container lifecycle
        # events. For the PostStart and PreStop lifecycle handlers, management of the container blocks until the
        # action is complete, unless the container process fails, in which case the handler is aborted.
        lifecycle:
          # Handler defines a specific action that should be taken
          postStart:
            # ExecAction describes a "run in container" action.
            exec:
              # Command is the command line to execute inside the container, the working directory for the command  is
              # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell,
              # so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call
              # out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
              command:

            # HTTPGetAction describes an action based on HTTP Get requests.
            httpGet:
              # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders
              # instead.
              host:

              # Custom headers to set in the request. HTTP allows repeated headers.
              httpHeaders:
                - # The header field name
                  name:

                  # The header field value
                  value:

              # Path to access on the HTTP server.
              path:

              port:

              # Scheme to use for connecting to the host. Defaults to HTTP.
              scheme:

            # TCPSocketAction describes an action based on opening a socket
            tcpSocket:
              # Optional: Host name to connect to, defaults to the pod IP.
              host:

              port:

          # Handler defines a specific action that should be taken
          preStop:
            # ExecAction describes a "run in container" action.
            exec:
              # Command is the command line to execute inside the container, the working directory for the command  is
              # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell,
              # so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call
              # out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
              command:

            # HTTPGetAction describes an action based on HTTP Get requests.
            httpGet:
              # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders
              # instead.
              host:

              # Custom headers to set in the request. HTTP allows repeated headers.
              httpHeaders:
                - # The header field name
                  name:

                  # The header field value
                  value:

              # Path to access on the HTTP server.
              path:

              port:

              # Scheme to use for connecting to the host. Defaults to HTTP.
              scheme:

            # TCPSocketAction describes an action based on opening a socket
            tcpSocket:
              # Optional: Host name to connect to, defaults to the pod IP.
              host:

              port:

        # Probe describes a health check to be performed against a container to determine whether it is alive or ready
        # to receive traffic.
        livenessProbe:
          # ExecAction describes a "run in container" action.
          exec:
            # Command is the command line to execute inside the container, the working directory for the command  is
            # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so
            # traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to
            # that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
            command:

          # Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3.
          # Minimum value is 1.
          failureThreshold:

          # HTTPGetAction describes an action based on HTTP Get requests.
          httpGet:
            # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.
            host:

            # Custom headers to set in the request. HTTP allows repeated headers.
            httpHeaders:
              - # The header field name
                name:

                # The header field value
                value:

            # Path to access on the HTTP server.
            path:

            port:

            # Scheme to use for connecting to the host. Defaults to HTTP.
            scheme:

          # Number of seconds after the container has started before liveness probes are initiated. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          initialDelaySeconds:

          # How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.
          periodSeconds:

          # Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to
          # 1. Must be 1 for liveness and startup. Minimum value is 1.
          successThreshold:

          # TCPSocketAction describes an action based on opening a socket
          tcpSocket:
            # Optional: Host name to connect to, defaults to the pod IP.
            host:

            port:

          # Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          timeoutSeconds:

        # Name of the container specified as a DNS_LABEL. Each container in a pod must have a unique name (DNS_LABEL).
        # Cannot be updated.
        name:

        # List of ports to expose from the container. Exposing a port here gives the system additional information
        # about the network connections a container uses, but is primarily informational. Not specifying a port here
        # DOES NOT prevent that port from being exposed. Any port which is listening on the default "0.0.0.0" address
        # inside a container will be accessible from the network. Cannot be updated.
        ports:
          - # Number of port to expose on the pod's IP address. This must be a valid port number, 0 < x < 65536.
            containerPort:

            # What host IP to bind the external port to.
            hostIP:

            # Number of port to expose on the host. If specified, this must be a valid port number, 0 < x < 65536. If
            # HostNetwork is specified, this must match ContainerPort. Most containers do not need this.
            hostPort:

            # If specified, this must be an IANA_SVC_NAME and unique within the pod. Each named port in a pod must
            # have a unique name. Name for the port that can be referred to by services.
            name:

            # Protocol for port. Must be UDP, TCP, or SCTP. Defaults to "TCP".
            protocol:

        # Probe describes a health check to be performed against a container to determine whether it is alive or ready
        # to receive traffic.
        readinessProbe:
          # ExecAction describes a "run in container" action.
          exec:
            # Command is the command line to execute inside the container, the working directory for the command  is
            # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so
            # traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to
            # that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
            command:

          # Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3.
          # Minimum value is 1.
          failureThreshold:

          # HTTPGetAction describes an action based on HTTP Get requests.
          httpGet:
            # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.
            host:

            # Custom headers to set in the request. HTTP allows repeated headers.
            httpHeaders:
              - # The header field name
                name:

                # The header field value
                value:

            # Path to access on the HTTP server.
            path:

            port:

            # Scheme to use for connecting to the host. Defaults to HTTP.
            scheme:

          # Number of seconds after the container has started before liveness probes are initiated. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          initialDelaySeconds:

          # How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.
          periodSeconds:

          # Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to
          # 1. Must be 1 for liveness and startup. Minimum value is 1.
          successThreshold:

          # TCPSocketAction describes an action based on opening a socket
          tcpSocket:
            # Optional: Host name to connect to, defaults to the pod IP.
            host:

            port:

          # Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          timeoutSeconds:

        # ResourceRequirements describes the compute resource requirements.
        resources:
          # Limits describes the maximum amount of compute resources allowed. More info:
          # https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/
          limits:

          # Requests describes the minimum amount of compute resources required. If Requests is omitted for a
          # container, it defaults to Limits if that is explicitly specified, otherwise to an implementation-defined
          # value. More info: https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/
          requests:

        # SecurityContext holds security configuration that will be applied to a container. Some fields are present in
        # both SecurityContext and PodSecurityContext.  When both are set, the values in SecurityContext take
        # precedence.
        securityContext:
          # AllowPrivilegeEscalation controls whether a process can gain more privileges than its parent process. This
          # bool directly controls if the no_new_privs flag will be set on the container process.
          # AllowPrivilegeEscalation is true always when the container is: 1) run as Privileged 2) has CAP_SYS_ADMIN
          allowPrivilegeEscalation:

          # Adds and removes POSIX capabilities from running containers.
          capabilities:
            # Added capabilities
            add:

            # Removed capabilities
            drop:

          # Run container in privileged mode. Processes in privileged containers are essentially equivalent to root on
          # the host. Defaults to false.
          privileged:

          # procMount denotes the type of proc mount to use for the containers. The default is DefaultProcMount which
          # uses the container runtime defaults for readonly paths and masked paths. This requires the ProcMountType
          # feature flag to be enabled.
          procMount:

          # Whether this container has a read-only root filesystem. Default is false.
          readOnlyRootFilesystem:

          # The GID to run the entrypoint of the container process. Uses runtime default if unset. May also be set in
          # PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in
          # SecurityContext takes precedence.
          runAsGroup:

          # Indicates that the container must run as a non-root user. If true, the Kubelet will validate the image at
          # runtime to ensure that it does not run as UID 0 (root) and fail to start the container if it does. If
          # unset or false, no such validation will be performed. May also be set in PodSecurityContext.  If set in
          # both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.
          runAsNonRoot:

          # The UID to run the entrypoint of the container process. Defaults to user specified in image metadata if
          # unspecified. May also be set in PodSecurityContext.  If set in both SecurityContext and
          # PodSecurityContext, the value specified in SecurityContext takes precedence.
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

          # WindowsSecurityContextOptions contain Windows-specific options and credentials.
          windowsOptions:
            # GMSACredentialSpec is where the GMSA admission webhook (https://github.com/kubernetes-sigs/windows-gmsa)
            # inlines the contents of the GMSA credential spec named by the GMSACredentialSpecName field.
            gmsaCredentialSpec:

            # GMSACredentialSpecName is the name of the GMSA credential spec to use.
            gmsaCredentialSpecName:

            # The UserName in Windows to run the entrypoint of the container process. Defaults to the user specified
            # in image metadata if unspecified. May also be set in PodSecurityContext. If set in both SecurityContext
            # and PodSecurityContext, the value specified in SecurityContext takes precedence.
            runAsUserName:

        # Probe describes a health check to be performed against a container to determine whether it is alive or ready
        # to receive traffic.
        startupProbe:
          # ExecAction describes a "run in container" action.
          exec:
            # Command is the command line to execute inside the container, the working directory for the command  is
            # root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so
            # traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to
            # that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.
            command:

          # Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3.
          # Minimum value is 1.
          failureThreshold:

          # HTTPGetAction describes an action based on HTTP Get requests.
          httpGet:
            # Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.
            host:

            # Custom headers to set in the request. HTTP allows repeated headers.
            httpHeaders:
              - # The header field name
                name:

                # The header field value
                value:

            # Path to access on the HTTP server.
            path:

            port:

            # Scheme to use for connecting to the host. Defaults to HTTP.
            scheme:

          # Number of seconds after the container has started before liveness probes are initiated. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          initialDelaySeconds:

          # How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.
          periodSeconds:

          # Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to
          # 1. Must be 1 for liveness and startup. Minimum value is 1.
          successThreshold:

          # TCPSocketAction describes an action based on opening a socket
          tcpSocket:
            # Optional: Host name to connect to, defaults to the pod IP.
            host:

            port:

          # Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info:
          # https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes
          timeoutSeconds:

        # Whether this container should allocate a buffer for stdin in the container runtime. If this is not set,
        # reads from stdin in the container will always result in EOF. Default is false.
        stdin:

        # Whether the container runtime should close the stdin channel after it has been opened by a single attach.
        # When stdin is true the stdin stream will remain open across multiple attach sessions. If stdinOnce is set to
        # true, stdin is opened on container start, is empty until the first client attaches to stdin, and then
        # remains open and accepts data until the client disconnects, at which time stdin is closed and remains closed
        # until the container is restarted. If this flag is false, a container processes that reads from stdin will
        # never receive an EOF. Default is false
        stdinOnce:

        # Optional: Path at which the file to which the container's termination message will be written is mounted
        # into the container's filesystem. Message written is intended to be brief final status, such as an assertion
        # failure message. Will be truncated by the node if greater than 4096 bytes. The total message length across
        # all containers will be limited to 12kb. Defaults to /dev/termination-log. Cannot be updated.
        terminationMessagePath:

        # Indicate how the termination message should be populated. File will use the contents of
        # terminationMessagePath to populate the container status message on both success and failure.
        # FallbackToLogsOnError will use the last chunk of container log output if the termination message file is
        # empty and the container exited with an error. The log output is limited to 2048 bytes or 80 lines, whichever
        # is smaller. Defaults to File. Cannot be updated.
        terminationMessagePolicy:

        # Whether this container should allocate a TTY for itself, also requires 'stdin' to be true. Default is false.
        tty:

        # volumeDevices is the list of block devices to be used by the container.
        volumeDevices:
          - # devicePath is the path inside of the container that the device will be mapped to.
            devicePath:

            # name must match the name of a persistentVolumeClaim in the pod
            name:

        # Pod volumes to mount into the container's filesystem. Cannot be updated.
        volumeMounts:
          - # Path within the container at which the volume should be mounted.  Must not contain ':'.
            mountPath:

            # mountPropagation determines how mounts are propagated from the host to container and the other way
            # around. When not set, MountPropagationNone is used. This field is beta in 1.10.
            mountPropagation:

            # This must match the Name of a Volume.
            name:

            # Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false.
            readOnly:

            # Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's
            # root).
            subPath:

            # Expanded path within the volume from which the container's volume should be mounted. Behaves similarly
            # to SubPath but environment variable references $(VAR_NAME) are expanded using the container's
            # environment. Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive.
            subPathExpr:

        # Container's working directory. If not specified, the container runtime's default will be used, which might
        # be configured in the container image. Cannot be updated.
        workingDir:

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
      - # ConditionType refers to a condition in the pod's condition list with matching type.
        conditionType:

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
        - # Name of a property to set
          name:

          # Value of a property to set
          value:

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
      - # Effect indicates the taint effect to match. Empty means match all taint effects. When specified, allowed
        # values are NoSchedule, PreferNoSchedule and NoExecute.
        effect:

        # Key is the taint key that the toleration applies to. Empty means match all taint keys. If the key is empty,
        # operator must be Exists; this combination means to match all values and all keys.
        key:

        # Operator represents a key's relationship to the value. Valid operators are Exists and Equal. Defaults to
        # Equal. Exists is equivalent to wildcard for value, so that a pod can tolerate all taints of a particular
        # category.
        operator:

        # TolerationSeconds represents the period of time the toleration (which must be of effect NoExecute, otherwise
        # this field is ignored) tolerates the taint. By default, it is not set, which means tolerate the taint
        # forever (do not evict). Zero and negative values will be treated as 0 (evict immediately) by the system.
        tolerationSeconds:

        # Value is the taint value the toleration matches to. If the operator is Exists, the value should be empty,
        # otherwise just a regular string.
        value:

    # TopologySpreadConstraints describes how a group of pods ought to spread across topology domains. Scheduler will
    # schedule pods in a way which abides by the constraints. This field is only honored by clusters that enable the
    # EvenPodsSpread feature. All topologySpreadConstraints are ANDed.
    topologySpreadConstraints:
      - # A label selector is a label query over a set of resources. The result of matchLabels and matchExpressions
        # are ANDed. An empty label selector matches all objects. A null label selector matches no objects.
        labelSelector:
          # matchExpressions is a list of label selector requirements. The requirements are ANDed.
          matchExpressions:
            - # key is the label key that the selector applies to.
              key:

              # operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists and
              # DoesNotExist.
              operator:

              # values is an array of string values. If the operator is In or NotIn, the values array must be
              # non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array is
              # replaced during a strategic merge patch.
              values:

          # matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an
          # element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains
          # only "value". The requirements are ANDed.
          matchLabels:

        # MaxSkew describes the degree to which pods may be unevenly distributed. It's the maximum permitted
        # difference between the number of matching pods in any two topology domains of a given topology type. For
        # example, in a 3-zone cluster, MaxSkew is set to 1, and pods with the same labelSelector spread as 1/1/0: |
        # zone1 | zone2 | zone3 | |   P   |   P   |       | - if MaxSkew is 1, incoming pod can only be scheduled to
        # zone3 to become 1/1/1; scheduling it onto zone1(zone2) would make the ActualSkew(2-0) on zone1(zone2)
        # violate MaxSkew(1). - if MaxSkew is 2, incoming pod can be scheduled onto any zone. It's a required field.
        # Default value is 1 and 0 is not allowed.
        maxSkew:

        # TopologyKey is the key of node labels. Nodes that have a label with this key and identical values are
        # considered to be in the same topology. We consider each <key, value> as a "bucket", and try to put balanced
        # number of pods into each bucket. It's a required field.
        topologyKey:

        # WhenUnsatisfiable indicates how to deal with a pod if it doesn't satisfy the spread constraint. -
        # DoNotSchedule (default) tells the scheduler not to schedule it - ScheduleAnyway tells the scheduler to still
        # schedule it It's considered as "Unsatisfiable" if and only if placing incoming pod on any topology violates
        # "MaxSkew". For example, in a 3-zone cluster, MaxSkew is set to 1, and pods with the same labelSelector
        # spread as 3/1/1: | zone1 | zone2 | zone3 | | P P P |   P   |   P   | If WhenUnsatisfiable is set to
        # DoNotSchedule, incoming pod can only be scheduled to zone2(zone3) to become 3/2/1(3/1/2) as ActualSkew(2-1)
        # on zone2(zone3) satisfies MaxSkew(1). In other words, the cluster can still be imbalanced, but scheduler
        # won't make it *more* imbalanced. It's a required field.
        whenUnsatisfiable:

    # List of volumes that can be mounted by containers belonging to the pod. More info:
    # https://kubernetes.io/docs/concepts/storage/volumes
    volumes:
      - # Represents a Persistent Disk resource in AWS.
        #
        # An AWS EBS disk must exist before mounting to a container. The disk must also be in the same AWS zone as the
        # kubelet. An AWS EBS disk can only be mounted as read/write once. AWS EBS volumes support ownership
        # management and SELinux relabeling.
        awsElasticBlockStore:
          # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by
          # the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
          # unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore
          fsType:

          # The partition in the volume that you want to mount. If omitted, the default is to mount by volume name.
          # Examples: For volume /dev/sda1, you specify the partition as "1". Similarly, the volume partition for
          # /dev/sda is "0" (or you can leave the property empty).
          partition:

          # Specify "true" to force and set the ReadOnly property in VolumeMounts to "true". If omitted, the default
          # is "false". More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore
          readOnly:

          # Unique ID of the persistent disk resource in AWS (Amazon EBS volume). More info:
          # https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore
          volumeID:

        # AzureDisk represents an Azure Data Disk mount on the host and bind mount to the pod.
        azureDisk:
          # Host Caching mode: None, Read Only, Read Write.
          cachingMode:

          # The Name of the data disk in the blob storage
          diskName:

          # The URI the data disk in the blob storage
          diskURI:

          # Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4",
          # "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.
          fsType:

          # Expected values Shared: multiple blob disks per storage account  Dedicated: single blob disk per storage
          # account  Managed: azure managed data disk (only in managed availability set). defaults to shared
          kind:

          # Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.
          readOnly:

        # AzureFile represents an Azure File Service mount on the host and bind mount to the pod.
        azureFile:
          # Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.
          readOnly:

          # the name of secret that contains Azure Storage Account Name and Key
          secretName:

          # Share Name
          shareName:

        # Represents a Ceph Filesystem mount that lasts the lifetime of a pod Cephfs volumes do not support ownership
        # management or SELinux relabeling.
        cephfs:
          # Required: Monitors is a collection of Ceph monitors More info:
          # https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it
          monitors:

          # Optional: Used as the mounted root, rather than the full Ceph tree, default is /
          path:

          # Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.
          # More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it
          readOnly:

          # Optional: SecretFile is the path to key ring for User, default is /etc/ceph/user.secret More info:
          # https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it
          secretFile:

          # LocalObjectReference contains enough information to let you locate the referenced object inside the same
          # namespace.
          secretRef:
            # Name of the referent. More info:
            # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
            name:

          # Optional: User is the rados user name, default is admin More info:
          # https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it
          user:

        # Represents a cinder volume resource in Openstack. A Cinder volume must exist before mounting to a container.
        # The volume must also be in the same region as the kubelet. Cinder volumes support ownership management and
        # SELinux relabeling.
        cinder:
          # Filesystem type to mount. Must be a filesystem type supported by the host operating system. Examples:
          # "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info:
          # https://examples.k8s.io/mysql-cinder-pd/README.md
          fsType:

          # Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.
          # More info: https://examples.k8s.io/mysql-cinder-pd/README.md
          readOnly:

          # LocalObjectReference contains enough information to let you locate the referenced object inside the same
          # namespace.
          secretRef:
            # Name of the referent. More info:
            # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
            name:

          # volume id used to identify the volume in cinder. More info:
          # https://examples.k8s.io/mysql-cinder-pd/README.md
          volumeID:

        # Adapts a ConfigMap into a volume.
        #
        # The contents of the target ConfigMap's Data field will be presented in a volume as files using the keys in
        # the Data field as the file names, unless the items element is populated with specific mappings of keys to
        # paths. ConfigMap volumes support ownership management and SELinux relabeling.
        configMap:
          # Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to
          # 0644. Directories within the path are not affected by this setting. This might be in conflict with other
          # options that affect the file mode, like fsGroup, and the result can be other mode bits set.
          defaultMode:

          # If unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected into
          # the volume as a file whose name is the key and content is the value. If specified, the listed keys will be
          # projected into the specified paths, and unlisted keys will not be present. If a key is specified which is
          # not present in the ConfigMap, the volume setup will error unless it is marked optional. Paths must be
          # relative and may not contain the '..' path or start with '..'.
          items:
            - # The key to project.
              key:

              # Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified, the
              # volume defaultMode will be used. This might be in conflict with other options that affect the file
              # mode, like fsGroup, and the result can be other mode bits set.
              mode:

              # The relative path of the file to map the key to. May not be an absolute path. May not contain the path
              # element '..'. May not start with the string '..'.
              path:

          # Name of the referent. More info:
          # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
          name:

          # Specify whether the ConfigMap or its keys must be defined
          optional:

        # Represents a source location of a volume to mount, managed by an external CSI driver
        csi:
          # Driver is the name of the CSI driver that handles this volume. Consult with your admin for the correct
          # name as registered in the cluster.
          driver:

          # Filesystem type to mount. Ex. "ext4", "xfs", "ntfs". If not provided, the empty value is passed to the
          # associated CSI driver which will determine the default filesystem to apply.
          fsType:

          # LocalObjectReference contains enough information to let you locate the referenced object inside the same
          # namespace.
          nodePublishSecretRef:
            # Name of the referent. More info:
            # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
            name:

          # Specifies a read-only configuration for the volume. Defaults to false (read/write).
          readOnly:

          # VolumeAttributes stores driver-specific properties that are passed to the CSI driver. Consult your
          # driver's documentation for supported values.
          volumeAttributes:

        # DownwardAPIVolumeSource represents a volume containing downward API info. Downward API volumes support
        # ownership management and SELinux relabeling.
        downwardAPI:
          # Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to
          # 0644. Directories within the path are not affected by this setting. This might be in conflict with other
          # options that affect the file mode, like fsGroup, and the result can be other mode bits set.
          defaultMode:

          # Items is a list of downward API volume file
          items:
            - # ObjectFieldSelector selects an APIVersioned field of an object.
              fieldRef:
                # Version of the schema the FieldPath is written in terms of, defaults to "v1".
                apiVersion:

                # Path of the field to select in the specified API version.
                fieldPath:

              # Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified, the
              # volume defaultMode will be used. This might be in conflict with other options that affect the file
              # mode, like fsGroup, and the result can be other mode bits set.
              mode:

              # Required: Path is  the relative path name of the file to be created. Must not be absolute or contain
              # the '..' path. Must be utf-8 encoded. The first item of the relative path must not start with '..'
              path:

              # ResourceFieldSelector represents container resources (cpu, memory) and their output format
              resourceFieldRef:
                # Container name: required for volumes, optional for env vars
                containerName:

                divisor:

                # Required: resource to select
                resource:

        # Represents an empty directory for a pod. Empty directory volumes support ownership management and SELinux
        # relabeling.
        emptyDir:
          # What type of storage medium should back this directory. The default is "" which means to use the node's
          # default medium. Must be an empty string (default) or Memory. More info:
          # https://kubernetes.io/docs/concepts/storage/volumes#emptydir
          medium:

          sizeLimit:

        # Represents a Fibre Channel volume. Fibre Channel volumes can only be mounted as read/write once. Fibre
        # Channel volumes support ownership management and SELinux relabeling.
        fc:
          # Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4",
          # "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.
          fsType:

          # Optional: FC target lun number
          lun:

          # Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.
          readOnly:

          # Optional: FC target worldwide names (WWNs)
          targetWWNs:

          # Optional: FC volume world wide identifiers (wwids) Either wwids or combination of targetWWNs and lun must
          # be set, but not both simultaneously.
          wwids:

        # FlexVolume represents a generic volume resource that is provisioned/attached using an exec based plugin.
        flexVolume:
          # Driver is the name of the driver to use for this volume.
          driver:

          # Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4",
          # "xfs", "ntfs". The default filesystem depends on FlexVolume script.
          fsType:

          # Optional: Extra command options if any.
          options:

          # Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.
          readOnly:

          # LocalObjectReference contains enough information to let you locate the referenced object inside the same
          # namespace.
          secretRef:
            # Name of the referent. More info:
            # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
            name:

        # Represents a Flocker volume mounted by the Flocker agent. One and only one of datasetName and datasetUUID
        # should be set. Flocker volumes do not support ownership management or SELinux relabeling.
        flocker:
          # Name of the dataset stored as metadata -> name on the dataset for Flocker should be considered as
          # deprecated
          datasetName:

          # UUID of the dataset. This is unique identifier of a Flocker dataset
          datasetUUID:

        # Represents a Persistent Disk resource in Google Compute Engine.
        #
        # A GCE PD must exist before mounting to a container. The disk must also be in the same GCE project and zone
        # as the kubelet. A GCE PD can only be mounted as read/write once or read-only many times. GCE PDs support
        # ownership management and SELinux relabeling.
        gcePersistentDisk:
          # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by
          # the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
          # unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk
          fsType:

          # The partition in the volume that you want to mount. If omitted, the default is to mount by volume name.
          # Examples: For volume /dev/sda1, you specify the partition as "1". Similarly, the volume partition for
          # /dev/sda is "0" (or you can leave the property empty). More info:
          # https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk
          partition:

          # Unique name of the PD resource in GCE. Used to identify the disk in GCE. More info:
          # https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk
          pdName:

          # ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. More info:
          # https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk
          readOnly:

        # Represents a volume that is populated with the contents of a git repository. Git repo volumes do not support
        # ownership management. Git repo volumes support SELinux relabeling.
        #
        # DEPRECATED: GitRepo is deprecated. To provision a container with a git repo, mount an EmptyDir into an
        # InitContainer that clones the repo using git, then mount the EmptyDir into the Pod's container.
        gitRepo:
          # Target directory name. Must not contain or start with '..'.  If '.' is supplied, the volume directory will
          # be the git repository.  Otherwise, if specified, the volume will contain the git repository in the
          # subdirectory with the given name.
          directory:

          # Repository URL
          repository:

          # Commit hash for the specified revision.
          revision:

        # Represents a Glusterfs mount that lasts the lifetime of a pod. Glusterfs volumes do not support ownership
        # management or SELinux relabeling.
        glusterfs:
          # EndpointsName is the endpoint name that details Glusterfs topology. More info:
          # https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod
          endpoints:

          # Path is the Glusterfs volume path. More info:
          # https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod
          path:

          # ReadOnly here will force the Glusterfs volume to be mounted with read-only permissions. Defaults to false.
          # More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod
          readOnly:

        # Represents a host path mapped into a pod. Host path volumes do not support ownership management or SELinux
        # relabeling.
        hostPath:
          # Path of the directory on the host. If the path is a symlink, it will follow the link to the real path.
          # More info: https://kubernetes.io/docs/concepts/storage/volumes#hostpath
          path:

          # Type for HostPath Volume Defaults to "" More info:
          # https://kubernetes.io/docs/concepts/storage/volumes#hostpath
          type:

        # Represents an ISCSI disk. ISCSI volumes can only be mounted as read/write once. ISCSI volumes support
        # ownership management and SELinux relabeling.
        iscsi:
          # whether support iSCSI Discovery CHAP authentication
          chapAuthDiscovery:

          # whether support iSCSI Session CHAP authentication
          chapAuthSession:

          # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by
          # the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
          # unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#iscsi
          fsType:

          # Custom iSCSI Initiator Name. If initiatorName is specified with iscsiInterface simultaneously, new iSCSI
          # interface <target portal>:<volume name> will be created for the connection.
          initiatorName:

          # Target iSCSI Qualified Name.
          iqn:

          # iSCSI Interface Name that uses an iSCSI transport. Defaults to 'default' (tcp).
          iscsiInterface:

          # iSCSI Target Lun number.
          lun:

          # iSCSI Target Portal List. The portal is either an IP or ip_addr:port if the port is other than default
          # (typically TCP ports 860 and 3260).
          portals:

          # ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false.
          readOnly:

          # LocalObjectReference contains enough information to let you locate the referenced object inside the same
          # namespace.
          secretRef:
            # Name of the referent. More info:
            # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
            name:

          # iSCSI Target Portal. The Portal is either an IP or ip_addr:port if the port is other than default
          # (typically TCP ports 860 and 3260).
          targetPortal:

        # Volume's name. Must be a DNS_LABEL and unique within the pod. More info:
        # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
        name:

        # Represents an NFS mount that lasts the lifetime of a pod. NFS volumes do not support ownership management or
        # SELinux relabeling.
        nfs:
          # Path that is exported by the NFS server. More info:
          # https://kubernetes.io/docs/concepts/storage/volumes#nfs
          path:

          # ReadOnly here will force the NFS export to be mounted with read-only permissions. Defaults to false. More
          # info: https://kubernetes.io/docs/concepts/storage/volumes#nfs
          readOnly:

          # Server is the hostname or IP address of the NFS server. More info:
          # https://kubernetes.io/docs/concepts/storage/volumes#nfs
          server:

        # PersistentVolumeClaimVolumeSource references the user's PVC in the same namespace. This volume finds the
        # bound PV and mounts that volume for the pod. A PersistentVolumeClaimVolumeSource is, essentially, a wrapper
        # around another type of volume that is owned by someone else (the system).
        persistentVolumeClaim:
          # ClaimName is the name of a PersistentVolumeClaim in the same namespace as the pod using this volume. More
          # info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#persistentvolumeclaims
          claimName:

          # Will force the ReadOnly setting in VolumeMounts. Default false.
          readOnly:

        # Represents a Photon Controller persistent disk resource.
        photonPersistentDisk:
          # Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4",
          # "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.
          fsType:

          # ID that identifies Photon Controller persistent disk
          pdID:

        # PortworxVolumeSource represents a Portworx volume resource.
        portworxVolume:
          # FSType represents the filesystem type to mount Must be a filesystem type supported by the host operating
          # system. Ex. "ext4", "xfs". Implicitly inferred to be "ext4" if unspecified.
          fsType:

          # Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.
          readOnly:

          # VolumeID uniquely identifies a Portworx volume
          volumeID:

        # Represents a projected volume source
        projected:
          # Mode bits to use on created files by default. Must be a value between 0 and 0777. Directories within the
          # path are not affected by this setting. This might be in conflict with other options that affect the file
          # mode, like fsGroup, and the result can be other mode bits set.
          defaultMode:

          # list of volume projections
          sources:
            - # Adapts a ConfigMap into a projected volume.
              #
              # The contents of the target ConfigMap's Data field will be presented in a projected volume as files
              # using the keys in the Data field as the file names, unless the items element is populated with
              # specific mappings of keys to paths. Note that this is identical to a configmap volume source without
              # the default mode.
              configMap:
                # If unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected
                # into the volume as a file whose name is the key and content is the value. If specified, the listed
                # keys will be projected into the specified paths, and unlisted keys will not be present. If a key is
                # specified which is not present in the ConfigMap, the volume setup will error unless it is marked
                # optional. Paths must be relative and may not contain the '..' path or start with '..'.
                items:
                  - # The key to project.
                    key:

                    # Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified,
                    # the volume defaultMode will be used. This might be in conflict with other options that affect
                    # the file mode, like fsGroup, and the result can be other mode bits set.
                    mode:

                    # The relative path of the file to map the key to. May not be an absolute path. May not contain
                    # the path element '..'. May not start with the string '..'.
                    path:

                # Name of the referent. More info:
                # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                name:

                # Specify whether the ConfigMap or its keys must be defined
                optional:

              # Represents downward API info for projecting into a projected volume. Note that this is identical to a
              # downwardAPI volume source without the default mode.
              downwardAPI:
                # Items is a list of DownwardAPIVolume file
                items:
                  - # ObjectFieldSelector selects an APIVersioned field of an object.
                    fieldRef:
                      # Version of the schema the FieldPath is written in terms of, defaults to "v1".
                      apiVersion:

                      # Path of the field to select in the specified API version.
                      fieldPath:

                    # Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified,
                    # the volume defaultMode will be used. This might be in conflict with other options that affect
                    # the file mode, like fsGroup, and the result can be other mode bits set.
                    mode:

                    # Required: Path is  the relative path name of the file to be created. Must not be absolute or
                    # contain the '..' path. Must be utf-8 encoded. The first item of the relative path must not start
                    # with '..'
                    path:

                    # ResourceFieldSelector represents container resources (cpu, memory) and their output format
                    resourceFieldRef:
                      # Container name: required for volumes, optional for env vars
                      containerName:

                      divisor:

                      # Required: resource to select
                      resource:

              # Adapts a secret into a projected volume.
              #
              # The contents of the target Secret's Data field will be presented in a projected volume as files using
              # the keys in the Data field as the file names. Note that this is identical to a secret volume source
              # without the default mode.
              secret:
                # If unspecified, each key-value pair in the Data field of the referenced Secret will be projected
                # into the volume as a file whose name is the key and content is the value. If specified, the listed
                # keys will be projected into the specified paths, and unlisted keys will not be present. If a key is
                # specified which is not present in the Secret, the volume setup will error unless it is marked
                # optional. Paths must be relative and may not contain the '..' path or start with '..'.
                items:
                  - # The key to project.
                    key:

                    # Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified,
                    # the volume defaultMode will be used. This might be in conflict with other options that affect
                    # the file mode, like fsGroup, and the result can be other mode bits set.
                    mode:

                    # The relative path of the file to map the key to. May not be an absolute path. May not contain
                    # the path element '..'. May not start with the string '..'.
                    path:

                # Name of the referent. More info:
                # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
                name:

                # Specify whether the Secret or its key must be defined
                optional:

              # ServiceAccountTokenProjection represents a projected service account token volume. This projection can
              # be used to insert a service account token into the pods runtime filesystem for use against APIs
              # (Kubernetes API Server or otherwise).
              serviceAccountToken:
                # Audience is the intended audience of the token. A recipient of a token must identify itself with an
                # identifier specified in the audience of the token, and otherwise should reject the token. The
                # audience defaults to the identifier of the apiserver.
                audience:

                # ExpirationSeconds is the requested duration of validity of the service account token. As the token
                # approaches expiration, the kubelet volume plugin will proactively rotate the service account token.
                # The kubelet will start trying to rotate the token if the token is older than 80 percent of its time
                # to live or if the token is older than 24 hours.Defaults to 1 hour and must be at least 10 minutes.
                expirationSeconds:

                # Path is the path relative to the mount point of the file to project the token into.
                path:

        # Represents a Quobyte mount that lasts the lifetime of a pod. Quobyte volumes do not support ownership
        # management or SELinux relabeling.
        quobyte:
          # Group to map volume access to Default is no group
          group:

          # ReadOnly here will force the Quobyte volume to be mounted with read-only permissions. Defaults to false.
          readOnly:

          # Registry represents a single or multiple Quobyte Registry services specified as a string as host:port pair
          # (multiple entries are separated with commas) which acts as the central registry for volumes
          registry:

          # Tenant owning the given Quobyte volume in the Backend Used with dynamically provisioned Quobyte volumes,
          # value is set by the plugin
          tenant:

          # User to map volume access to Defaults to serivceaccount user
          user:

          # Volume is a string that references an already created Quobyte volume by name.
          volume:

        # Represents a Rados Block Device mount that lasts the lifetime of a pod. RBD volumes support ownership
        # management and SELinux relabeling.
        rbd:
          # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by
          # the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
          # unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#rbd
          fsType:

          # The rados image name. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it
          image:

          # Keyring is the path to key ring for RBDUser. Default is /etc/ceph/keyring. More info:
          # https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it
          keyring:

          # A collection of Ceph monitors. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it
          monitors:

          # The rados pool name. Default is rbd. More info:
          # https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it
          pool:

          # ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. More info:
          # https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it
          readOnly:

          # LocalObjectReference contains enough information to let you locate the referenced object inside the same
          # namespace.
          secretRef:
            # Name of the referent. More info:
            # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
            name:

          # The rados user name. Default is admin. More info:
          # https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it
          user:

        # ScaleIOVolumeSource represents a persistent ScaleIO volume
        scaleIO:
          # Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4",
          # "xfs", "ntfs". Default is "xfs".
          fsType:

          # The host address of the ScaleIO API Gateway.
          gateway:

          # The name of the ScaleIO Protection Domain for the configured storage.
          protectionDomain:

          # Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.
          readOnly:

          # LocalObjectReference contains enough information to let you locate the referenced object inside the same
          # namespace.
          secretRef:
            # Name of the referent. More info:
            # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
            name:

          # Flag to enable/disable SSL communication with Gateway, default false
          sslEnabled:

          # Indicates whether the storage for a volume should be ThickProvisioned or ThinProvisioned. Default is
          # ThinProvisioned.
          storageMode:

          # The ScaleIO Storage Pool associated with the protection domain.
          storagePool:

          # The name of the storage system as configured in ScaleIO.
          system:

          # The name of a volume already created in the ScaleIO system that is associated with this volume source.
          volumeName:

        # Adapts a Secret into a volume.
        #
        # The contents of the target Secret's Data field will be presented in a volume as files using the keys in the
        # Data field as the file names. Secret volumes support ownership management and SELinux relabeling.
        secret:
          # Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to
          # 0644. Directories within the path are not affected by this setting. This might be in conflict with other
          # options that affect the file mode, like fsGroup, and the result can be other mode bits set.
          defaultMode:

          # If unspecified, each key-value pair in the Data field of the referenced Secret will be projected into the
          # volume as a file whose name is the key and content is the value. If specified, the listed keys will be
          # projected into the specified paths, and unlisted keys will not be present. If a key is specified which is
          # not present in the Secret, the volume setup will error unless it is marked optional. Paths must be
          # relative and may not contain the '..' path or start with '..'.
          items:
            - # The key to project.
              key:

              # Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified, the
              # volume defaultMode will be used. This might be in conflict with other options that affect the file
              # mode, like fsGroup, and the result can be other mode bits set.
              mode:

              # The relative path of the file to map the key to. May not be an absolute path. May not contain the path
              # element '..'. May not start with the string '..'.
              path:

          # Specify whether the Secret or its keys must be defined
          optional:

          # Name of the secret in the pod's namespace to use. More info:
          # https://kubernetes.io/docs/concepts/storage/volumes#secret
          secretName:

        # Represents a StorageOS persistent volume resource.
        storageos:
          # Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4",
          # "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.
          fsType:

          # Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.
          readOnly:

          # LocalObjectReference contains enough information to let you locate the referenced object inside the same
          # namespace.
          secretRef:
            # Name of the referent. More info:
            # https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
            name:

          # VolumeName is the human-readable name of the StorageOS volume.  Volume names are only unique within a
          # namespace.
          volumeName:

          # VolumeNamespace specifies the scope of the volume within StorageOS.  If no namespace is specified then the
          # Pod's namespace will be used.  This allows the Kubernetes name scoping to be mirrored within StorageOS for
          # tighter integration. Set VolumeName to any name to override the default behaviour. Set to "default" if you
          # are not using namespaces within StorageOS. Namespaces that do not pre-exist within StorageOS will be
          # created.
          volumeNamespace:

        # Represents a vSphere volume resource.
        vsphereVolume:
          # Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4",
          # "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.
          fsType:

          # Storage Policy Based Management (SPBM) profile ID associated with the StoragePolicyName.
          storagePolicyID:

          # Storage Policy Based Management (SPBM) profile name.
          storagePolicyName:

          # Path that identifies vSphere volume vmdk
          volumePath:
```

## Configuration Keys

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

A relative POSIX-style path to the source directory for this action. You must make sure this path exists and is in a git repository!

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

### `kind`

| Type     | Allowed Values | Required |
| -------- | -------------- | -------- |
| `string` | "Run"          | Yes      |

### `timeout`

Set a timeout for the run to complete, in seconds.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `600`   | No       |

### `spec`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.cacheResult`

[spec](#spec) > cacheResult

Set to false if you don't want the Runs's result to be cached. Use this if the Run needs to be run any time your project (or one or more of the Run's dependants) is deployed. Otherwise the Run is only re-run when its version changes, or when you run `garden run`.

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

The arguments to pass to the command/entrypoint used for execution.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
spec:
  ...
  args:
    - rake
    - db:migrate
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

### `spec.manifests[]`

[spec](#spec) > manifests

List of Kubernetes resource manifests to be searched (using `resource`e for the pod spec for the Run. If `files` is also specified, this is combined with the manifests read from the files.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `spec.manifests[].apiVersion`

[spec](#spec) > [manifests](#specmanifests) > apiVersion

The API version of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.manifests[].kind`

[spec](#spec) > [manifests](#specmanifests) > kind

The kind of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.manifests[].metadata`

[spec](#spec) > [manifests](#specmanifests) > metadata

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

### `spec.manifests[].metadata.name`

[spec](#spec) > [manifests](#specmanifests) > [metadata](#specmanifestsmetadata) > name

The name of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.files[]`

[spec](#spec) > files

POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests, and can include any Garden template strings, which will be resolved before searching the manifests for the resource that contains the Pod spec for the Run.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

### `spec.resource`

[spec](#spec) > resource

Specify a Kubernetes resource to derive the Pod spec from for the Run.

This resource will be selected from the manifests provided in this Run's `files` or `manifests` config field.

The following fields from the Pod will be used (if present) when executing the Run:
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

Supply a custom Pod specification. This should be a normal Kubernetes Pod manifest. Note that the spec will be modified for the Run, including overriding with other fields you may set here (such as `args` and `env`), and removing certain fields that are not supported.

The following Pod spec fields from the selected `resource` will be used (if present) when executing the Run:
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

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[].preference`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecution) > preference

A null or empty node selector term matches no objects. The requirements of them are ANDed. The TopologySelectorTerm type implements a subset of the NodeSelectorTerm.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[].preference.matchExpressions[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecution) > [preference](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreference) > matchExpressions

A list of node selector requirements by node's labels.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[].preference.matchExpressions[].key`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecution) > [preference](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreference) > [matchExpressions](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreferencematchexpressions) > key

The label key that the selector applies to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[].preference.matchExpressions[].operator`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecution) > [preference](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreference) > [matchExpressions](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreferencematchexpressions) > operator

Represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists, DoesNotExist. Gt, and Lt.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[].preference.matchExpressions[].values[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecution) > [preference](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreference) > [matchExpressions](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreferencematchexpressions) > values

An array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. If the operator is Gt or Lt, the values array must have a single element, which will be interpreted as an integer. This array is replaced during a strategic merge patch.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[].preference.matchFields[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecution) > [preference](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreference) > matchFields

A list of node selector requirements by node's fields.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[].preference.matchFields[].key`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecution) > [preference](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreference) > [matchFields](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreferencematchfields) > key

The label key that the selector applies to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[].preference.matchFields[].operator`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecution) > [preference](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreference) > [matchFields](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreferencematchfields) > operator

Represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists, DoesNotExist. Gt, and Lt.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[].preference.matchFields[].values[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecution) > [preference](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreference) > [matchFields](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionpreferencematchfields) > values

An array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. If the operator is Gt or Lt, the values array must have a single element, which will be interpreted as an integer. This array is replaced during a strategic merge patch.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[].weight`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinitypreferredduringschedulingignoredduringexecution) > weight

Weight associated with matching the corresponding nodeSelectorTerm, in the range 1-100.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

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

### `spec.podSpec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchExpressions[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecution) > [nodeSelectorTerms](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectorterms) > matchExpressions

A list of node selector requirements by node's labels.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchExpressions[].key`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecution) > [nodeSelectorTerms](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectorterms) > [matchExpressions](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsmatchexpressions) > key

The label key that the selector applies to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchExpressions[].operator`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecution) > [nodeSelectorTerms](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectorterms) > [matchExpressions](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsmatchexpressions) > operator

Represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists, DoesNotExist. Gt, and Lt.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchExpressions[].values[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecution) > [nodeSelectorTerms](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectorterms) > [matchExpressions](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsmatchexpressions) > values

An array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. If the operator is Gt or Lt, the values array must have a single element, which will be interpreted as an integer. This array is replaced during a strategic merge patch.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchFields[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecution) > [nodeSelectorTerms](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectorterms) > matchFields

A list of node selector requirements by node's fields.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchFields[].key`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecution) > [nodeSelectorTerms](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectorterms) > [matchFields](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsmatchfields) > key

The label key that the selector applies to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchFields[].operator`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecution) > [nodeSelectorTerms](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectorterms) > [matchFields](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsmatchfields) > operator

Represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists, DoesNotExist. Gt, and Lt.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[].matchFields[].values[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [nodeAffinity](#specpodspecaffinitynodeaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecution) > [nodeSelectorTerms](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectorterms) > [matchFields](#specpodspecaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsmatchfields) > values

An array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. If the operator is Gt or Lt, the values array must have a single element, which will be interpreted as an integer. This array is replaced during a strategic merge patch.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

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

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecution) > podAffinityTerm

Defines a set of pods (namely those matching the labelSelector relative to the given namespace(s)) that this pod should be co-located (affinity) or not co-located (anti-affinity) with, where co-located is defined as running on a node whose value of the label with key <topologyKey> matches that of any node on which a pod of the set of pods is running

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > labelSelector

A label selector is a label query over a set of resources. The result of matchLabels and matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches no objects.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchExpressions[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > [labelSelector](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselector) > matchExpressions

matchExpressions is a list of label selector requirements. The requirements are ANDed.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchExpressions[].key`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > [labelSelector](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselector) > [matchExpressions](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselectormatchexpressions) > key

key is the label key that the selector applies to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchExpressions[].operator`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > [labelSelector](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselector) > [matchExpressions](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselectormatchexpressions) > operator

operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists and DoesNotExist.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchExpressions[].values[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > [labelSelector](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselector) > [matchExpressions](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselectormatchexpressions) > values

values is an array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array is replaced during a strategic merge patch.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchLabels`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > [labelSelector](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselector) > matchLabels

matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains only "value". The requirements are ANDed.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.namespaces[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > namespaces

namespaces specifies which namespaces the labelSelector applies to (matches against); null or empty list means "this pod's namespace"

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.topologyKey`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > topologyKey

This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching the labelSelector in the specified namespaces, where co-located is defined as running on a node whose value of the label with key topologyKey matches that of any node on which any of the selected pods is running. Empty topologyKey is not allowed.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[].weight`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinitypreferredduringschedulingignoredduringexecution) > weight

weight associated with matching the corresponding podAffinityTerm, in the range 1-100.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > requiredDuringSchedulingIgnoredDuringExecution

If the affinity requirements specified by this field are not met at scheduling time, the pod will not be scheduled onto the node. If the affinity requirements specified by this field cease to be met at some point during pod execution (e.g. due to a pod label update), the system may or may not try to eventually evict the pod from its node. When there are multiple elements, the lists of nodes corresponding to each podAffinityTerm are intersected, i.e. all terms must be satisfied.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecution) > labelSelector

A label selector is a label query over a set of resources. The result of matchLabels and matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches no objects.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchExpressions[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecution) > [labelSelector](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecutionlabelselector) > matchExpressions

matchExpressions is a list of label selector requirements. The requirements are ANDed.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchExpressions[].key`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecution) > [labelSelector](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecutionlabelselector) > [matchExpressions](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecutionlabelselectormatchexpressions) > key

key is the label key that the selector applies to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchExpressions[].operator`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecution) > [labelSelector](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecutionlabelselector) > [matchExpressions](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecutionlabelselectormatchexpressions) > operator

operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists and DoesNotExist.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchExpressions[].values[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecution) > [labelSelector](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecutionlabelselector) > [matchExpressions](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecutionlabelselectormatchexpressions) > values

values is an array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array is replaced during a strategic merge patch.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchLabels`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecution) > [labelSelector](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecutionlabelselector) > matchLabels

matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains only "value". The requirements are ANDed.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].namespaces[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecution) > namespaces

namespaces specifies which namespaces the labelSelector applies to (matches against); null or empty list means "this pod's namespace"

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[].topologyKey`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAffinity](#specpodspecaffinitypodaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodaffinityrequiredduringschedulingignoredduringexecution) > topologyKey

This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching the labelSelector in the specified namespaces, where co-located is defined as running on a node whose value of the label with key topologyKey matches that of any node on which any of the selected pods is running. Empty topologyKey is not allowed.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

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

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecution) > podAffinityTerm

Defines a set of pods (namely those matching the labelSelector relative to the given namespace(s)) that this pod should be co-located (affinity) or not co-located (anti-affinity) with, where co-located is defined as running on a node whose value of the label with key <topologyKey> matches that of any node on which a pod of the set of pods is running

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > labelSelector

A label selector is a label query over a set of resources. The result of matchLabels and matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches no objects.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchExpressions[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > [labelSelector](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselector) > matchExpressions

matchExpressions is a list of label selector requirements. The requirements are ANDed.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchExpressions[].key`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > [labelSelector](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselector) > [matchExpressions](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselectormatchexpressions) > key

key is the label key that the selector applies to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchExpressions[].operator`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > [labelSelector](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselector) > [matchExpressions](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselectormatchexpressions) > operator

operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists and DoesNotExist.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchExpressions[].values[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > [labelSelector](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselector) > [matchExpressions](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselectormatchexpressions) > values

values is an array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array is replaced during a strategic merge patch.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.labelSelector.matchLabels`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > [labelSelector](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinitytermlabelselector) > matchLabels

matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains only "value". The requirements are ANDed.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.namespaces[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > namespaces

namespaces specifies which namespaces the labelSelector applies to (matches against); null or empty list means "this pod's namespace"

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].podAffinityTerm.topologyKey`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecution) > [podAffinityTerm](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionpodaffinityterm) > topologyKey

This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching the labelSelector in the specified namespaces, where co-located is defined as running on a node whose value of the label with key topologyKey matches that of any node on which any of the selected pods is running. Empty topologyKey is not allowed.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[].weight`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [preferredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinitypreferredduringschedulingignoredduringexecution) > weight

weight associated with matching the corresponding podAffinityTerm, in the range 1-100.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > requiredDuringSchedulingIgnoredDuringExecution

If the anti-affinity requirements specified by this field are not met at scheduling time, the pod will not be scheduled onto the node. If the anti-affinity requirements specified by this field cease to be met at some point during pod execution (e.g. due to a pod label update), the system may or may not try to eventually evict the pod from its node. When there are multiple elements, the lists of nodes corresponding to each podAffinityTerm are intersected, i.e. all terms must be satisfied.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecution) > labelSelector

A label selector is a label query over a set of resources. The result of matchLabels and matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches no objects.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchExpressions[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecution) > [labelSelector](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionlabelselector) > matchExpressions

matchExpressions is a list of label selector requirements. The requirements are ANDed.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchExpressions[].key`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecution) > [labelSelector](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionlabelselector) > [matchExpressions](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionlabelselectormatchexpressions) > key

key is the label key that the selector applies to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchExpressions[].operator`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecution) > [labelSelector](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionlabelselector) > [matchExpressions](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionlabelselectormatchexpressions) > operator

operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists and DoesNotExist.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchExpressions[].values[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecution) > [labelSelector](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionlabelselector) > [matchExpressions](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionlabelselectormatchexpressions) > values

values is an array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array is replaced during a strategic merge patch.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].labelSelector.matchLabels`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecution) > [labelSelector](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionlabelselector) > matchLabels

matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains only "value". The requirements are ANDed.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].namespaces[]`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecution) > namespaces

namespaces specifies which namespaces the labelSelector applies to (matches against); null or empty list means "this pod's namespace"

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[].topologyKey`

[spec](#spec) > [podSpec](#specpodspec) > [affinity](#specpodspecaffinity) > [podAntiAffinity](#specpodspecaffinitypodantiaffinity) > [requiredDuringSchedulingIgnoredDuringExecution](#specpodspecaffinitypodantiaffinityrequiredduringschedulingignoredduringexecution) > topologyKey

This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching the labelSelector in the specified namespaces, where co-located is defined as running on a node whose value of the label with key topologyKey matches that of any node on which any of the selected pods is running. Empty topologyKey is not allowed.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

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

### `spec.podSpec.containers[].args[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > args

Arguments to the entrypoint. The docker image's CMD is used if this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not. Cannot be updated. More info: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].command[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > command

Entrypoint array. Not executed within a shell. The docker image's ENTRYPOINT is used if this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not. Cannot be updated. More info: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].env[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > env

List of environment variables to set in the container. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].env[].name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > name

Name of the environment variable. Must be a C_IDENTIFIER.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].env[].value`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > value

Variable references $(VAR_NAME) are expanded using the previous defined environment variables in the container and any service environment variables. If a variable cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not. Defaults to "".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].env[].valueFrom`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > valueFrom

EnvVarSource represents a source for the value of an EnvVar.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].env[].valueFrom.configMapKeyRef`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > configMapKeyRef

Selects a key from a ConfigMap.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].env[].valueFrom.configMapKeyRef.key`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [configMapKeyRef](#specpodspeccontainersenvvaluefromconfigmapkeyref) > key

The key to select.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].env[].valueFrom.configMapKeyRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [configMapKeyRef](#specpodspeccontainersenvvaluefromconfigmapkeyref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].env[].valueFrom.configMapKeyRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [configMapKeyRef](#specpodspeccontainersenvvaluefromconfigmapkeyref) > optional

Specify whether the ConfigMap or its key must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].env[].valueFrom.fieldRef`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > fieldRef

ObjectFieldSelector selects an APIVersioned field of an object.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].env[].valueFrom.fieldRef.apiVersion`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [fieldRef](#specpodspeccontainersenvvaluefromfieldref) > apiVersion

Version of the schema the FieldPath is written in terms of, defaults to "v1".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].env[].valueFrom.fieldRef.fieldPath`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [fieldRef](#specpodspeccontainersenvvaluefromfieldref) > fieldPath

Path of the field to select in the specified API version.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].env[].valueFrom.resourceFieldRef`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > resourceFieldRef

ResourceFieldSelector represents container resources (cpu, memory) and their output format

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].env[].valueFrom.resourceFieldRef.containerName`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [resourceFieldRef](#specpodspeccontainersenvvaluefromresourcefieldref) > containerName

Container name: required for volumes, optional for env vars

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].env[].valueFrom.resourceFieldRef.divisor`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [resourceFieldRef](#specpodspeccontainersenvvaluefromresourcefieldref) > divisor

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].env[].valueFrom.resourceFieldRef.resource`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [resourceFieldRef](#specpodspeccontainersenvvaluefromresourcefieldref) > resource

Required: resource to select

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].env[].valueFrom.secretKeyRef`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > secretKeyRef

SecretKeySelector selects a key of a Secret.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].env[].valueFrom.secretKeyRef.key`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [secretKeyRef](#specpodspeccontainersenvvaluefromsecretkeyref) > key

The key of the secret to select from.  Must be a valid secret key.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].env[].valueFrom.secretKeyRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [secretKeyRef](#specpodspeccontainersenvvaluefromsecretkeyref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].env[].valueFrom.secretKeyRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [env](#specpodspeccontainersenv) > [valueFrom](#specpodspeccontainersenvvaluefrom) > [secretKeyRef](#specpodspeccontainersenvvaluefromsecretkeyref) > optional

Specify whether the Secret or its key must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].envFrom[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > envFrom

List of sources to populate environment variables in the container. The keys defined within a source must be a C_IDENTIFIER. All invalid keys will be reported as an event when the container is starting. When a key exists in multiple sources, the value associated with the last source will take precedence. Values defined by an Env with a duplicate key will take precedence. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].envFrom[].configMapRef`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [envFrom](#specpodspeccontainersenvfrom) > configMapRef

ConfigMapEnvSource selects a ConfigMap to populate the environment variables with.

The contents of the target ConfigMap's Data field will represent the key-value pairs as environment variables.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].envFrom[].configMapRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [envFrom](#specpodspeccontainersenvfrom) > [configMapRef](#specpodspeccontainersenvfromconfigmapref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].envFrom[].configMapRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [envFrom](#specpodspeccontainersenvfrom) > [configMapRef](#specpodspeccontainersenvfromconfigmapref) > optional

Specify whether the ConfigMap must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].envFrom[].prefix`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [envFrom](#specpodspeccontainersenvfrom) > prefix

An optional identifier to prepend to each key in the ConfigMap. Must be a C_IDENTIFIER.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].envFrom[].secretRef`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [envFrom](#specpodspeccontainersenvfrom) > secretRef

SecretEnvSource selects a Secret to populate the environment variables with.

The contents of the target Secret's Data field will represent the key-value pairs as environment variables.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].envFrom[].secretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [envFrom](#specpodspeccontainersenvfrom) > [secretRef](#specpodspeccontainersenvfromsecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].envFrom[].secretRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [envFrom](#specpodspeccontainersenvfrom) > [secretRef](#specpodspeccontainersenvfromsecretref) > optional

Specify whether the Secret must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].image`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > image

Docker image name. More info: https://kubernetes.io/docs/concepts/containers/images This field is optional to allow higher level config management to default or override container images in workload controllers like Deployments and StatefulSets.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].imagePullPolicy`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > imagePullPolicy

Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is specified, or IfNotPresent otherwise. Cannot be updated. More info: https://kubernetes.io/docs/concepts/containers/images#updating-images

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > lifecycle

Lifecycle describes actions that the management system should take in response to container lifecycle events. For the PostStart and PreStop lifecycle handlers, management of the container blocks until the action is complete, unless the container process fails, in which case the handler is aborted.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].lifecycle.postStart`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > postStart

Handler defines a specific action that should be taken

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.exec`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > [exec](#specpodspeccontainerslifecyclepoststartexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > [httpGet](#specpodspeccontainerslifecyclepoststarthttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > [httpGet](#specpodspeccontainerslifecyclepoststarthttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > [httpGet](#specpodspeccontainerslifecyclepoststarthttpget) > [httpHeaders](#specpodspeccontainerslifecyclepoststarthttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > [httpGet](#specpodspeccontainerslifecyclepoststarthttpget) > [httpHeaders](#specpodspeccontainerslifecyclepoststarthttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > [httpGet](#specpodspeccontainerslifecyclepoststarthttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > [httpGet](#specpodspeccontainerslifecyclepoststarthttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].lifecycle.postStart.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > [httpGet](#specpodspeccontainerslifecyclepoststarthttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > [tcpSocket](#specpodspeccontainerslifecyclepoststarttcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.postStart.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [postStart](#specpodspeccontainerslifecyclepoststart) > [tcpSocket](#specpodspeccontainerslifecyclepoststarttcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].lifecycle.preStop`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > preStop

Handler defines a specific action that should be taken

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.exec`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > [exec](#specpodspeccontainerslifecycleprestopexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > [httpGet](#specpodspeccontainerslifecycleprestophttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > [httpGet](#specpodspeccontainerslifecycleprestophttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > [httpGet](#specpodspeccontainerslifecycleprestophttpget) > [httpHeaders](#specpodspeccontainerslifecycleprestophttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > [httpGet](#specpodspeccontainerslifecycleprestophttpget) > [httpHeaders](#specpodspeccontainerslifecycleprestophttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > [httpGet](#specpodspeccontainerslifecycleprestophttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > [httpGet](#specpodspeccontainerslifecycleprestophttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].lifecycle.preStop.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > [httpGet](#specpodspeccontainerslifecycleprestophttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > [tcpSocket](#specpodspeccontainerslifecycleprestoptcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].lifecycle.preStop.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [lifecycle](#specpodspeccontainerslifecycle) > [preStop](#specpodspeccontainerslifecycleprestop) > [tcpSocket](#specpodspeccontainerslifecycleprestoptcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].livenessProbe`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > livenessProbe

Probe describes a health check to be performed against a container to determine whether it is alive or ready to receive traffic.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].livenessProbe.exec`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].livenessProbe.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > [exec](#specpodspeccontainerslivenessprobeexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].livenessProbe.failureThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > failureThreshold

Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].livenessProbe.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].livenessProbe.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > [httpGet](#specpodspeccontainerslivenessprobehttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].livenessProbe.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > [httpGet](#specpodspeccontainerslivenessprobehttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].livenessProbe.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > [httpGet](#specpodspeccontainerslivenessprobehttpget) > [httpHeaders](#specpodspeccontainerslivenessprobehttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].livenessProbe.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > [httpGet](#specpodspeccontainerslivenessprobehttpget) > [httpHeaders](#specpodspeccontainerslivenessprobehttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].livenessProbe.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > [httpGet](#specpodspeccontainerslivenessprobehttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].livenessProbe.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > [httpGet](#specpodspeccontainerslivenessprobehttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].livenessProbe.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > [httpGet](#specpodspeccontainerslivenessprobehttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].livenessProbe.initialDelaySeconds`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > initialDelaySeconds

Number of seconds after the container has started before liveness probes are initiated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].livenessProbe.periodSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > periodSeconds

How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].livenessProbe.successThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > successThreshold

Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to 1. Must be 1 for liveness and startup. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].livenessProbe.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].livenessProbe.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > [tcpSocket](#specpodspeccontainerslivenessprobetcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].livenessProbe.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > [tcpSocket](#specpodspeccontainerslivenessprobetcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].livenessProbe.timeoutSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [livenessProbe](#specpodspeccontainerslivenessprobe) > timeoutSeconds

Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > name

Name of the container specified as a DNS_LABEL. Each container in a pod must have a unique name (DNS_LABEL). Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].ports[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > ports

List of ports to expose from the container. Exposing a port here gives the system additional information about the network connections a container uses, but is primarily informational. Not specifying a port here DOES NOT prevent that port from being exposed. Any port which is listening on the default "0.0.0.0" address inside a container will be accessible from the network. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].ports[].containerPort`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [ports](#specpodspeccontainersports) > containerPort

Number of port to expose on the pod's IP address. This must be a valid port number, 0 < x < 65536.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].ports[].hostIP`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [ports](#specpodspeccontainersports) > hostIP

What host IP to bind the external port to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].ports[].hostPort`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [ports](#specpodspeccontainersports) > hostPort

Number of port to expose on the host. If specified, this must be a valid port number, 0 < x < 65536. If HostNetwork is specified, this must match ContainerPort. Most containers do not need this.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].ports[].name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [ports](#specpodspeccontainersports) > name

If specified, this must be an IANA_SVC_NAME and unique within the pod. Each named port in a pod must have a unique name. Name for the port that can be referred to by services.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].ports[].protocol`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [ports](#specpodspeccontainersports) > protocol

Protocol for port. Must be UDP, TCP, or SCTP. Defaults to "TCP".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].readinessProbe`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > readinessProbe

Probe describes a health check to be performed against a container to determine whether it is alive or ready to receive traffic.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].readinessProbe.exec`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].readinessProbe.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > [exec](#specpodspeccontainersreadinessprobeexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].readinessProbe.failureThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > failureThreshold

Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].readinessProbe.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].readinessProbe.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > [httpGet](#specpodspeccontainersreadinessprobehttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].readinessProbe.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > [httpGet](#specpodspeccontainersreadinessprobehttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].readinessProbe.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > [httpGet](#specpodspeccontainersreadinessprobehttpget) > [httpHeaders](#specpodspeccontainersreadinessprobehttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].readinessProbe.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > [httpGet](#specpodspeccontainersreadinessprobehttpget) > [httpHeaders](#specpodspeccontainersreadinessprobehttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].readinessProbe.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > [httpGet](#specpodspeccontainersreadinessprobehttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].readinessProbe.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > [httpGet](#specpodspeccontainersreadinessprobehttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].readinessProbe.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > [httpGet](#specpodspeccontainersreadinessprobehttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].readinessProbe.initialDelaySeconds`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > initialDelaySeconds

Number of seconds after the container has started before liveness probes are initiated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].readinessProbe.periodSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > periodSeconds

How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].readinessProbe.successThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > successThreshold

Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to 1. Must be 1 for liveness and startup. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].readinessProbe.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].readinessProbe.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > [tcpSocket](#specpodspeccontainersreadinessprobetcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].readinessProbe.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > [tcpSocket](#specpodspeccontainersreadinessprobetcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].readinessProbe.timeoutSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [readinessProbe](#specpodspeccontainersreadinessprobe) > timeoutSeconds

Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].resources`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > resources

ResourceRequirements describes the compute resource requirements.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].resources.limits`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [resources](#specpodspeccontainersresources) > limits

Limits describes the maximum amount of compute resources allowed. More info: https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].resources.requests`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [resources](#specpodspeccontainersresources) > requests

Requests describes the minimum amount of compute resources required. If Requests is omitted for a container, it defaults to Limits if that is explicitly specified, otherwise to an implementation-defined value. More info: https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].securityContext`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > securityContext

SecurityContext holds security configuration that will be applied to a container. Some fields are present in both SecurityContext and PodSecurityContext.  When both are set, the values in SecurityContext take precedence.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].securityContext.allowPrivilegeEscalation`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > allowPrivilegeEscalation

AllowPrivilegeEscalation controls whether a process can gain more privileges than its parent process. This bool directly controls if the no_new_privs flag will be set on the container process. AllowPrivilegeEscalation is true always when the container is: 1) run as Privileged 2) has CAP_SYS_ADMIN

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].securityContext.capabilities`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > capabilities

Adds and removes POSIX capabilities from running containers.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].securityContext.capabilities.add[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > [capabilities](#specpodspeccontainerssecuritycontextcapabilities) > add

Added capabilities

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].securityContext.capabilities.drop[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > [capabilities](#specpodspeccontainerssecuritycontextcapabilities) > drop

Removed capabilities

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].securityContext.privileged`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > privileged

Run container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].securityContext.procMount`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > procMount

procMount denotes the type of proc mount to use for the containers. The default is DefaultProcMount which uses the container runtime defaults for readonly paths and masked paths. This requires the ProcMountType feature flag to be enabled.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].securityContext.readOnlyRootFilesystem`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > readOnlyRootFilesystem

Whether this container has a read-only root filesystem. Default is false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].securityContext.runAsGroup`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > runAsGroup

The GID to run the entrypoint of the container process. Uses runtime default if unset. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].securityContext.runAsNonRoot`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > runAsNonRoot

Indicates that the container must run as a non-root user. If true, the Kubelet will validate the image at runtime to ensure that it does not run as UID 0 (root) and fail to start the container if it does. If unset or false, no such validation will be performed. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].securityContext.runAsUser`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > runAsUser

The UID to run the entrypoint of the container process. Defaults to user specified in image metadata if unspecified. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].securityContext.seLinuxOptions`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > seLinuxOptions

SELinuxOptions are the labels to be applied to the container

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].securityContext.seLinuxOptions.level`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > [seLinuxOptions](#specpodspeccontainerssecuritycontextselinuxoptions) > level

Level is SELinux level label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].securityContext.seLinuxOptions.role`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > [seLinuxOptions](#specpodspeccontainerssecuritycontextselinuxoptions) > role

Role is a SELinux role label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].securityContext.seLinuxOptions.type`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > [seLinuxOptions](#specpodspeccontainerssecuritycontextselinuxoptions) > type

Type is a SELinux type label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].securityContext.seLinuxOptions.user`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > [seLinuxOptions](#specpodspeccontainerssecuritycontextselinuxoptions) > user

User is a SELinux user label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].securityContext.windowsOptions`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > windowsOptions

WindowsSecurityContextOptions contain Windows-specific options and credentials.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].securityContext.windowsOptions.gmsaCredentialSpec`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > [windowsOptions](#specpodspeccontainerssecuritycontextwindowsoptions) > gmsaCredentialSpec

GMSACredentialSpec is where the GMSA admission webhook (https://github.com/kubernetes-sigs/windows-gmsa) inlines the contents of the GMSA credential spec named by the GMSACredentialSpecName field.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].securityContext.windowsOptions.gmsaCredentialSpecName`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > [windowsOptions](#specpodspeccontainerssecuritycontextwindowsoptions) > gmsaCredentialSpecName

GMSACredentialSpecName is the name of the GMSA credential spec to use.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].securityContext.windowsOptions.runAsUserName`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [securityContext](#specpodspeccontainerssecuritycontext) > [windowsOptions](#specpodspeccontainerssecuritycontextwindowsoptions) > runAsUserName

The UserName in Windows to run the entrypoint of the container process. Defaults to the user specified in image metadata if unspecified. May also be set in PodSecurityContext. If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].startupProbe`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > startupProbe

Probe describes a health check to be performed against a container to determine whether it is alive or ready to receive traffic.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].startupProbe.exec`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].startupProbe.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > [exec](#specpodspeccontainersstartupprobeexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].startupProbe.failureThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > failureThreshold

Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].startupProbe.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].startupProbe.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > [httpGet](#specpodspeccontainersstartupprobehttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].startupProbe.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > [httpGet](#specpodspeccontainersstartupprobehttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].startupProbe.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > [httpGet](#specpodspeccontainersstartupprobehttpget) > [httpHeaders](#specpodspeccontainersstartupprobehttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].startupProbe.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > [httpGet](#specpodspeccontainersstartupprobehttpget) > [httpHeaders](#specpodspeccontainersstartupprobehttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].startupProbe.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > [httpGet](#specpodspeccontainersstartupprobehttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].startupProbe.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > [httpGet](#specpodspeccontainersstartupprobehttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].startupProbe.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > [httpGet](#specpodspeccontainersstartupprobehttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].startupProbe.initialDelaySeconds`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > initialDelaySeconds

Number of seconds after the container has started before liveness probes are initiated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].startupProbe.periodSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > periodSeconds

How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].startupProbe.successThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > successThreshold

Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to 1. Must be 1 for liveness and startup. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].startupProbe.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.containers[].startupProbe.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > [tcpSocket](#specpodspeccontainersstartupprobetcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].startupProbe.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > [tcpSocket](#specpodspeccontainersstartupprobetcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.containers[].startupProbe.timeoutSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [startupProbe](#specpodspeccontainersstartupprobe) > timeoutSeconds

Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.containers[].stdin`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > stdin

Whether this container should allocate a buffer for stdin in the container runtime. If this is not set, reads from stdin in the container will always result in EOF. Default is false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].stdinOnce`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > stdinOnce

Whether the container runtime should close the stdin channel after it has been opened by a single attach. When stdin is true the stdin stream will remain open across multiple attach sessions. If stdinOnce is set to true, stdin is opened on container start, is empty until the first client attaches to stdin, and then remains open and accepts data until the client disconnects, at which time stdin is closed and remains closed until the container is restarted. If this flag is false, a container processes that reads from stdin will never receive an EOF. Default is false

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].terminationMessagePath`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > terminationMessagePath

Optional: Path at which the file to which the container's termination message will be written is mounted into the container's filesystem. Message written is intended to be brief final status, such as an assertion failure message. Will be truncated by the node if greater than 4096 bytes. The total message length across all containers will be limited to 12kb. Defaults to /dev/termination-log. Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].terminationMessagePolicy`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > terminationMessagePolicy

Indicate how the termination message should be populated. File will use the contents of terminationMessagePath to populate the container status message on both success and failure. FallbackToLogsOnError will use the last chunk of container log output if the termination message file is empty and the container exited with an error. The log output is limited to 2048 bytes or 80 lines, whichever is smaller. Defaults to File. Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].tty`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > tty

Whether this container should allocate a TTY for itself, also requires 'stdin' to be true. Default is false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].volumeDevices[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > volumeDevices

volumeDevices is the list of block devices to be used by the container.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].volumeDevices[].devicePath`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [volumeDevices](#specpodspeccontainersvolumedevices) > devicePath

devicePath is the path inside of the container that the device will be mapped to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].volumeDevices[].name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [volumeDevices](#specpodspeccontainersvolumedevices) > name

name must match the name of a persistentVolumeClaim in the pod

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].volumeMounts[]`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > volumeMounts

Pod volumes to mount into the container's filesystem. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.containers[].volumeMounts[].mountPath`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [volumeMounts](#specpodspeccontainersvolumemounts) > mountPath

Path within the container at which the volume should be mounted.  Must not contain ':'.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].volumeMounts[].mountPropagation`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [volumeMounts](#specpodspeccontainersvolumemounts) > mountPropagation

mountPropagation determines how mounts are propagated from the host to container and the other way around. When not set, MountPropagationNone is used. This field is beta in 1.10.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].volumeMounts[].name`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [volumeMounts](#specpodspeccontainersvolumemounts) > name

This must match the Name of a Volume.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].volumeMounts[].readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [volumeMounts](#specpodspeccontainersvolumemounts) > readOnly

Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.containers[].volumeMounts[].subPath`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [volumeMounts](#specpodspeccontainersvolumemounts) > subPath

Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's root).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].volumeMounts[].subPathExpr`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > [volumeMounts](#specpodspeccontainersvolumemounts) > subPathExpr

Expanded path within the volume from which the container's volume should be mounted. Behaves similarly to SubPath but environment variable references $(VAR_NAME) are expanded using the container's environment. Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.containers[].workingDir`

[spec](#spec) > [podSpec](#specpodspec) > [containers](#specpodspeccontainers) > workingDir

Container's working directory. If not specified, the container runtime's default will be used, which might be configured in the container image. Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

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

### `spec.podSpec.dnsConfig.options[].name`

[spec](#spec) > [podSpec](#specpodspec) > [dnsConfig](#specpodspecdnsconfig) > [options](#specpodspecdnsconfigoptions) > name

Required.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.dnsConfig.options[].value`

[spec](#spec) > [podSpec](#specpodspec) > [dnsConfig](#specpodspecdnsconfig) > [options](#specpodspecdnsconfigoptions) > value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

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

### `spec.podSpec.ephemeralContainers[].args[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > args

Arguments to the entrypoint. The docker image's CMD is used if this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not. Cannot be updated. More info: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].command[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > command

Entrypoint array. Not executed within a shell. The docker image's ENTRYPOINT is used if this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not. Cannot be updated. More info: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].env[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > env

List of environment variables to set in the container. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].env[].name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > name

Name of the environment variable. Must be a C_IDENTIFIER.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].env[].value`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > value

Variable references $(VAR_NAME) are expanded using the previous defined environment variables in the container and any service environment variables. If a variable cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not. Defaults to "".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > valueFrom

EnvVarSource represents a source for the value of an EnvVar.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.configMapKeyRef`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > configMapKeyRef

Selects a key from a ConfigMap.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.configMapKeyRef.key`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [configMapKeyRef](#specpodspecephemeralcontainersenvvaluefromconfigmapkeyref) > key

The key to select.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.configMapKeyRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [configMapKeyRef](#specpodspecephemeralcontainersenvvaluefromconfigmapkeyref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.configMapKeyRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [configMapKeyRef](#specpodspecephemeralcontainersenvvaluefromconfigmapkeyref) > optional

Specify whether the ConfigMap or its key must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.fieldRef`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > fieldRef

ObjectFieldSelector selects an APIVersioned field of an object.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.fieldRef.apiVersion`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [fieldRef](#specpodspecephemeralcontainersenvvaluefromfieldref) > apiVersion

Version of the schema the FieldPath is written in terms of, defaults to "v1".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.fieldRef.fieldPath`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [fieldRef](#specpodspecephemeralcontainersenvvaluefromfieldref) > fieldPath

Path of the field to select in the specified API version.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.resourceFieldRef`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > resourceFieldRef

ResourceFieldSelector represents container resources (cpu, memory) and their output format

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.resourceFieldRef.containerName`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [resourceFieldRef](#specpodspecephemeralcontainersenvvaluefromresourcefieldref) > containerName

Container name: required for volumes, optional for env vars

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.resourceFieldRef.divisor`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [resourceFieldRef](#specpodspecephemeralcontainersenvvaluefromresourcefieldref) > divisor

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.resourceFieldRef.resource`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [resourceFieldRef](#specpodspecephemeralcontainersenvvaluefromresourcefieldref) > resource

Required: resource to select

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.secretKeyRef`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > secretKeyRef

SecretKeySelector selects a key of a Secret.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.secretKeyRef.key`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [secretKeyRef](#specpodspecephemeralcontainersenvvaluefromsecretkeyref) > key

The key of the secret to select from.  Must be a valid secret key.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.secretKeyRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [secretKeyRef](#specpodspecephemeralcontainersenvvaluefromsecretkeyref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].env[].valueFrom.secretKeyRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [env](#specpodspecephemeralcontainersenv) > [valueFrom](#specpodspecephemeralcontainersenvvaluefrom) > [secretKeyRef](#specpodspecephemeralcontainersenvvaluefromsecretkeyref) > optional

Specify whether the Secret or its key must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].envFrom[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > envFrom

List of sources to populate environment variables in the container. The keys defined within a source must be a C_IDENTIFIER. All invalid keys will be reported as an event when the container is starting. When a key exists in multiple sources, the value associated with the last source will take precedence. Values defined by an Env with a duplicate key will take precedence. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].envFrom[].configMapRef`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [envFrom](#specpodspecephemeralcontainersenvfrom) > configMapRef

ConfigMapEnvSource selects a ConfigMap to populate the environment variables with.

The contents of the target ConfigMap's Data field will represent the key-value pairs as environment variables.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].envFrom[].configMapRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [envFrom](#specpodspecephemeralcontainersenvfrom) > [configMapRef](#specpodspecephemeralcontainersenvfromconfigmapref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].envFrom[].configMapRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [envFrom](#specpodspecephemeralcontainersenvfrom) > [configMapRef](#specpodspecephemeralcontainersenvfromconfigmapref) > optional

Specify whether the ConfigMap must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].envFrom[].prefix`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [envFrom](#specpodspecephemeralcontainersenvfrom) > prefix

An optional identifier to prepend to each key in the ConfigMap. Must be a C_IDENTIFIER.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].envFrom[].secretRef`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [envFrom](#specpodspecephemeralcontainersenvfrom) > secretRef

SecretEnvSource selects a Secret to populate the environment variables with.

The contents of the target Secret's Data field will represent the key-value pairs as environment variables.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].envFrom[].secretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [envFrom](#specpodspecephemeralcontainersenvfrom) > [secretRef](#specpodspecephemeralcontainersenvfromsecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].envFrom[].secretRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [envFrom](#specpodspecephemeralcontainersenvfrom) > [secretRef](#specpodspecephemeralcontainersenvfromsecretref) > optional

Specify whether the Secret must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].image`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > image

Docker image name. More info: https://kubernetes.io/docs/concepts/containers/images

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].imagePullPolicy`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > imagePullPolicy

Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is specified, or IfNotPresent otherwise. Cannot be updated. More info: https://kubernetes.io/docs/concepts/containers/images#updating-images

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > lifecycle

Lifecycle describes actions that the management system should take in response to container lifecycle events. For the PostStart and PreStop lifecycle handlers, management of the container blocks until the action is complete, unless the container process fails, in which case the handler is aborted.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > postStart

Handler defines a specific action that should be taken

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.exec`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > [exec](#specpodspecephemeralcontainerslifecyclepoststartexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > [httpGet](#specpodspecephemeralcontainerslifecyclepoststarthttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > [httpGet](#specpodspecephemeralcontainerslifecyclepoststarthttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > [httpGet](#specpodspecephemeralcontainerslifecyclepoststarthttpget) > [httpHeaders](#specpodspecephemeralcontainerslifecyclepoststarthttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > [httpGet](#specpodspecephemeralcontainerslifecyclepoststarthttpget) > [httpHeaders](#specpodspecephemeralcontainerslifecyclepoststarthttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > [httpGet](#specpodspecephemeralcontainerslifecyclepoststarthttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > [httpGet](#specpodspecephemeralcontainerslifecyclepoststarthttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > [httpGet](#specpodspecephemeralcontainerslifecyclepoststarthttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > [tcpSocket](#specpodspecephemeralcontainerslifecyclepoststarttcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.postStart.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [postStart](#specpodspecephemeralcontainerslifecyclepoststart) > [tcpSocket](#specpodspecephemeralcontainerslifecyclepoststarttcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > preStop

Handler defines a specific action that should be taken

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.exec`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > [exec](#specpodspecephemeralcontainerslifecycleprestopexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > [httpGet](#specpodspecephemeralcontainerslifecycleprestophttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > [httpGet](#specpodspecephemeralcontainerslifecycleprestophttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > [httpGet](#specpodspecephemeralcontainerslifecycleprestophttpget) > [httpHeaders](#specpodspecephemeralcontainerslifecycleprestophttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > [httpGet](#specpodspecephemeralcontainerslifecycleprestophttpget) > [httpHeaders](#specpodspecephemeralcontainerslifecycleprestophttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > [httpGet](#specpodspecephemeralcontainerslifecycleprestophttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > [httpGet](#specpodspecephemeralcontainerslifecycleprestophttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > [httpGet](#specpodspecephemeralcontainerslifecycleprestophttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > [tcpSocket](#specpodspecephemeralcontainerslifecycleprestoptcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].lifecycle.preStop.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [lifecycle](#specpodspecephemeralcontainerslifecycle) > [preStop](#specpodspecephemeralcontainerslifecycleprestop) > [tcpSocket](#specpodspecephemeralcontainerslifecycleprestoptcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].livenessProbe`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > livenessProbe

Probe describes a health check to be performed against a container to determine whether it is alive or ready to receive traffic.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.exec`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > [exec](#specpodspecephemeralcontainerslivenessprobeexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.failureThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > failureThreshold

Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > [httpGet](#specpodspecephemeralcontainerslivenessprobehttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > [httpGet](#specpodspecephemeralcontainerslivenessprobehttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > [httpGet](#specpodspecephemeralcontainerslivenessprobehttpget) > [httpHeaders](#specpodspecephemeralcontainerslivenessprobehttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > [httpGet](#specpodspecephemeralcontainerslivenessprobehttpget) > [httpHeaders](#specpodspecephemeralcontainerslivenessprobehttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > [httpGet](#specpodspecephemeralcontainerslivenessprobehttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > [httpGet](#specpodspecephemeralcontainerslivenessprobehttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].livenessProbe.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > [httpGet](#specpodspecephemeralcontainerslivenessprobehttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.initialDelaySeconds`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > initialDelaySeconds

Number of seconds after the container has started before liveness probes are initiated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.periodSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > periodSeconds

How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.successThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > successThreshold

Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to 1. Must be 1 for liveness and startup. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > [tcpSocket](#specpodspecephemeralcontainerslivenessprobetcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].livenessProbe.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > [tcpSocket](#specpodspecephemeralcontainerslivenessprobetcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].livenessProbe.timeoutSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [livenessProbe](#specpodspecephemeralcontainerslivenessprobe) > timeoutSeconds

Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > name

Name of the ephemeral container specified as a DNS_LABEL. This name must be unique among all containers, init containers and ephemeral containers.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].ports[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > ports

Ports are not allowed for ephemeral containers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].ports[].containerPort`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [ports](#specpodspecephemeralcontainersports) > containerPort

Number of port to expose on the pod's IP address. This must be a valid port number, 0 < x < 65536.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].ports[].hostIP`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [ports](#specpodspecephemeralcontainersports) > hostIP

What host IP to bind the external port to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].ports[].hostPort`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [ports](#specpodspecephemeralcontainersports) > hostPort

Number of port to expose on the host. If specified, this must be a valid port number, 0 < x < 65536. If HostNetwork is specified, this must match ContainerPort. Most containers do not need this.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].ports[].name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [ports](#specpodspecephemeralcontainersports) > name

If specified, this must be an IANA_SVC_NAME and unique within the pod. Each named port in a pod must have a unique name. Name for the port that can be referred to by services.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].ports[].protocol`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [ports](#specpodspecephemeralcontainersports) > protocol

Protocol for port. Must be UDP, TCP, or SCTP. Defaults to "TCP".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > readinessProbe

Probe describes a health check to be performed against a container to determine whether it is alive or ready to receive traffic.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.exec`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > [exec](#specpodspecephemeralcontainersreadinessprobeexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.failureThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > failureThreshold

Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > [httpGet](#specpodspecephemeralcontainersreadinessprobehttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > [httpGet](#specpodspecephemeralcontainersreadinessprobehttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > [httpGet](#specpodspecephemeralcontainersreadinessprobehttpget) > [httpHeaders](#specpodspecephemeralcontainersreadinessprobehttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > [httpGet](#specpodspecephemeralcontainersreadinessprobehttpget) > [httpHeaders](#specpodspecephemeralcontainersreadinessprobehttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > [httpGet](#specpodspecephemeralcontainersreadinessprobehttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > [httpGet](#specpodspecephemeralcontainersreadinessprobehttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].readinessProbe.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > [httpGet](#specpodspecephemeralcontainersreadinessprobehttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.initialDelaySeconds`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > initialDelaySeconds

Number of seconds after the container has started before liveness probes are initiated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.periodSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > periodSeconds

How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.successThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > successThreshold

Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to 1. Must be 1 for liveness and startup. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > [tcpSocket](#specpodspecephemeralcontainersreadinessprobetcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].readinessProbe.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > [tcpSocket](#specpodspecephemeralcontainersreadinessprobetcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].readinessProbe.timeoutSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [readinessProbe](#specpodspecephemeralcontainersreadinessprobe) > timeoutSeconds

Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].resources`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > resources

ResourceRequirements describes the compute resource requirements.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].resources.limits`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [resources](#specpodspecephemeralcontainersresources) > limits

Limits describes the maximum amount of compute resources allowed. More info: https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].resources.requests`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [resources](#specpodspecephemeralcontainersresources) > requests

Requests describes the minimum amount of compute resources required. If Requests is omitted for a container, it defaults to Limits if that is explicitly specified, otherwise to an implementation-defined value. More info: https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > securityContext

SecurityContext holds security configuration that will be applied to a container. Some fields are present in both SecurityContext and PodSecurityContext.  When both are set, the values in SecurityContext take precedence.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.allowPrivilegeEscalation`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > allowPrivilegeEscalation

AllowPrivilegeEscalation controls whether a process can gain more privileges than its parent process. This bool directly controls if the no_new_privs flag will be set on the container process. AllowPrivilegeEscalation is true always when the container is: 1) run as Privileged 2) has CAP_SYS_ADMIN

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.capabilities`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > capabilities

Adds and removes POSIX capabilities from running containers.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.capabilities.add[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > [capabilities](#specpodspecephemeralcontainerssecuritycontextcapabilities) > add

Added capabilities

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.capabilities.drop[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > [capabilities](#specpodspecephemeralcontainerssecuritycontextcapabilities) > drop

Removed capabilities

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.privileged`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > privileged

Run container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.procMount`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > procMount

procMount denotes the type of proc mount to use for the containers. The default is DefaultProcMount which uses the container runtime defaults for readonly paths and masked paths. This requires the ProcMountType feature flag to be enabled.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.readOnlyRootFilesystem`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > readOnlyRootFilesystem

Whether this container has a read-only root filesystem. Default is false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.runAsGroup`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > runAsGroup

The GID to run the entrypoint of the container process. Uses runtime default if unset. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.runAsNonRoot`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > runAsNonRoot

Indicates that the container must run as a non-root user. If true, the Kubelet will validate the image at runtime to ensure that it does not run as UID 0 (root) and fail to start the container if it does. If unset or false, no such validation will be performed. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.runAsUser`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > runAsUser

The UID to run the entrypoint of the container process. Defaults to user specified in image metadata if unspecified. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.seLinuxOptions`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > seLinuxOptions

SELinuxOptions are the labels to be applied to the container

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.seLinuxOptions.level`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > [seLinuxOptions](#specpodspecephemeralcontainerssecuritycontextselinuxoptions) > level

Level is SELinux level label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.seLinuxOptions.role`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > [seLinuxOptions](#specpodspecephemeralcontainerssecuritycontextselinuxoptions) > role

Role is a SELinux role label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.seLinuxOptions.type`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > [seLinuxOptions](#specpodspecephemeralcontainerssecuritycontextselinuxoptions) > type

Type is a SELinux type label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.seLinuxOptions.user`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > [seLinuxOptions](#specpodspecephemeralcontainerssecuritycontextselinuxoptions) > user

User is a SELinux user label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.windowsOptions`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > windowsOptions

WindowsSecurityContextOptions contain Windows-specific options and credentials.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.windowsOptions.gmsaCredentialSpec`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > [windowsOptions](#specpodspecephemeralcontainerssecuritycontextwindowsoptions) > gmsaCredentialSpec

GMSACredentialSpec is where the GMSA admission webhook (https://github.com/kubernetes-sigs/windows-gmsa) inlines the contents of the GMSA credential spec named by the GMSACredentialSpecName field.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.windowsOptions.gmsaCredentialSpecName`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > [windowsOptions](#specpodspecephemeralcontainerssecuritycontextwindowsoptions) > gmsaCredentialSpecName

GMSACredentialSpecName is the name of the GMSA credential spec to use.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].securityContext.windowsOptions.runAsUserName`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [securityContext](#specpodspecephemeralcontainerssecuritycontext) > [windowsOptions](#specpodspecephemeralcontainerssecuritycontextwindowsoptions) > runAsUserName

The UserName in Windows to run the entrypoint of the container process. Defaults to the user specified in image metadata if unspecified. May also be set in PodSecurityContext. If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > startupProbe

Probe describes a health check to be performed against a container to determine whether it is alive or ready to receive traffic.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.exec`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > [exec](#specpodspecephemeralcontainersstartupprobeexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.failureThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > failureThreshold

Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > [httpGet](#specpodspecephemeralcontainersstartupprobehttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > [httpGet](#specpodspecephemeralcontainersstartupprobehttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > [httpGet](#specpodspecephemeralcontainersstartupprobehttpget) > [httpHeaders](#specpodspecephemeralcontainersstartupprobehttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > [httpGet](#specpodspecephemeralcontainersstartupprobehttpget) > [httpHeaders](#specpodspecephemeralcontainersstartupprobehttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > [httpGet](#specpodspecephemeralcontainersstartupprobehttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > [httpGet](#specpodspecephemeralcontainersstartupprobehttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].startupProbe.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > [httpGet](#specpodspecephemeralcontainersstartupprobehttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.initialDelaySeconds`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > initialDelaySeconds

Number of seconds after the container has started before liveness probes are initiated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.periodSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > periodSeconds

How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.successThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > successThreshold

Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to 1. Must be 1 for liveness and startup. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > [tcpSocket](#specpodspecephemeralcontainersstartupprobetcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].startupProbe.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > [tcpSocket](#specpodspecephemeralcontainersstartupprobetcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.ephemeralContainers[].startupProbe.timeoutSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [startupProbe](#specpodspecephemeralcontainersstartupprobe) > timeoutSeconds

Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.ephemeralContainers[].stdin`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > stdin

Whether this container should allocate a buffer for stdin in the container runtime. If this is not set, reads from stdin in the container will always result in EOF. Default is false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].stdinOnce`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > stdinOnce

Whether the container runtime should close the stdin channel after it has been opened by a single attach. When stdin is true the stdin stream will remain open across multiple attach sessions. If stdinOnce is set to true, stdin is opened on container start, is empty until the first client attaches to stdin, and then remains open and accepts data until the client disconnects, at which time stdin is closed and remains closed until the container is restarted. If this flag is false, a container processes that reads from stdin will never receive an EOF. Default is false

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].targetContainerName`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > targetContainerName

If set, the name of the container from PodSpec that this ephemeral container targets. The ephemeral container will be run in the namespaces (IPC, PID, etc) of this container. If not set then the ephemeral container is run in whatever namespaces are shared for the pod. Note that the container runtime must support this feature.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].terminationMessagePath`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > terminationMessagePath

Optional: Path at which the file to which the container's termination message will be written is mounted into the container's filesystem. Message written is intended to be brief final status, such as an assertion failure message. Will be truncated by the node if greater than 4096 bytes. The total message length across all containers will be limited to 12kb. Defaults to /dev/termination-log. Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].terminationMessagePolicy`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > terminationMessagePolicy

Indicate how the termination message should be populated. File will use the contents of terminationMessagePath to populate the container status message on both success and failure. FallbackToLogsOnError will use the last chunk of container log output if the termination message file is empty and the container exited with an error. The log output is limited to 2048 bytes or 80 lines, whichever is smaller. Defaults to File. Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].tty`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > tty

Whether this container should allocate a TTY for itself, also requires 'stdin' to be true. Default is false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].volumeDevices[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > volumeDevices

volumeDevices is the list of block devices to be used by the container.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].volumeDevices[].devicePath`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [volumeDevices](#specpodspecephemeralcontainersvolumedevices) > devicePath

devicePath is the path inside of the container that the device will be mapped to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].volumeDevices[].name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [volumeDevices](#specpodspecephemeralcontainersvolumedevices) > name

name must match the name of a persistentVolumeClaim in the pod

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].volumeMounts[]`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > volumeMounts

Pod volumes to mount into the container's filesystem. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.ephemeralContainers[].volumeMounts[].mountPath`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [volumeMounts](#specpodspecephemeralcontainersvolumemounts) > mountPath

Path within the container at which the volume should be mounted.  Must not contain ':'.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].volumeMounts[].mountPropagation`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [volumeMounts](#specpodspecephemeralcontainersvolumemounts) > mountPropagation

mountPropagation determines how mounts are propagated from the host to container and the other way around. When not set, MountPropagationNone is used. This field is beta in 1.10.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].volumeMounts[].name`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [volumeMounts](#specpodspecephemeralcontainersvolumemounts) > name

This must match the Name of a Volume.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].volumeMounts[].readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [volumeMounts](#specpodspecephemeralcontainersvolumemounts) > readOnly

Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.ephemeralContainers[].volumeMounts[].subPath`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [volumeMounts](#specpodspecephemeralcontainersvolumemounts) > subPath

Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's root).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].volumeMounts[].subPathExpr`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > [volumeMounts](#specpodspecephemeralcontainersvolumemounts) > subPathExpr

Expanded path within the volume from which the container's volume should be mounted. Behaves similarly to SubPath but environment variable references $(VAR_NAME) are expanded using the container's environment. Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.ephemeralContainers[].workingDir`

[spec](#spec) > [podSpec](#specpodspec) > [ephemeralContainers](#specpodspecephemeralcontainers) > workingDir

Container's working directory. If not specified, the container runtime's default will be used, which might be configured in the container image. Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.hostAliases[]`

[spec](#spec) > [podSpec](#specpodspec) > hostAliases

HostAliases is an optional list of hosts and IPs that will be injected into the pod's hosts file if specified. This is only valid for non-hostNetwork pods.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.hostAliases[].hostnames[]`

[spec](#spec) > [podSpec](#specpodspec) > [hostAliases](#specpodspechostaliases) > hostnames

Hostnames for the above IP address.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.hostAliases[].ip`

[spec](#spec) > [podSpec](#specpodspec) > [hostAliases](#specpodspechostaliases) > ip

IP address of the host file entry.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

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

### `spec.podSpec.imagePullSecrets[].name`

[spec](#spec) > [podSpec](#specpodspec) > [imagePullSecrets](#specpodspecimagepullsecrets) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[]`

[spec](#spec) > [podSpec](#specpodspec) > initContainers

List of initialization containers belonging to the pod. Init containers are executed in order prior to containers being started. If any init container fails, the pod is considered to have failed and is handled according to its restartPolicy. The name for an init container or normal container must be unique among all containers. Init containers may not have Lifecycle actions, Readiness probes, Liveness probes, or Startup probes. The resourceRequirements of an init container are taken into account during scheduling by finding the highest request/limit for each resource type, and then using the max of of that value or the sum of the normal containers. Limits are applied to init containers in a similar fashion. Init containers cannot currently be added or removed. Cannot be updated. More info: https://kubernetes.io/docs/concepts/workloads/pods/init-containers/

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].args[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > args

Arguments to the entrypoint. The docker image's CMD is used if this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not. Cannot be updated. More info: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].command[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > command

Entrypoint array. Not executed within a shell. The docker image's ENTRYPOINT is used if this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not. Cannot be updated. More info: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].env[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > env

List of environment variables to set in the container. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].env[].name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > name

Name of the environment variable. Must be a C_IDENTIFIER.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].env[].value`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > value

Variable references $(VAR_NAME) are expanded using the previous defined environment variables in the container and any service environment variables. If a variable cannot be resolved, the reference in the input string will be unchanged. The $(VAR_NAME) syntax can be escaped with a double $$, ie: $$(VAR_NAME). Escaped references will never be expanded, regardless of whether the variable exists or not. Defaults to "".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > valueFrom

EnvVarSource represents a source for the value of an EnvVar.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.configMapKeyRef`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > configMapKeyRef

Selects a key from a ConfigMap.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.configMapKeyRef.key`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [configMapKeyRef](#specpodspecinitcontainersenvvaluefromconfigmapkeyref) > key

The key to select.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].env[].valueFrom.configMapKeyRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [configMapKeyRef](#specpodspecinitcontainersenvvaluefromconfigmapkeyref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.configMapKeyRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [configMapKeyRef](#specpodspecinitcontainersenvvaluefromconfigmapkeyref) > optional

Specify whether the ConfigMap or its key must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.fieldRef`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > fieldRef

ObjectFieldSelector selects an APIVersioned field of an object.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.fieldRef.apiVersion`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [fieldRef](#specpodspecinitcontainersenvvaluefromfieldref) > apiVersion

Version of the schema the FieldPath is written in terms of, defaults to "v1".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.fieldRef.fieldPath`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [fieldRef](#specpodspecinitcontainersenvvaluefromfieldref) > fieldPath

Path of the field to select in the specified API version.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].env[].valueFrom.resourceFieldRef`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > resourceFieldRef

ResourceFieldSelector represents container resources (cpu, memory) and their output format

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.resourceFieldRef.containerName`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [resourceFieldRef](#specpodspecinitcontainersenvvaluefromresourcefieldref) > containerName

Container name: required for volumes, optional for env vars

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.resourceFieldRef.divisor`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [resourceFieldRef](#specpodspecinitcontainersenvvaluefromresourcefieldref) > divisor

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.resourceFieldRef.resource`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [resourceFieldRef](#specpodspecinitcontainersenvvaluefromresourcefieldref) > resource

Required: resource to select

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].env[].valueFrom.secretKeyRef`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > secretKeyRef

SecretKeySelector selects a key of a Secret.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.secretKeyRef.key`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [secretKeyRef](#specpodspecinitcontainersenvvaluefromsecretkeyref) > key

The key of the secret to select from.  Must be a valid secret key.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].env[].valueFrom.secretKeyRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [secretKeyRef](#specpodspecinitcontainersenvvaluefromsecretkeyref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].env[].valueFrom.secretKeyRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [env](#specpodspecinitcontainersenv) > [valueFrom](#specpodspecinitcontainersenvvaluefrom) > [secretKeyRef](#specpodspecinitcontainersenvvaluefromsecretkeyref) > optional

Specify whether the Secret or its key must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].envFrom[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > envFrom

List of sources to populate environment variables in the container. The keys defined within a source must be a C_IDENTIFIER. All invalid keys will be reported as an event when the container is starting. When a key exists in multiple sources, the value associated with the last source will take precedence. Values defined by an Env with a duplicate key will take precedence. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].envFrom[].configMapRef`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [envFrom](#specpodspecinitcontainersenvfrom) > configMapRef

ConfigMapEnvSource selects a ConfigMap to populate the environment variables with.

The contents of the target ConfigMap's Data field will represent the key-value pairs as environment variables.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].envFrom[].configMapRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [envFrom](#specpodspecinitcontainersenvfrom) > [configMapRef](#specpodspecinitcontainersenvfromconfigmapref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].envFrom[].configMapRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [envFrom](#specpodspecinitcontainersenvfrom) > [configMapRef](#specpodspecinitcontainersenvfromconfigmapref) > optional

Specify whether the ConfigMap must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].envFrom[].prefix`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [envFrom](#specpodspecinitcontainersenvfrom) > prefix

An optional identifier to prepend to each key in the ConfigMap. Must be a C_IDENTIFIER.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].envFrom[].secretRef`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [envFrom](#specpodspecinitcontainersenvfrom) > secretRef

SecretEnvSource selects a Secret to populate the environment variables with.

The contents of the target Secret's Data field will represent the key-value pairs as environment variables.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].envFrom[].secretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [envFrom](#specpodspecinitcontainersenvfrom) > [secretRef](#specpodspecinitcontainersenvfromsecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].envFrom[].secretRef.optional`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [envFrom](#specpodspecinitcontainersenvfrom) > [secretRef](#specpodspecinitcontainersenvfromsecretref) > optional

Specify whether the Secret must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].image`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > image

Docker image name. More info: https://kubernetes.io/docs/concepts/containers/images This field is optional to allow higher level config management to default or override container images in workload controllers like Deployments and StatefulSets.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].imagePullPolicy`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > imagePullPolicy

Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is specified, or IfNotPresent otherwise. Cannot be updated. More info: https://kubernetes.io/docs/concepts/containers/images#updating-images

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > lifecycle

Lifecycle describes actions that the management system should take in response to container lifecycle events. For the PostStart and PreStop lifecycle handlers, management of the container blocks until the action is complete, unless the container process fails, in which case the handler is aborted.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > postStart

Handler defines a specific action that should be taken

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.exec`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > [exec](#specpodspecinitcontainerslifecyclepoststartexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > [httpGet](#specpodspecinitcontainerslifecyclepoststarthttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > [httpGet](#specpodspecinitcontainerslifecyclepoststarthttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > [httpGet](#specpodspecinitcontainerslifecyclepoststarthttpget) > [httpHeaders](#specpodspecinitcontainerslifecyclepoststarthttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > [httpGet](#specpodspecinitcontainerslifecyclepoststarthttpget) > [httpHeaders](#specpodspecinitcontainerslifecyclepoststarthttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > [httpGet](#specpodspecinitcontainerslifecyclepoststarthttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > [httpGet](#specpodspecinitcontainerslifecyclepoststarthttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].lifecycle.postStart.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > [httpGet](#specpodspecinitcontainerslifecyclepoststarthttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > [tcpSocket](#specpodspecinitcontainerslifecyclepoststarttcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.postStart.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [postStart](#specpodspecinitcontainerslifecyclepoststart) > [tcpSocket](#specpodspecinitcontainerslifecyclepoststarttcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].lifecycle.preStop`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > preStop

Handler defines a specific action that should be taken

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.exec`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > [exec](#specpodspecinitcontainerslifecycleprestopexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > [httpGet](#specpodspecinitcontainerslifecycleprestophttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > [httpGet](#specpodspecinitcontainerslifecycleprestophttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > [httpGet](#specpodspecinitcontainerslifecycleprestophttpget) > [httpHeaders](#specpodspecinitcontainerslifecycleprestophttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > [httpGet](#specpodspecinitcontainerslifecycleprestophttpget) > [httpHeaders](#specpodspecinitcontainerslifecycleprestophttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > [httpGet](#specpodspecinitcontainerslifecycleprestophttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > [httpGet](#specpodspecinitcontainerslifecycleprestophttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].lifecycle.preStop.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > [httpGet](#specpodspecinitcontainerslifecycleprestophttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > [tcpSocket](#specpodspecinitcontainerslifecycleprestoptcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].lifecycle.preStop.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [lifecycle](#specpodspecinitcontainerslifecycle) > [preStop](#specpodspecinitcontainerslifecycleprestop) > [tcpSocket](#specpodspecinitcontainerslifecycleprestoptcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].livenessProbe`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > livenessProbe

Probe describes a health check to be performed against a container to determine whether it is alive or ready to receive traffic.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].livenessProbe.exec`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].livenessProbe.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > [exec](#specpodspecinitcontainerslivenessprobeexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].livenessProbe.failureThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > failureThreshold

Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].livenessProbe.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].livenessProbe.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > [httpGet](#specpodspecinitcontainerslivenessprobehttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].livenessProbe.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > [httpGet](#specpodspecinitcontainerslivenessprobehttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].livenessProbe.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > [httpGet](#specpodspecinitcontainerslivenessprobehttpget) > [httpHeaders](#specpodspecinitcontainerslivenessprobehttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].livenessProbe.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > [httpGet](#specpodspecinitcontainerslivenessprobehttpget) > [httpHeaders](#specpodspecinitcontainerslivenessprobehttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].livenessProbe.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > [httpGet](#specpodspecinitcontainerslivenessprobehttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].livenessProbe.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > [httpGet](#specpodspecinitcontainerslivenessprobehttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].livenessProbe.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > [httpGet](#specpodspecinitcontainerslivenessprobehttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].livenessProbe.initialDelaySeconds`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > initialDelaySeconds

Number of seconds after the container has started before liveness probes are initiated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].livenessProbe.periodSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > periodSeconds

How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].livenessProbe.successThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > successThreshold

Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to 1. Must be 1 for liveness and startup. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].livenessProbe.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].livenessProbe.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > [tcpSocket](#specpodspecinitcontainerslivenessprobetcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].livenessProbe.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > [tcpSocket](#specpodspecinitcontainerslivenessprobetcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].livenessProbe.timeoutSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [livenessProbe](#specpodspecinitcontainerslivenessprobe) > timeoutSeconds

Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > name

Name of the container specified as a DNS_LABEL. Each container in a pod must have a unique name (DNS_LABEL). Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].ports[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > ports

List of ports to expose from the container. Exposing a port here gives the system additional information about the network connections a container uses, but is primarily informational. Not specifying a port here DOES NOT prevent that port from being exposed. Any port which is listening on the default "0.0.0.0" address inside a container will be accessible from the network. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].ports[].containerPort`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [ports](#specpodspecinitcontainersports) > containerPort

Number of port to expose on the pod's IP address. This must be a valid port number, 0 < x < 65536.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].ports[].hostIP`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [ports](#specpodspecinitcontainersports) > hostIP

What host IP to bind the external port to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].ports[].hostPort`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [ports](#specpodspecinitcontainersports) > hostPort

Number of port to expose on the host. If specified, this must be a valid port number, 0 < x < 65536. If HostNetwork is specified, this must match ContainerPort. Most containers do not need this.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].ports[].name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [ports](#specpodspecinitcontainersports) > name

If specified, this must be an IANA_SVC_NAME and unique within the pod. Each named port in a pod must have a unique name. Name for the port that can be referred to by services.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].ports[].protocol`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [ports](#specpodspecinitcontainersports) > protocol

Protocol for port. Must be UDP, TCP, or SCTP. Defaults to "TCP".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].readinessProbe`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > readinessProbe

Probe describes a health check to be performed against a container to determine whether it is alive or ready to receive traffic.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].readinessProbe.exec`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].readinessProbe.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > [exec](#specpodspecinitcontainersreadinessprobeexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].readinessProbe.failureThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > failureThreshold

Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].readinessProbe.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].readinessProbe.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > [httpGet](#specpodspecinitcontainersreadinessprobehttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].readinessProbe.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > [httpGet](#specpodspecinitcontainersreadinessprobehttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].readinessProbe.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > [httpGet](#specpodspecinitcontainersreadinessprobehttpget) > [httpHeaders](#specpodspecinitcontainersreadinessprobehttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].readinessProbe.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > [httpGet](#specpodspecinitcontainersreadinessprobehttpget) > [httpHeaders](#specpodspecinitcontainersreadinessprobehttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].readinessProbe.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > [httpGet](#specpodspecinitcontainersreadinessprobehttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].readinessProbe.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > [httpGet](#specpodspecinitcontainersreadinessprobehttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].readinessProbe.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > [httpGet](#specpodspecinitcontainersreadinessprobehttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].readinessProbe.initialDelaySeconds`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > initialDelaySeconds

Number of seconds after the container has started before liveness probes are initiated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].readinessProbe.periodSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > periodSeconds

How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].readinessProbe.successThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > successThreshold

Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to 1. Must be 1 for liveness and startup. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].readinessProbe.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].readinessProbe.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > [tcpSocket](#specpodspecinitcontainersreadinessprobetcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].readinessProbe.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > [tcpSocket](#specpodspecinitcontainersreadinessprobetcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].readinessProbe.timeoutSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [readinessProbe](#specpodspecinitcontainersreadinessprobe) > timeoutSeconds

Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].resources`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > resources

ResourceRequirements describes the compute resource requirements.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].resources.limits`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [resources](#specpodspecinitcontainersresources) > limits

Limits describes the maximum amount of compute resources allowed. More info: https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].resources.requests`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [resources](#specpodspecinitcontainersresources) > requests

Requests describes the minimum amount of compute resources required. If Requests is omitted for a container, it defaults to Limits if that is explicitly specified, otherwise to an implementation-defined value. More info: https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].securityContext`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > securityContext

SecurityContext holds security configuration that will be applied to a container. Some fields are present in both SecurityContext and PodSecurityContext.  When both are set, the values in SecurityContext take precedence.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].securityContext.allowPrivilegeEscalation`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > allowPrivilegeEscalation

AllowPrivilegeEscalation controls whether a process can gain more privileges than its parent process. This bool directly controls if the no_new_privs flag will be set on the container process. AllowPrivilegeEscalation is true always when the container is: 1) run as Privileged 2) has CAP_SYS_ADMIN

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].securityContext.capabilities`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > capabilities

Adds and removes POSIX capabilities from running containers.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].securityContext.capabilities.add[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > [capabilities](#specpodspecinitcontainerssecuritycontextcapabilities) > add

Added capabilities

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].securityContext.capabilities.drop[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > [capabilities](#specpodspecinitcontainerssecuritycontextcapabilities) > drop

Removed capabilities

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].securityContext.privileged`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > privileged

Run container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].securityContext.procMount`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > procMount

procMount denotes the type of proc mount to use for the containers. The default is DefaultProcMount which uses the container runtime defaults for readonly paths and masked paths. This requires the ProcMountType feature flag to be enabled.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].securityContext.readOnlyRootFilesystem`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > readOnlyRootFilesystem

Whether this container has a read-only root filesystem. Default is false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].securityContext.runAsGroup`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > runAsGroup

The GID to run the entrypoint of the container process. Uses runtime default if unset. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].securityContext.runAsNonRoot`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > runAsNonRoot

Indicates that the container must run as a non-root user. If true, the Kubelet will validate the image at runtime to ensure that it does not run as UID 0 (root) and fail to start the container if it does. If unset or false, no such validation will be performed. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].securityContext.runAsUser`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > runAsUser

The UID to run the entrypoint of the container process. Defaults to user specified in image metadata if unspecified. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].securityContext.seLinuxOptions`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > seLinuxOptions

SELinuxOptions are the labels to be applied to the container

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].securityContext.seLinuxOptions.level`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > [seLinuxOptions](#specpodspecinitcontainerssecuritycontextselinuxoptions) > level

Level is SELinux level label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].securityContext.seLinuxOptions.role`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > [seLinuxOptions](#specpodspecinitcontainerssecuritycontextselinuxoptions) > role

Role is a SELinux role label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].securityContext.seLinuxOptions.type`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > [seLinuxOptions](#specpodspecinitcontainerssecuritycontextselinuxoptions) > type

Type is a SELinux type label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].securityContext.seLinuxOptions.user`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > [seLinuxOptions](#specpodspecinitcontainerssecuritycontextselinuxoptions) > user

User is a SELinux user label that applies to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].securityContext.windowsOptions`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > windowsOptions

WindowsSecurityContextOptions contain Windows-specific options and credentials.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].securityContext.windowsOptions.gmsaCredentialSpec`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > [windowsOptions](#specpodspecinitcontainerssecuritycontextwindowsoptions) > gmsaCredentialSpec

GMSACredentialSpec is where the GMSA admission webhook (https://github.com/kubernetes-sigs/windows-gmsa) inlines the contents of the GMSA credential spec named by the GMSACredentialSpecName field.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].securityContext.windowsOptions.gmsaCredentialSpecName`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > [windowsOptions](#specpodspecinitcontainerssecuritycontextwindowsoptions) > gmsaCredentialSpecName

GMSACredentialSpecName is the name of the GMSA credential spec to use.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].securityContext.windowsOptions.runAsUserName`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [securityContext](#specpodspecinitcontainerssecuritycontext) > [windowsOptions](#specpodspecinitcontainerssecuritycontextwindowsoptions) > runAsUserName

The UserName in Windows to run the entrypoint of the container process. Defaults to the user specified in image metadata if unspecified. May also be set in PodSecurityContext. If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].startupProbe`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > startupProbe

Probe describes a health check to be performed against a container to determine whether it is alive or ready to receive traffic.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].startupProbe.exec`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > exec

ExecAction describes a "run in container" action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].startupProbe.exec.command[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > [exec](#specpodspecinitcontainersstartupprobeexec) > command

Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].startupProbe.failureThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > failureThreshold

Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].startupProbe.httpGet`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > httpGet

HTTPGetAction describes an action based on HTTP Get requests.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].startupProbe.httpGet.host`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > [httpGet](#specpodspecinitcontainersstartupprobehttpget) > host

Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].startupProbe.httpGet.httpHeaders[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > [httpGet](#specpodspecinitcontainersstartupprobehttpget) > httpHeaders

Custom headers to set in the request. HTTP allows repeated headers.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].startupProbe.httpGet.httpHeaders[].name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > [httpGet](#specpodspecinitcontainersstartupprobehttpget) > [httpHeaders](#specpodspecinitcontainersstartupprobehttpgethttpheaders) > name

The header field name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].startupProbe.httpGet.httpHeaders[].value`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > [httpGet](#specpodspecinitcontainersstartupprobehttpget) > [httpHeaders](#specpodspecinitcontainersstartupprobehttpgethttpheaders) > value

The header field value

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].startupProbe.httpGet.path`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > [httpGet](#specpodspecinitcontainersstartupprobehttpget) > path

Path to access on the HTTP server.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].startupProbe.httpGet.port`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > [httpGet](#specpodspecinitcontainersstartupprobehttpget) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].startupProbe.httpGet.scheme`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > [httpGet](#specpodspecinitcontainersstartupprobehttpget) > scheme

Scheme to use for connecting to the host. Defaults to HTTP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].startupProbe.initialDelaySeconds`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > initialDelaySeconds

Number of seconds after the container has started before liveness probes are initiated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].startupProbe.periodSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > periodSeconds

How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].startupProbe.successThreshold`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > successThreshold

Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to 1. Must be 1 for liveness and startup. Minimum value is 1.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].startupProbe.tcpSocket`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > tcpSocket

TCPSocketAction describes an action based on opening a socket

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.initContainers[].startupProbe.tcpSocket.host`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > [tcpSocket](#specpodspecinitcontainersstartupprobetcpsocket) > host

Optional: Host name to connect to, defaults to the pod IP.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].startupProbe.tcpSocket.port`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > [tcpSocket](#specpodspecinitcontainersstartupprobetcpsocket) > port

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.initContainers[].startupProbe.timeoutSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [startupProbe](#specpodspecinitcontainersstartupprobe) > timeoutSeconds

Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.initContainers[].stdin`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > stdin

Whether this container should allocate a buffer for stdin in the container runtime. If this is not set, reads from stdin in the container will always result in EOF. Default is false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].stdinOnce`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > stdinOnce

Whether the container runtime should close the stdin channel after it has been opened by a single attach. When stdin is true the stdin stream will remain open across multiple attach sessions. If stdinOnce is set to true, stdin is opened on container start, is empty until the first client attaches to stdin, and then remains open and accepts data until the client disconnects, at which time stdin is closed and remains closed until the container is restarted. If this flag is false, a container processes that reads from stdin will never receive an EOF. Default is false

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].terminationMessagePath`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > terminationMessagePath

Optional: Path at which the file to which the container's termination message will be written is mounted into the container's filesystem. Message written is intended to be brief final status, such as an assertion failure message. Will be truncated by the node if greater than 4096 bytes. The total message length across all containers will be limited to 12kb. Defaults to /dev/termination-log. Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].terminationMessagePolicy`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > terminationMessagePolicy

Indicate how the termination message should be populated. File will use the contents of terminationMessagePath to populate the container status message on both success and failure. FallbackToLogsOnError will use the last chunk of container log output if the termination message file is empty and the container exited with an error. The log output is limited to 2048 bytes or 80 lines, whichever is smaller. Defaults to File. Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].tty`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > tty

Whether this container should allocate a TTY for itself, also requires 'stdin' to be true. Default is false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].volumeDevices[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > volumeDevices

volumeDevices is the list of block devices to be used by the container.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].volumeDevices[].devicePath`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [volumeDevices](#specpodspecinitcontainersvolumedevices) > devicePath

devicePath is the path inside of the container that the device will be mapped to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].volumeDevices[].name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [volumeDevices](#specpodspecinitcontainersvolumedevices) > name

name must match the name of a persistentVolumeClaim in the pod

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].volumeMounts[]`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > volumeMounts

Pod volumes to mount into the container's filesystem. Cannot be updated.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.initContainers[].volumeMounts[].mountPath`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [volumeMounts](#specpodspecinitcontainersvolumemounts) > mountPath

Path within the container at which the volume should be mounted.  Must not contain ':'.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].volumeMounts[].mountPropagation`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [volumeMounts](#specpodspecinitcontainersvolumemounts) > mountPropagation

mountPropagation determines how mounts are propagated from the host to container and the other way around. When not set, MountPropagationNone is used. This field is beta in 1.10.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].volumeMounts[].name`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [volumeMounts](#specpodspecinitcontainersvolumemounts) > name

This must match the Name of a Volume.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].volumeMounts[].readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [volumeMounts](#specpodspecinitcontainersvolumemounts) > readOnly

Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.initContainers[].volumeMounts[].subPath`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [volumeMounts](#specpodspecinitcontainersvolumemounts) > subPath

Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's root).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].volumeMounts[].subPathExpr`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > [volumeMounts](#specpodspecinitcontainersvolumemounts) > subPathExpr

Expanded path within the volume from which the container's volume should be mounted. Behaves similarly to SubPath but environment variable references $(VAR_NAME) are expanded using the container's environment. Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.initContainers[].workingDir`

[spec](#spec) > [podSpec](#specpodspec) > [initContainers](#specpodspecinitcontainers) > workingDir

Container's working directory. If not specified, the container runtime's default will be used, which might be configured in the container image. Cannot be updated.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

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

### `spec.podSpec.readinessGates[].conditionType`

[spec](#spec) > [podSpec](#specpodspec) > [readinessGates](#specpodspecreadinessgates) > conditionType

ConditionType refers to a condition in the pod's condition list with matching type.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

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

### `spec.podSpec.securityContext.sysctls[].name`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > [sysctls](#specpodspecsecuritycontextsysctls) > name

Name of a property to set

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.securityContext.sysctls[].value`

[spec](#spec) > [podSpec](#specpodspec) > [securityContext](#specpodspecsecuritycontext) > [sysctls](#specpodspecsecuritycontextsysctls) > value

Value of a property to set

| Type     | Required |
| -------- | -------- |
| `string` | No       |

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

### `spec.podSpec.tolerations[].effect`

[spec](#spec) > [podSpec](#specpodspec) > [tolerations](#specpodspectolerations) > effect

Effect indicates the taint effect to match. Empty means match all taint effects. When specified, allowed values are NoSchedule, PreferNoSchedule and NoExecute.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.tolerations[].key`

[spec](#spec) > [podSpec](#specpodspec) > [tolerations](#specpodspectolerations) > key

Key is the taint key that the toleration applies to. Empty means match all taint keys. If the key is empty, operator must be Exists; this combination means to match all values and all keys.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.tolerations[].operator`

[spec](#spec) > [podSpec](#specpodspec) > [tolerations](#specpodspectolerations) > operator

Operator represents a key's relationship to the value. Valid operators are Exists and Equal. Defaults to Equal. Exists is equivalent to wildcard for value, so that a pod can tolerate all taints of a particular category.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.tolerations[].tolerationSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [tolerations](#specpodspectolerations) > tolerationSeconds

TolerationSeconds represents the period of time the toleration (which must be of effect NoExecute, otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately) by the system.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.tolerations[].value`

[spec](#spec) > [podSpec](#specpodspec) > [tolerations](#specpodspectolerations) > value

Value is the taint value the toleration matches to. If the operator is Exists, the value should be empty, otherwise just a regular string.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.topologySpreadConstraints[]`

[spec](#spec) > [podSpec](#specpodspec) > topologySpreadConstraints

TopologySpreadConstraints describes how a group of pods ought to spread across topology domains. Scheduler will schedule pods in a way which abides by the constraints. This field is only honored by clusters that enable the EvenPodsSpread feature. All topologySpreadConstraints are ANDed.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.topologySpreadConstraints[].labelSelector`

[spec](#spec) > [podSpec](#specpodspec) > [topologySpreadConstraints](#specpodspectopologyspreadconstraints) > labelSelector

A label selector is a label query over a set of resources. The result of matchLabels and matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches no objects.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.topologySpreadConstraints[].labelSelector.matchExpressions[]`

[spec](#spec) > [podSpec](#specpodspec) > [topologySpreadConstraints](#specpodspectopologyspreadconstraints) > [labelSelector](#specpodspectopologyspreadconstraintslabelselector) > matchExpressions

matchExpressions is a list of label selector requirements. The requirements are ANDed.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.topologySpreadConstraints[].labelSelector.matchExpressions[].key`

[spec](#spec) > [podSpec](#specpodspec) > [topologySpreadConstraints](#specpodspectopologyspreadconstraints) > [labelSelector](#specpodspectopologyspreadconstraintslabelselector) > [matchExpressions](#specpodspectopologyspreadconstraintslabelselectormatchexpressions) > key

key is the label key that the selector applies to.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.topologySpreadConstraints[].labelSelector.matchExpressions[].operator`

[spec](#spec) > [podSpec](#specpodspec) > [topologySpreadConstraints](#specpodspectopologyspreadconstraints) > [labelSelector](#specpodspectopologyspreadconstraintslabelselector) > [matchExpressions](#specpodspectopologyspreadconstraintslabelselectormatchexpressions) > operator

operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists and DoesNotExist.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.topologySpreadConstraints[].labelSelector.matchExpressions[].values[]`

[spec](#spec) > [podSpec](#specpodspec) > [topologySpreadConstraints](#specpodspectopologyspreadconstraints) > [labelSelector](#specpodspectopologyspreadconstraintslabelselector) > [matchExpressions](#specpodspectopologyspreadconstraintslabelselectormatchexpressions) > values

values is an array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array is replaced during a strategic merge patch.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.topologySpreadConstraints[].labelSelector.matchLabels`

[spec](#spec) > [podSpec](#specpodspec) > [topologySpreadConstraints](#specpodspectopologyspreadconstraints) > [labelSelector](#specpodspectopologyspreadconstraintslabelselector) > matchLabels

matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains only "value". The requirements are ANDed.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.topologySpreadConstraints[].maxSkew`

[spec](#spec) > [podSpec](#specpodspec) > [topologySpreadConstraints](#specpodspectopologyspreadconstraints) > maxSkew

MaxSkew describes the degree to which pods may be unevenly distributed. It's the maximum permitted difference between the number of matching pods in any two topology domains of a given topology type. For example, in a 3-zone cluster, MaxSkew is set to 1, and pods with the same labelSelector spread as 1/1/0: | zone1 | zone2 | zone3 | |   P   |   P   |       | - if MaxSkew is 1, incoming pod can only be scheduled to zone3 to become 1/1/1; scheduling it onto zone1(zone2) would make the ActualSkew(2-0) on zone1(zone2) violate MaxSkew(1). - if MaxSkew is 2, incoming pod can be scheduled onto any zone. It's a required field. Default value is 1 and 0 is not allowed.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.topologySpreadConstraints[].topologyKey`

[spec](#spec) > [podSpec](#specpodspec) > [topologySpreadConstraints](#specpodspectopologyspreadconstraints) > topologyKey

TopologyKey is the key of node labels. Nodes that have a label with this key and identical values are considered to be in the same topology. We consider each <key, value> as a "bucket", and try to put balanced number of pods into each bucket. It's a required field.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.topologySpreadConstraints[].whenUnsatisfiable`

[spec](#spec) > [podSpec](#specpodspec) > [topologySpreadConstraints](#specpodspectopologyspreadconstraints) > whenUnsatisfiable

WhenUnsatisfiable indicates how to deal with a pod if it doesn't satisfy the spread constraint. - DoNotSchedule (default) tells the scheduler not to schedule it - ScheduleAnyway tells the scheduler to still schedule it It's considered as "Unsatisfiable" if and only if placing incoming pod on any topology violates "MaxSkew". For example, in a 3-zone cluster, MaxSkew is set to 1, and pods with the same labelSelector spread as 3/1/1: | zone1 | zone2 | zone3 | | P P P |   P   |   P   | If WhenUnsatisfiable is set to DoNotSchedule, incoming pod can only be scheduled to zone2(zone3) to become 3/2/1(3/1/2) as ActualSkew(2-1) on zone2(zone3) satisfies MaxSkew(1). In other words, the cluster can still be imbalanced, but scheduler won't make it *more* imbalanced. It's a required field.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[]`

[spec](#spec) > [podSpec](#specpodspec) > volumes

List of volumes that can be mounted by containers belonging to the pod. More info: https://kubernetes.io/docs/concepts/storage/volumes

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[].awsElasticBlockStore`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > awsElasticBlockStore

Represents a Persistent Disk resource in AWS.

An AWS EBS disk must exist before mounting to a container. The disk must also be in the same AWS zone as the kubelet. An AWS EBS disk can only be mounted as read/write once. AWS EBS volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].awsElasticBlockStore.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [awsElasticBlockStore](#specpodspecvolumesawselasticblockstore) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].awsElasticBlockStore.partition`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [awsElasticBlockStore](#specpodspecvolumesawselasticblockstore) > partition

The partition in the volume that you want to mount. If omitted, the default is to mount by volume name. Examples: For volume /dev/sda1, you specify the partition as "1". Similarly, the volume partition for /dev/sda is "0" (or you can leave the property empty).

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].awsElasticBlockStore.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [awsElasticBlockStore](#specpodspecvolumesawselasticblockstore) > readOnly

Specify "true" to force and set the ReadOnly property in VolumeMounts to "true". If omitted, the default is "false". More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].awsElasticBlockStore.volumeID`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [awsElasticBlockStore](#specpodspecvolumesawselasticblockstore) > volumeID

Unique ID of the persistent disk resource in AWS (Amazon EBS volume). More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].azureDisk`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > azureDisk

AzureDisk represents an Azure Data Disk mount on the host and bind mount to the pod.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].azureDisk.cachingMode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [azureDisk](#specpodspecvolumesazuredisk) > cachingMode

Host Caching mode: None, Read Only, Read Write.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].azureDisk.diskName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [azureDisk](#specpodspecvolumesazuredisk) > diskName

The Name of the data disk in the blob storage

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].azureDisk.diskURI`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [azureDisk](#specpodspecvolumesazuredisk) > diskURI

The URI the data disk in the blob storage

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].azureDisk.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [azureDisk](#specpodspecvolumesazuredisk) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].azureDisk.kind`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [azureDisk](#specpodspecvolumesazuredisk) > kind

Expected values Shared: multiple blob disks per storage account  Dedicated: single blob disk per storage account  Managed: azure managed data disk (only in managed availability set). defaults to shared

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].azureDisk.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [azureDisk](#specpodspecvolumesazuredisk) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].azureFile`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > azureFile

AzureFile represents an Azure File Service mount on the host and bind mount to the pod.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].azureFile.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [azureFile](#specpodspecvolumesazurefile) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].azureFile.secretName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [azureFile](#specpodspecvolumesazurefile) > secretName

the name of secret that contains Azure Storage Account Name and Key

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].azureFile.shareName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [azureFile](#specpodspecvolumesazurefile) > shareName

Share Name

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].cephfs`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > cephfs

Represents a Ceph Filesystem mount that lasts the lifetime of a pod Cephfs volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].cephfs.monitors[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cephfs](#specpodspecvolumescephfs) > monitors

Required: Monitors is a collection of Ceph monitors More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type    | Required |
| ------- | -------- |
| `array` | Yes      |

### `spec.podSpec.volumes[].cephfs.path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cephfs](#specpodspecvolumescephfs) > path

Optional: Used as the mounted root, rather than the full Ceph tree, default is /

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].cephfs.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cephfs](#specpodspecvolumescephfs) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].cephfs.secretFile`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cephfs](#specpodspecvolumescephfs) > secretFile

Optional: SecretFile is the path to key ring for User, default is /etc/ceph/user.secret More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].cephfs.secretRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cephfs](#specpodspecvolumescephfs) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].cephfs.secretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cephfs](#specpodspecvolumescephfs) > [secretRef](#specpodspecvolumescephfssecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].cephfs.user`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cephfs](#specpodspecvolumescephfs) > user

Optional: User is the rados user name, default is admin More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].cinder`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > cinder

Represents a cinder volume resource in Openstack. A Cinder volume must exist before mounting to a container. The volume must also be in the same region as the kubelet. Cinder volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].cinder.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cinder](#specpodspecvolumescinder) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://examples.k8s.io/mysql-cinder-pd/README.md

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].cinder.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cinder](#specpodspecvolumescinder) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. More info: https://examples.k8s.io/mysql-cinder-pd/README.md

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].cinder.secretRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cinder](#specpodspecvolumescinder) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].cinder.secretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cinder](#specpodspecvolumescinder) > [secretRef](#specpodspecvolumescindersecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].cinder.volumeID`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [cinder](#specpodspecvolumescinder) > volumeID

volume id used to identify the volume in cinder. More info: https://examples.k8s.io/mysql-cinder-pd/README.md

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].configMap`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > configMap

Adapts a ConfigMap into a volume.

The contents of the target ConfigMap's Data field will be presented in a volume as files using the keys in the Data field as the file names, unless the items element is populated with specific mappings of keys to paths. ConfigMap volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].configMap.defaultMode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [configMap](#specpodspecvolumesconfigmap) > defaultMode

Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].configMap.items[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [configMap](#specpodspecvolumesconfigmap) > items

If unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the ConfigMap, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[].configMap.items[].key`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [configMap](#specpodspecvolumesconfigmap) > [items](#specpodspecvolumesconfigmapitems) > key

The key to project.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].configMap.items[].mode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [configMap](#specpodspecvolumesconfigmap) > [items](#specpodspecvolumesconfigmapitems) > mode

Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified, the volume defaultMode will be used. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].configMap.items[].path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [configMap](#specpodspecvolumesconfigmap) > [items](#specpodspecvolumesconfigmapitems) > path

The relative path of the file to map the key to. May not be an absolute path. May not contain the path element '..'. May not start with the string '..'.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].configMap.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [configMap](#specpodspecvolumesconfigmap) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].configMap.optional`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [configMap](#specpodspecvolumesconfigmap) > optional

Specify whether the ConfigMap or its keys must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].csi`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > csi

Represents a source location of a volume to mount, managed by an external CSI driver

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].csi.driver`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [csi](#specpodspecvolumescsi) > driver

Driver is the name of the CSI driver that handles this volume. Consult with your admin for the correct name as registered in the cluster.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].csi.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [csi](#specpodspecvolumescsi) > fsType

Filesystem type to mount. Ex. "ext4", "xfs", "ntfs". If not provided, the empty value is passed to the associated CSI driver which will determine the default filesystem to apply.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].csi.nodePublishSecretRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [csi](#specpodspecvolumescsi) > nodePublishSecretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].csi.nodePublishSecretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [csi](#specpodspecvolumescsi) > [nodePublishSecretRef](#specpodspecvolumescsinodepublishsecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].csi.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [csi](#specpodspecvolumescsi) > readOnly

Specifies a read-only configuration for the volume. Defaults to false (read/write).

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].csi.volumeAttributes`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [csi](#specpodspecvolumescsi) > volumeAttributes

VolumeAttributes stores driver-specific properties that are passed to the CSI driver. Consult your driver's documentation for supported values.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].downwardAPI`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > downwardAPI

DownwardAPIVolumeSource represents a volume containing downward API info. Downward API volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].downwardAPI.defaultMode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > defaultMode

Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].downwardAPI.items[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > items

Items is a list of downward API volume file

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[].downwardAPI.items[].fieldRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > [items](#specpodspecvolumesdownwardapiitems) > fieldRef

ObjectFieldSelector selects an APIVersioned field of an object.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].downwardAPI.items[].fieldRef.apiVersion`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > [items](#specpodspecvolumesdownwardapiitems) > [fieldRef](#specpodspecvolumesdownwardapiitemsfieldref) > apiVersion

Version of the schema the FieldPath is written in terms of, defaults to "v1".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].downwardAPI.items[].fieldRef.fieldPath`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > [items](#specpodspecvolumesdownwardapiitems) > [fieldRef](#specpodspecvolumesdownwardapiitemsfieldref) > fieldPath

Path of the field to select in the specified API version.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].downwardAPI.items[].mode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > [items](#specpodspecvolumesdownwardapiitems) > mode

Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified, the volume defaultMode will be used. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].downwardAPI.items[].path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > [items](#specpodspecvolumesdownwardapiitems) > path

Required: Path is  the relative path name of the file to be created. Must not be absolute or contain the '..' path. Must be utf-8 encoded. The first item of the relative path must not start with '..'

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].downwardAPI.items[].resourceFieldRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > [items](#specpodspecvolumesdownwardapiitems) > resourceFieldRef

ResourceFieldSelector represents container resources (cpu, memory) and their output format

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].downwardAPI.items[].resourceFieldRef.containerName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > [items](#specpodspecvolumesdownwardapiitems) > [resourceFieldRef](#specpodspecvolumesdownwardapiitemsresourcefieldref) > containerName

Container name: required for volumes, optional for env vars

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].downwardAPI.items[].resourceFieldRef.divisor`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > [items](#specpodspecvolumesdownwardapiitems) > [resourceFieldRef](#specpodspecvolumesdownwardapiitemsresourcefieldref) > divisor

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].downwardAPI.items[].resourceFieldRef.resource`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [downwardAPI](#specpodspecvolumesdownwardapi) > [items](#specpodspecvolumesdownwardapiitems) > [resourceFieldRef](#specpodspecvolumesdownwardapiitemsresourcefieldref) > resource

Required: resource to select

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].emptyDir`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > emptyDir

Represents an empty directory for a pod. Empty directory volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].emptyDir.medium`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [emptyDir](#specpodspecvolumesemptydir) > medium

What type of storage medium should back this directory. The default is "" which means to use the node's default medium. Must be an empty string (default) or Memory. More info: https://kubernetes.io/docs/concepts/storage/volumes#emptydir

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].emptyDir.sizeLimit`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [emptyDir](#specpodspecvolumesemptydir) > sizeLimit

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].fc`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > fc

Represents a Fibre Channel volume. Fibre Channel volumes can only be mounted as read/write once. Fibre Channel volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].fc.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [fc](#specpodspecvolumesfc) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].fc.lun`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [fc](#specpodspecvolumesfc) > lun

Optional: FC target lun number

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].fc.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [fc](#specpodspecvolumesfc) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].fc.targetWWNs[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [fc](#specpodspecvolumesfc) > targetWWNs

Optional: FC target worldwide names (WWNs)

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[].fc.wwids[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [fc](#specpodspecvolumesfc) > wwids

Optional: FC volume world wide identifiers (wwids) Either wwids or combination of targetWWNs and lun must be set, but not both simultaneously.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[].flexVolume`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > flexVolume

FlexVolume represents a generic volume resource that is provisioned/attached using an exec based plugin.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].flexVolume.driver`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [flexVolume](#specpodspecvolumesflexvolume) > driver

Driver is the name of the driver to use for this volume.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].flexVolume.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [flexVolume](#specpodspecvolumesflexvolume) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". The default filesystem depends on FlexVolume script.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].flexVolume.options`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [flexVolume](#specpodspecvolumesflexvolume) > options

Optional: Extra command options if any.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].flexVolume.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [flexVolume](#specpodspecvolumesflexvolume) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].flexVolume.secretRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [flexVolume](#specpodspecvolumesflexvolume) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].flexVolume.secretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [flexVolume](#specpodspecvolumesflexvolume) > [secretRef](#specpodspecvolumesflexvolumesecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].flocker`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > flocker

Represents a Flocker volume mounted by the Flocker agent. One and only one of datasetName and datasetUUID should be set. Flocker volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].flocker.datasetName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [flocker](#specpodspecvolumesflocker) > datasetName

Name of the dataset stored as metadata -> name on the dataset for Flocker should be considered as deprecated

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].flocker.datasetUUID`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [flocker](#specpodspecvolumesflocker) > datasetUUID

UUID of the dataset. This is unique identifier of a Flocker dataset

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].gcePersistentDisk`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > gcePersistentDisk

Represents a Persistent Disk resource in Google Compute Engine.

A GCE PD must exist before mounting to a container. The disk must also be in the same GCE project and zone as the kubelet. A GCE PD can only be mounted as read/write once or read-only many times. GCE PDs support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].gcePersistentDisk.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [gcePersistentDisk](#specpodspecvolumesgcepersistentdisk) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].gcePersistentDisk.partition`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [gcePersistentDisk](#specpodspecvolumesgcepersistentdisk) > partition

The partition in the volume that you want to mount. If omitted, the default is to mount by volume name. Examples: For volume /dev/sda1, you specify the partition as "1". Similarly, the volume partition for /dev/sda is "0" (or you can leave the property empty). More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].gcePersistentDisk.pdName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [gcePersistentDisk](#specpodspecvolumesgcepersistentdisk) > pdName

Unique name of the PD resource in GCE. Used to identify the disk in GCE. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].gcePersistentDisk.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [gcePersistentDisk](#specpodspecvolumesgcepersistentdisk) > readOnly

ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].gitRepo`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > gitRepo

Represents a volume that is populated with the contents of a git repository. Git repo volumes do not support ownership management. Git repo volumes support SELinux relabeling.

DEPRECATED: GitRepo is deprecated. To provision a container with a git repo, mount an EmptyDir into an InitContainer that clones the repo using git, then mount the EmptyDir into the Pod's container.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].gitRepo.directory`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [gitRepo](#specpodspecvolumesgitrepo) > directory

Target directory name. Must not contain or start with '..'.  If '.' is supplied, the volume directory will be the git repository.  Otherwise, if specified, the volume will contain the git repository in the subdirectory with the given name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].gitRepo.repository`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [gitRepo](#specpodspecvolumesgitrepo) > repository

Repository URL

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].gitRepo.revision`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [gitRepo](#specpodspecvolumesgitrepo) > revision

Commit hash for the specified revision.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].glusterfs`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > glusterfs

Represents a Glusterfs mount that lasts the lifetime of a pod. Glusterfs volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].glusterfs.endpoints`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [glusterfs](#specpodspecvolumesglusterfs) > endpoints

EndpointsName is the endpoint name that details Glusterfs topology. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].glusterfs.path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [glusterfs](#specpodspecvolumesglusterfs) > path

Path is the Glusterfs volume path. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].glusterfs.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [glusterfs](#specpodspecvolumesglusterfs) > readOnly

ReadOnly here will force the Glusterfs volume to be mounted with read-only permissions. Defaults to false. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].hostPath`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > hostPath

Represents a host path mapped into a pod. Host path volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].hostPath.path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [hostPath](#specpodspecvolumeshostpath) > path

Path of the directory on the host. If the path is a symlink, it will follow the link to the real path. More info: https://kubernetes.io/docs/concepts/storage/volumes#hostpath

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].hostPath.type`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [hostPath](#specpodspecvolumeshostpath) > type

Type for HostPath Volume Defaults to "" More info: https://kubernetes.io/docs/concepts/storage/volumes#hostpath

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].iscsi`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > iscsi

Represents an ISCSI disk. ISCSI volumes can only be mounted as read/write once. ISCSI volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].iscsi.chapAuthDiscovery`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > chapAuthDiscovery

whether support iSCSI Discovery CHAP authentication

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].iscsi.chapAuthSession`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > chapAuthSession

whether support iSCSI Session CHAP authentication

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].iscsi.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#iscsi

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].iscsi.initiatorName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > initiatorName

Custom iSCSI Initiator Name. If initiatorName is specified with iscsiInterface simultaneously, new iSCSI interface <target portal>:<volume name> will be created for the connection.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].iscsi.iqn`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > iqn

Target iSCSI Qualified Name.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].iscsi.iscsiInterface`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > iscsiInterface

iSCSI Interface Name that uses an iSCSI transport. Defaults to 'default' (tcp).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].iscsi.lun`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > lun

iSCSI Target Lun number.

| Type      | Required |
| --------- | -------- |
| `integer` | Yes      |

### `spec.podSpec.volumes[].iscsi.portals[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > portals

iSCSI Target Portal List. The portal is either an IP or ip_addr:port if the port is other than default (typically TCP ports 860 and 3260).

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[].iscsi.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > readOnly

ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].iscsi.secretRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].iscsi.secretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > [secretRef](#specpodspecvolumesiscsisecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].iscsi.targetPortal`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [iscsi](#specpodspecvolumesiscsi) > targetPortal

iSCSI Target Portal. The Portal is either an IP or ip_addr:port if the port is other than default (typically TCP ports 860 and 3260).

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > name

Volume's name. Must be a DNS_LABEL and unique within the pod. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].nfs`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > nfs

Represents an NFS mount that lasts the lifetime of a pod. NFS volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].nfs.path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [nfs](#specpodspecvolumesnfs) > path

Path that is exported by the NFS server. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].nfs.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [nfs](#specpodspecvolumesnfs) > readOnly

ReadOnly here will force the NFS export to be mounted with read-only permissions. Defaults to false. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].nfs.server`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [nfs](#specpodspecvolumesnfs) > server

Server is the hostname or IP address of the NFS server. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].persistentVolumeClaim`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > persistentVolumeClaim

PersistentVolumeClaimVolumeSource references the user's PVC in the same namespace. This volume finds the bound PV and mounts that volume for the pod. A PersistentVolumeClaimVolumeSource is, essentially, a wrapper around another type of volume that is owned by someone else (the system).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].persistentVolumeClaim.claimName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [persistentVolumeClaim](#specpodspecvolumespersistentvolumeclaim) > claimName

ClaimName is the name of a PersistentVolumeClaim in the same namespace as the pod using this volume. More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#persistentvolumeclaims

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].persistentVolumeClaim.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [persistentVolumeClaim](#specpodspecvolumespersistentvolumeclaim) > readOnly

Will force the ReadOnly setting in VolumeMounts. Default false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].photonPersistentDisk`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > photonPersistentDisk

Represents a Photon Controller persistent disk resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].photonPersistentDisk.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [photonPersistentDisk](#specpodspecvolumesphotonpersistentdisk) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].photonPersistentDisk.pdID`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [photonPersistentDisk](#specpodspecvolumesphotonpersistentdisk) > pdID

ID that identifies Photon Controller persistent disk

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].portworxVolume`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > portworxVolume

PortworxVolumeSource represents a Portworx volume resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].portworxVolume.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [portworxVolume](#specpodspecvolumesportworxvolume) > fsType

FSType represents the filesystem type to mount Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].portworxVolume.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [portworxVolume](#specpodspecvolumesportworxvolume) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].portworxVolume.volumeID`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [portworxVolume](#specpodspecvolumesportworxvolume) > volumeID

VolumeID uniquely identifies a Portworx volume

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].projected`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > projected

Represents a projected volume source

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].projected.defaultMode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > defaultMode

Mode bits to use on created files by default. Must be a value between 0 and 0777. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].projected.sources[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > sources

list of volume projections

| Type    | Required |
| ------- | -------- |
| `array` | Yes      |

### `spec.podSpec.volumes[].projected.sources[].configMap`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > configMap

Adapts a ConfigMap into a projected volume.

The contents of the target ConfigMap's Data field will be presented in a projected volume as files using the keys in the Data field as the file names, unless the items element is populated with specific mappings of keys to paths. Note that this is identical to a configmap volume source without the default mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].projected.sources[].configMap.items[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [configMap](#specpodspecvolumesprojectedsourcesconfigmap) > items

If unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the ConfigMap, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[].projected.sources[].configMap.items[].key`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [configMap](#specpodspecvolumesprojectedsourcesconfigmap) > [items](#specpodspecvolumesprojectedsourcesconfigmapitems) > key

The key to project.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].configMap.items[].mode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [configMap](#specpodspecvolumesprojectedsourcesconfigmap) > [items](#specpodspecvolumesprojectedsourcesconfigmapitems) > mode

Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified, the volume defaultMode will be used. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].projected.sources[].configMap.items[].path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [configMap](#specpodspecvolumesprojectedsourcesconfigmap) > [items](#specpodspecvolumesprojectedsourcesconfigmapitems) > path

The relative path of the file to map the key to. May not be an absolute path. May not contain the path element '..'. May not start with the string '..'.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].configMap.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [configMap](#specpodspecvolumesprojectedsourcesconfigmap) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].configMap.optional`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [configMap](#specpodspecvolumesprojectedsourcesconfigmap) > optional

Specify whether the ConfigMap or its keys must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > downwardAPI

Represents downward API info for projecting into a projected volume. Note that this is identical to a downwardAPI volume source without the default mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI.items[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [downwardAPI](#specpodspecvolumesprojectedsourcesdownwardapi) > items

Items is a list of DownwardAPIVolume file

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI.items[].fieldRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [downwardAPI](#specpodspecvolumesprojectedsourcesdownwardapi) > [items](#specpodspecvolumesprojectedsourcesdownwardapiitems) > fieldRef

ObjectFieldSelector selects an APIVersioned field of an object.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI.items[].fieldRef.apiVersion`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [downwardAPI](#specpodspecvolumesprojectedsourcesdownwardapi) > [items](#specpodspecvolumesprojectedsourcesdownwardapiitems) > [fieldRef](#specpodspecvolumesprojectedsourcesdownwardapiitemsfieldref) > apiVersion

Version of the schema the FieldPath is written in terms of, defaults to "v1".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI.items[].fieldRef.fieldPath`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [downwardAPI](#specpodspecvolumesprojectedsourcesdownwardapi) > [items](#specpodspecvolumesprojectedsourcesdownwardapiitems) > [fieldRef](#specpodspecvolumesprojectedsourcesdownwardapiitemsfieldref) > fieldPath

Path of the field to select in the specified API version.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI.items[].mode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [downwardAPI](#specpodspecvolumesprojectedsourcesdownwardapi) > [items](#specpodspecvolumesprojectedsourcesdownwardapiitems) > mode

Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified, the volume defaultMode will be used. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI.items[].path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [downwardAPI](#specpodspecvolumesprojectedsourcesdownwardapi) > [items](#specpodspecvolumesprojectedsourcesdownwardapiitems) > path

Required: Path is  the relative path name of the file to be created. Must not be absolute or contain the '..' path. Must be utf-8 encoded. The first item of the relative path must not start with '..'

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI.items[].resourceFieldRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [downwardAPI](#specpodspecvolumesprojectedsourcesdownwardapi) > [items](#specpodspecvolumesprojectedsourcesdownwardapiitems) > resourceFieldRef

ResourceFieldSelector represents container resources (cpu, memory) and their output format

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI.items[].resourceFieldRef.containerName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [downwardAPI](#specpodspecvolumesprojectedsourcesdownwardapi) > [items](#specpodspecvolumesprojectedsourcesdownwardapiitems) > [resourceFieldRef](#specpodspecvolumesprojectedsourcesdownwardapiitemsresourcefieldref) > containerName

Container name: required for volumes, optional for env vars

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI.items[].resourceFieldRef.divisor`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [downwardAPI](#specpodspecvolumesprojectedsourcesdownwardapi) > [items](#specpodspecvolumesprojectedsourcesdownwardapiitems) > [resourceFieldRef](#specpodspecvolumesprojectedsourcesdownwardapiitemsresourcefieldref) > divisor

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].downwardAPI.items[].resourceFieldRef.resource`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [downwardAPI](#specpodspecvolumesprojectedsourcesdownwardapi) > [items](#specpodspecvolumesprojectedsourcesdownwardapiitems) > [resourceFieldRef](#specpodspecvolumesprojectedsourcesdownwardapiitemsresourcefieldref) > resource

Required: resource to select

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].projected.sources[].secret`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > secret

Adapts a secret into a projected volume.

The contents of the target Secret's Data field will be presented in a projected volume as files using the keys in the Data field as the file names. Note that this is identical to a secret volume source without the default mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].projected.sources[].secret.items[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [secret](#specpodspecvolumesprojectedsourcessecret) > items

If unspecified, each key-value pair in the Data field of the referenced Secret will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the Secret, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[].projected.sources[].secret.items[].key`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [secret](#specpodspecvolumesprojectedsourcessecret) > [items](#specpodspecvolumesprojectedsourcessecretitems) > key

The key to project.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].secret.items[].mode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [secret](#specpodspecvolumesprojectedsourcessecret) > [items](#specpodspecvolumesprojectedsourcessecretitems) > mode

Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified, the volume defaultMode will be used. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].projected.sources[].secret.items[].path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [secret](#specpodspecvolumesprojectedsourcessecret) > [items](#specpodspecvolumesprojectedsourcessecretitems) > path

The relative path of the file to map the key to. May not be an absolute path. May not contain the path element '..'. May not start with the string '..'.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].secret.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [secret](#specpodspecvolumesprojectedsourcessecret) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].secret.optional`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [secret](#specpodspecvolumesprojectedsourcessecret) > optional

Specify whether the Secret or its key must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].projected.sources[].serviceAccountToken`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > serviceAccountToken

ServiceAccountTokenProjection represents a projected service account token volume. This projection can be used to insert a service account token into the pods runtime filesystem for use against APIs (Kubernetes API Server or otherwise).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].projected.sources[].serviceAccountToken.audience`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [serviceAccountToken](#specpodspecvolumesprojectedsourcesserviceaccounttoken) > audience

Audience is the intended audience of the token. A recipient of a token must identify itself with an identifier specified in the audience of the token, and otherwise should reject the token. The audience defaults to the identifier of the apiserver.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].projected.sources[].serviceAccountToken.expirationSeconds`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [serviceAccountToken](#specpodspecvolumesprojectedsourcesserviceaccounttoken) > expirationSeconds

ExpirationSeconds is the requested duration of validity of the service account token. As the token approaches expiration, the kubelet volume plugin will proactively rotate the service account token. The kubelet will start trying to rotate the token if the token is older than 80 percent of its time to live or if the token is older than 24 hours.Defaults to 1 hour and must be at least 10 minutes.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].projected.sources[].serviceAccountToken.path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [projected](#specpodspecvolumesprojected) > [sources](#specpodspecvolumesprojectedsources) > [serviceAccountToken](#specpodspecvolumesprojectedsourcesserviceaccounttoken) > path

Path is the path relative to the mount point of the file to project the token into.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].quobyte`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > quobyte

Represents a Quobyte mount that lasts the lifetime of a pod. Quobyte volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].quobyte.group`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [quobyte](#specpodspecvolumesquobyte) > group

Group to map volume access to Default is no group

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].quobyte.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [quobyte](#specpodspecvolumesquobyte) > readOnly

ReadOnly here will force the Quobyte volume to be mounted with read-only permissions. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].quobyte.registry`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [quobyte](#specpodspecvolumesquobyte) > registry

Registry represents a single or multiple Quobyte Registry services specified as a string as host:port pair (multiple entries are separated with commas) which acts as the central registry for volumes

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].quobyte.tenant`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [quobyte](#specpodspecvolumesquobyte) > tenant

Tenant owning the given Quobyte volume in the Backend Used with dynamically provisioned Quobyte volumes, value is set by the plugin

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].quobyte.user`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [quobyte](#specpodspecvolumesquobyte) > user

User to map volume access to Defaults to serivceaccount user

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].quobyte.volume`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [quobyte](#specpodspecvolumesquobyte) > volume

Volume is a string that references an already created Quobyte volume by name.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].rbd`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > rbd

Represents a Rados Block Device mount that lasts the lifetime of a pod. RBD volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].rbd.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [rbd](#specpodspecvolumesrbd) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#rbd

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].rbd.image`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [rbd](#specpodspecvolumesrbd) > image

The rados image name. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].rbd.keyring`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [rbd](#specpodspecvolumesrbd) > keyring

Keyring is the path to key ring for RBDUser. Default is /etc/ceph/keyring. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].rbd.monitors[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [rbd](#specpodspecvolumesrbd) > monitors

A collection of Ceph monitors. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type    | Required |
| ------- | -------- |
| `array` | Yes      |

### `spec.podSpec.volumes[].rbd.pool`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [rbd](#specpodspecvolumesrbd) > pool

The rados pool name. Default is rbd. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].rbd.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [rbd](#specpodspecvolumesrbd) > readOnly

ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].rbd.secretRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [rbd](#specpodspecvolumesrbd) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].rbd.secretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [rbd](#specpodspecvolumesrbd) > [secretRef](#specpodspecvolumesrbdsecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].rbd.user`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [rbd](#specpodspecvolumesrbd) > user

The rados user name. Default is admin. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].scaleIO`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > scaleIO

ScaleIOVolumeSource represents a persistent ScaleIO volume

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].scaleIO.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Default is "xfs".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].scaleIO.gateway`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > gateway

The host address of the ScaleIO API Gateway.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].scaleIO.protectionDomain`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > protectionDomain

The name of the ScaleIO Protection Domain for the configured storage.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].scaleIO.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].scaleIO.secretRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

### `spec.podSpec.volumes[].scaleIO.secretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > [secretRef](#specpodspecvolumesscaleiosecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].scaleIO.sslEnabled`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > sslEnabled

Flag to enable/disable SSL communication with Gateway, default false

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].scaleIO.storageMode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > storageMode

Indicates whether the storage for a volume should be ThickProvisioned or ThinProvisioned. Default is ThinProvisioned.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].scaleIO.storagePool`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > storagePool

The ScaleIO Storage Pool associated with the protection domain.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].scaleIO.system`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > system

The name of the storage system as configured in ScaleIO.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.podSpec.volumes[].scaleIO.volumeName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [scaleIO](#specpodspecvolumesscaleio) > volumeName

The name of a volume already created in the ScaleIO system that is associated with this volume source.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].secret`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > secret

Adapts a Secret into a volume.

The contents of the target Secret's Data field will be presented in a volume as files using the keys in the Data field as the file names. Secret volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].secret.defaultMode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [secret](#specpodspecvolumessecret) > defaultMode

Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].secret.items[]`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [secret](#specpodspecvolumessecret) > items

If unspecified, each key-value pair in the Data field of the referenced Secret will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the Secret, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.podSpec.volumes[].secret.items[].key`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [secret](#specpodspecvolumessecret) > [items](#specpodspecvolumessecretitems) > key

The key to project.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].secret.items[].mode`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [secret](#specpodspecvolumessecret) > [items](#specpodspecvolumessecretitems) > mode

Optional: mode bits to use on this file, must be a value between 0 and 0777. If not specified, the volume defaultMode will be used. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `spec.podSpec.volumes[].secret.items[].path`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [secret](#specpodspecvolumessecret) > [items](#specpodspecvolumessecretitems) > path

The relative path of the file to map the key to. May not be an absolute path. May not contain the path element '..'. May not start with the string '..'.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].secret.optional`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [secret](#specpodspecvolumessecret) > optional

Specify whether the Secret or its keys must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].secret.secretName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [secret](#specpodspecvolumessecret) > secretName

Name of the secret in the pod's namespace to use. More info: https://kubernetes.io/docs/concepts/storage/volumes#secret

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].storageos`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > storageos

Represents a StorageOS persistent volume resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].storageos.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [storageos](#specpodspecvolumesstorageos) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].storageos.readOnly`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [storageos](#specpodspecvolumesstorageos) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.podSpec.volumes[].storageos.secretRef`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [storageos](#specpodspecvolumesstorageos) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].storageos.secretRef.name`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [storageos](#specpodspecvolumesstorageos) > [secretRef](#specpodspecvolumesstorageossecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].storageos.volumeName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [storageos](#specpodspecvolumesstorageos) > volumeName

VolumeName is the human-readable name of the StorageOS volume.  Volume names are only unique within a namespace.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].storageos.volumeNamespace`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [storageos](#specpodspecvolumesstorageos) > volumeNamespace

VolumeNamespace specifies the scope of the volume within StorageOS.  If no namespace is specified then the Pod's namespace will be used.  This allows the Kubernetes name scoping to be mirrored within StorageOS for tighter integration. Set VolumeName to any name to override the default behaviour. Set to "default" if you are not using namespaces within StorageOS. Namespaces that do not pre-exist within StorageOS will be created.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].vsphereVolume`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > vsphereVolume

Represents a vSphere volume resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.podSpec.volumes[].vsphereVolume.fsType`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [vsphereVolume](#specpodspecvolumesvspherevolume) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].vsphereVolume.storagePolicyID`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [vsphereVolume](#specpodspecvolumesvspherevolume) > storagePolicyID

Storage Policy Based Management (SPBM) profile ID associated with the StoragePolicyName.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].vsphereVolume.storagePolicyName`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [vsphereVolume](#specpodspecvolumesvspherevolume) > storagePolicyName

Storage Policy Based Management (SPBM) profile name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.podSpec.volumes[].vsphereVolume.volumePath`

[spec](#spec) > [podSpec](#specpodspec) > [volumes](#specpodspecvolumes) > [vsphereVolume](#specpodspecvolumesvspherevolume) > volumePath

Path that identifies vSphere volume vmdk

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |


## Outputs

The following keys are available via the `${actions.run.<name>}` template string key for `kubernetes-pod`
action.

### `${actions.run.<name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.run.<name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.run.my-run.disabled}
```

### `${actions.run.<name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.my-run.buildPath}
```

### `${actions.run.<name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.my-run.sourcePath}
```

### `${actions.run.<name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.run.my-run.mode}
```

### `${actions.run.<name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.run.<name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.run.<name>.outputs.log}`

The full log output from the executed action. (Pro-tip: Make it machine readable so it can be parsed by dependants)

| Type     | Default |
| -------- | ------- |
| `string` | `""`    |
