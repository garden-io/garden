---
title: "`local-kubernetes` Provider"
tocTitle: "`local-kubernetes`"
---

# `local-kubernetes` Provider

## Description

The `local-kubernetes` provider is a specialized version of the [`kubernetes` provider](https://docs.garden.io/reference/providers/kubernetes) that automates and simplifies working with local Kubernetes clusters.

For general Kubernetes usage information, please refer to the [guides section](https://docs.garden.io/guides). For local clusters a good place to start is the [Local Kubernetes guide](https://docs.garden.io/guides/local-kubernetes) guide. The [demo-project](https://docs.garden.io/example-projects/demo-project) example project and guide are also helpful as an introduction.

If you're working with a remote Kubernetes cluster, please refer to the [`kubernetes` provider](https://docs.garden.io/reference/providers/kubernetes) docs, and the [Remote Kubernetes guide](https://docs.garden.io/guides/remote-kubernetes) guide.

Below is the full schema reference for the provider configuration. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-overview.md).

The reference is divided into two sections. The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
providers:
  - # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    environments:

    # Choose the mechanism for building container images before deploying. By default it uses the local Docker
    # daemon, but you can set it to `cluster-docker` or `kaniko` to sync files to a remote Docker daemon,
    # installed in the cluster, and build container images there. This removes the need to run Docker or
    # Kubernetes locally, and allows you to share layer and image caches between multiple developers, as well
    # as between your development and CI workflows.
    #
    # This is currently experimental and sometimes not desired, so it's not enabled by default. For example when using
    # the `local-kubernetes` provider with Docker for Desktop and Minikube, we directly use the in-cluster docker
    # daemon when building. You might also be deploying to a remote cluster that isn't intended as a development
    # environment, so you'd want your builds to happen elsewhere.
    #
    # Functionally, both `cluster-docker` and `kaniko` do the same thing, but use different underlying mechanisms
    # to build. The former uses a normal Docker daemon in the cluster. Because this has to run in privileged mode,
    # this is less secure than Kaniko, but in turn it is generally faster. See the
    # [Kaniko docs](https://github.com/GoogleContainerTools/kaniko) for more information on Kaniko.
    buildMode: local-docker

    # Configuration options for the `cluster-docker` build mode.
    clusterDocker:
      # Enable [BuildKit](https://github.com/moby/buildkit) support. This should in most cases work well and be more
      # performant, but we're opting to keep it optional until it's enabled by default in Docker.
      enableBuildKit: false

      # A list of volumes that you'd like to attach to the in-cluster Docker deployment Pod. Note that you also need
      # to specify corresponding mounts using the `volumeMounts` field, much like how you specify `volumes` and
      # `containers[].volumeMounts` separately in a Kubernetes Pod spec. In fact, the schema for this field is
      # precisely the same as on the `volumes` field on a Pod spec, and is passed directly to the Docker Deployment
      # spec.
      #
      # Typical examples would be referencing a Kubernetes Secret, containing e.g. auth information for private
      # package repositories, as well as cache volumes to accelerate image builds.
      #
      # **Important: Volumes declared here must must be available in the garden-system namespace.**
      volumes: []
        - # Represents a Persistent Disk resource in AWS.
          #
          # An AWS EBS disk must exist before mounting to a container. The disk must also be in the same AWS zone as
          # the kubelet. An AWS EBS disk can only be mounted as read/write once. AWS EBS volumes support ownership
          # management and SELinux relabeling.
          awsElasticBlockStore:
            # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported
            # by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
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

          # Represents a Ceph Filesystem mount that lasts the lifetime of a pod Cephfs volumes do not support
          # ownership management or SELinux relabeling.
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

          # Represents a cinder volume resource in Openstack. A Cinder volume must exist before mounting to a
          # container. The volume must also be in the same region as the kubelet. Cinder volumes support ownership
          # management and SELinux relabeling.
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
            # the volume as a file whose name is the key and content is the value. If specified, the listed keys will
            # be projected into the specified paths, and unlisted keys will not be present. If a key is specified
            # which is not present in the ConfigMap, the volume setup will error unless it is marked optional. Paths
            # must be relative and may not contain the '..' path or start with '..'.
            items:

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

            # Optional: FC volume world wide identifiers (wwids) Either wwids or combination of targetWWNs and lun
            # must be set, but not both simultaneously.
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
            # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported
            # by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
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

          # Represents a volume that is populated with the contents of a git repository. Git repo volumes do not
          # support ownership management. Git repo volumes support SELinux relabeling.
          #
          # DEPRECATED: GitRepo is deprecated. To provision a container with a git repo, mount an EmptyDir into an
          # InitContainer that clones the repo using git, then mount the EmptyDir into the Pod's container.
          gitRepo:
            # Target directory name. Must not contain or start with '..'.  If '.' is supplied, the volume directory
            # will be the git repository.  Otherwise, if specified, the volume will contain the git repository in the
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

            # ReadOnly here will force the Glusterfs volume to be mounted with read-only permissions. Defaults to
            # false. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod
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

            # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported
            # by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
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

          # Represents an NFS mount that lasts the lifetime of a pod. NFS volumes do not support ownership management
          # or SELinux relabeling.
          nfs:
            # Path that is exported by the NFS server. More info:
            # https://kubernetes.io/docs/concepts/storage/volumes#nfs
            path:

            # ReadOnly here will force the NFS export to be mounted with read-only permissions. Defaults to false.
            # More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs
            readOnly:

            # Server is the hostname or IP address of the NFS server. More info:
            # https://kubernetes.io/docs/concepts/storage/volumes#nfs
            server:

          # PersistentVolumeClaimVolumeSource references the user's PVC in the same namespace. This volume finds the
          # bound PV and mounts that volume for the pod. A PersistentVolumeClaimVolumeSource is, essentially, a
          # wrapper around another type of volume that is owned by someone else (the system).
          persistentVolumeClaim:
            # ClaimName is the name of a PersistentVolumeClaim in the same namespace as the pod using this volume.
            # More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#persistentvolumeclaims
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

          # Represents a Quobyte mount that lasts the lifetime of a pod. Quobyte volumes do not support ownership
          # management or SELinux relabeling.
          quobyte:
            # Group to map volume access to Default is no group
            group:

            # ReadOnly here will force the Quobyte volume to be mounted with read-only permissions. Defaults to false.
            readOnly:

            # Registry represents a single or multiple Quobyte Registry services specified as a string as host:port
            # pair (multiple entries are separated with commas) which acts as the central registry for volumes
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
            # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported
            # by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
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
          # The contents of the target Secret's Data field will be presented in a volume as files using the keys in
          # the Data field as the file names. Secret volumes support ownership management and SELinux relabeling.
          secret:
            # Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to
            # 0644. Directories within the path are not affected by this setting. This might be in conflict with other
            # options that affect the file mode, like fsGroup, and the result can be other mode bits set.
            defaultMode:

            # If unspecified, each key-value pair in the Data field of the referenced Secret will be projected into
            # the volume as a file whose name is the key and content is the value. If specified, the listed keys will
            # be projected into the specified paths, and unlisted keys will not be present. If a key is specified
            # which is not present in the Secret, the volume setup will error unless it is marked optional. Paths must
            # be relative and may not contain the '..' path or start with '..'.
            items:

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

            # VolumeNamespace specifies the scope of the volume within StorageOS.  If no namespace is specified then
            # the Pod's namespace will be used.  This allows the Kubernetes name scoping to be mirrored within
            # StorageOS for tighter integration. Set VolumeName to any name to override the default behaviour. Set to
            # "default" if you are not using namespaces within StorageOS. Namespaces that do not pre-exist within
            # StorageOS will be created.
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

      # A list of volume mounts, referencing the volumes defined in the `volumes` field, specifying how and where to
      # mount the volume in the Docker deployment container. The schema for this field is the same as on the
      # `containers[].volumeMounts` field on a Pod spec.
      volumeMounts: []
        - # Path within the container at which the volume should be mounted.  Must not contain ':'.
          mountPath:

          # mountPropagation determines how mounts are propagated from the host to container and the other way around.
          # When not set, MountPropagationNone is used. This field is beta in 1.10.
          mountPropagation:

          # This must match the Name of a Volume.
          name:

          # Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false.
          readOnly:

          # Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's
          # root).
          subPath:

          # Expanded path within the volume from which the container's volume should be mounted. Behaves similarly to
          # SubPath but environment variable references $(VAR_NAME) are expanded using the container's environment.
          # Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive.
          subPathExpr:

    # Configuration options for the `kaniko` build mode.
    kaniko:
      # Change the kaniko image (repository/image:tag) to use when building in kaniko mode.
      image: 'gcr.io/kaniko-project/executor:debug-v0.23.0'

      # Specify extra flags to use when building the container image with kaniko. Flags set on container module take
      # precedence over these.
      extraFlags:

      # A list of volumes that you'd like to attach to every Kaniko Pod during builds. Note that you also need to
      # specify corresponding mounts using the `volumeMounts` field, much like how you specify `volumes` and
      # `containers[].volumeMounts` separately in a Kubernetes Pod spec. In fact, the schema for this field is
      # precisely the same as on the `volumes` field on a Pod spec, and is passed directly to the Kaniko Pods.
      #
      # Typical examples would be referencing a Kubernetes Secret, containing e.g. auth information for private
      # package repositories, as well as shared cache volumes to accelerate image builds.
      #
      # **Important: Volumes declared here must support ReadWriteMany access, since multiple Kaniko Pods will run at
      # the same time, and must also be available in the garden-system namespace.**
      volumes: []
        - # Represents a Persistent Disk resource in AWS.
          #
          # An AWS EBS disk must exist before mounting to a container. The disk must also be in the same AWS zone as
          # the kubelet. An AWS EBS disk can only be mounted as read/write once. AWS EBS volumes support ownership
          # management and SELinux relabeling.
          awsElasticBlockStore:
            # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported
            # by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
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

          # Represents a Ceph Filesystem mount that lasts the lifetime of a pod Cephfs volumes do not support
          # ownership management or SELinux relabeling.
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

          # Represents a cinder volume resource in Openstack. A Cinder volume must exist before mounting to a
          # container. The volume must also be in the same region as the kubelet. Cinder volumes support ownership
          # management and SELinux relabeling.
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
            # the volume as a file whose name is the key and content is the value. If specified, the listed keys will
            # be projected into the specified paths, and unlisted keys will not be present. If a key is specified
            # which is not present in the ConfigMap, the volume setup will error unless it is marked optional. Paths
            # must be relative and may not contain the '..' path or start with '..'.
            items:

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

            # Optional: FC volume world wide identifiers (wwids) Either wwids or combination of targetWWNs and lun
            # must be set, but not both simultaneously.
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
            # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported
            # by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
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

          # Represents a volume that is populated with the contents of a git repository. Git repo volumes do not
          # support ownership management. Git repo volumes support SELinux relabeling.
          #
          # DEPRECATED: GitRepo is deprecated. To provision a container with a git repo, mount an EmptyDir into an
          # InitContainer that clones the repo using git, then mount the EmptyDir into the Pod's container.
          gitRepo:
            # Target directory name. Must not contain or start with '..'.  If '.' is supplied, the volume directory
            # will be the git repository.  Otherwise, if specified, the volume will contain the git repository in the
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

            # ReadOnly here will force the Glusterfs volume to be mounted with read-only permissions. Defaults to
            # false. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod
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

            # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported
            # by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
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

          # Represents an NFS mount that lasts the lifetime of a pod. NFS volumes do not support ownership management
          # or SELinux relabeling.
          nfs:
            # Path that is exported by the NFS server. More info:
            # https://kubernetes.io/docs/concepts/storage/volumes#nfs
            path:

            # ReadOnly here will force the NFS export to be mounted with read-only permissions. Defaults to false.
            # More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs
            readOnly:

            # Server is the hostname or IP address of the NFS server. More info:
            # https://kubernetes.io/docs/concepts/storage/volumes#nfs
            server:

          # PersistentVolumeClaimVolumeSource references the user's PVC in the same namespace. This volume finds the
          # bound PV and mounts that volume for the pod. A PersistentVolumeClaimVolumeSource is, essentially, a
          # wrapper around another type of volume that is owned by someone else (the system).
          persistentVolumeClaim:
            # ClaimName is the name of a PersistentVolumeClaim in the same namespace as the pod using this volume.
            # More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#persistentvolumeclaims
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

          # Represents a Quobyte mount that lasts the lifetime of a pod. Quobyte volumes do not support ownership
          # management or SELinux relabeling.
          quobyte:
            # Group to map volume access to Default is no group
            group:

            # ReadOnly here will force the Quobyte volume to be mounted with read-only permissions. Defaults to false.
            readOnly:

            # Registry represents a single or multiple Quobyte Registry services specified as a string as host:port
            # pair (multiple entries are separated with commas) which acts as the central registry for volumes
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
            # Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported
            # by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if
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
          # The contents of the target Secret's Data field will be presented in a volume as files using the keys in
          # the Data field as the file names. Secret volumes support ownership management and SELinux relabeling.
          secret:
            # Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to
            # 0644. Directories within the path are not affected by this setting. This might be in conflict with other
            # options that affect the file mode, like fsGroup, and the result can be other mode bits set.
            defaultMode:

            # If unspecified, each key-value pair in the Data field of the referenced Secret will be projected into
            # the volume as a file whose name is the key and content is the value. If specified, the listed keys will
            # be projected into the specified paths, and unlisted keys will not be present. If a key is specified
            # which is not present in the Secret, the volume setup will error unless it is marked optional. Paths must
            # be relative and may not contain the '..' path or start with '..'.
            items:

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

            # VolumeNamespace specifies the scope of the volume within StorageOS.  If no namespace is specified then
            # the Pod's namespace will be used.  This allows the Kubernetes name scoping to be mirrored within
            # StorageOS for tighter integration. Set VolumeName to any name to override the default behaviour. Set to
            # "default" if you are not using namespaces within StorageOS. Namespaces that do not pre-exist within
            # StorageOS will be created.
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

      # A list of volume mounts, referencing the volumes defined in the `volumes` field, specifying how and where to
      # mount the volume in the Kaniko Pod container. The schema for this field is the same as on the
      # `containers[].volumeMounts` field on a Pod spec, and is passed directly to the Kaniko Pod container spec.
      volumeMounts: []
        - # Path within the container at which the volume should be mounted.  Must not contain ':'.
          mountPath:

          # mountPropagation determines how mounts are propagated from the host to container and the other way around.
          # When not set, MountPropagationNone is used. This field is beta in 1.10.
          mountPropagation:

          # This must match the Name of a Volume.
          name:

          # Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false.
          readOnly:

          # Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's
          # root).
          subPath:

          # Expanded path within the volume from which the container's volume should be mounted. Behaves similarly to
          # SubPath but environment variable references $(VAR_NAME) are expanded using the container's environment.
          # Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive.
          subPathExpr:

    # A default hostname to use when no hostname is explicitly configured for a service.
    defaultHostname:

    # Defines the strategy for deploying the project services.
    # Default is "rolling update" and there is experimental support for "blue/green" deployment.
    # The feature only supports modules of type `container`: other types will just deploy using the default strategy.
    deploymentStrategy: rolling

    # Require SSL on all `container` module services. If set to true, an error is raised when no certificate is
    # available for a configured hostname on a `container` module.
    forceSsl: false

    # References to `docker-registry` secrets to use for authenticating with remote registries when pulling
    # images. This is necessary if you reference private images in your module configuration, and is required
    # when configuring a remote Kubernetes environment with buildMode=local.
    imagePullSecrets:
      - # The name of the Kubernetes secret.
        name:

        # The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate
        # namespace before use.
        namespace: default

    # Resource requests and limits for the in-cluster builder, container registry and code sync service. (which are
    # automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).
    resources:
      # Resource requests and limits for the in-cluster builder.
      #
      # When `buildMode` is `cluster-docker`, this refers to the Docker Daemon that is installed and run
      # cluster-wide. This is shared across all users and builds, so it should be resourced accordingly, factoring
      # in how many concurrent builds you expect and how heavy your builds tend to be.
      #
      # When `buildMode` is `kaniko`, this refers to _each instance_ of Kaniko, so you'd generally use lower
      # limits/requests, but you should evaluate based on your needs.
      builder:
        limits:
          # CPU limit in millicpu.
          cpu: 4000

          # Memory limit in megabytes.
          memory: 8192

        requests:
          # CPU request in millicpu.
          cpu: 200

          # Memory request in megabytes.
          memory: 512

      # Resource requests and limits for the in-cluster image registry. Built images are pushed to this registry,
      # so that they are available to all the nodes in your cluster.
      #
      # This is shared across all users and builds, so it should be resourced accordingly, factoring
      # in how many concurrent builds you expect and how large your images tend to be.
      registry:
        limits:
          # CPU limit in millicpu.
          cpu: 2000

          # Memory limit in megabytes.
          memory: 4096

        requests:
          # CPU request in millicpu.
          cpu: 200

          # Memory request in megabytes.
          memory: 512

      # Resource requests and limits for the code sync service, which we use to sync build contexts to the cluster
      # ahead of building images. This generally is not resource intensive, but you might want to adjust the
      # defaults if you have many concurrent users.
      sync:
        limits:
          # CPU limit in millicpu.
          cpu: 500

          # Memory limit in megabytes.
          memory: 512

        requests:
          # CPU request in millicpu.
          cpu: 100

          # Memory request in megabytes.
          memory: 64

    # Storage parameters to set for the in-cluster builder, container registry and code sync persistent volumes
    # (which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).
    #
    # These are all shared cluster-wide across all users and builds, so they should be resourced accordingly,
    # factoring in how many concurrent builds you expect and how large your images and build contexts tend to be.
    storage:
      # Storage parameters for the data volume for the in-cluster Docker Daemon.
      #
      # Only applies when `buildMode` is set to `cluster-docker`, ignored otherwise.
      builder:
        # Volume size in megabytes.
        size: 20480

        # Storage class to use for the volume.
        storageClass: null

      # Storage parameters for the NFS provisioner, which we automatically create for the sync volume, _unless_
      # you specify a `storageClass` for the sync volume. See the below `sync` parameter for more.
      #
      # Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.
      nfs:
        # Storage class to use as backing storage for NFS .
        storageClass: null

      # Storage parameters for the in-cluster Docker registry volume. Built images are stored here, so that they
      # are available to all the nodes in your cluster.
      #
      # Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.
      registry:
        # Volume size in megabytes.
        size: 20480

        # Storage class to use for the volume.
        storageClass: null

      # Storage parameters for the code sync volume, which build contexts are synced to ahead of running
      # in-cluster builds.
      #
      # Important: The storage class configured here has to support _ReadWriteMany_ access.
      # If you don't specify a storage class, Garden creates an NFS provisioner and provisions an
      # NFS volume for the sync data volume.
      #
      # Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.
      sync:
        # Volume size in megabytes.
        size: 10240

        # Storage class to use for the volume.
        storageClass: null

    # One or more certificates to use for ingress.
    tlsCertificates:
      - # A unique identifier for this certificate.
        name:

        # A list of hostnames that this certificate should be used for. If you don't specify these, they will be
        # automatically read from the certificate.
        hostnames:

        # A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.
        secretRef:
          # The name of the Kubernetes secret.
          name:

          # The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate
          # namespace before use.
          namespace: default

        # Set to `cert-manager` to configure [cert-manager](https://github.com/jetstack/cert-manager) to manage this
        # certificate. See our
        # [cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
        managedBy:

    # cert-manager configuration, for creating and managing TLS certificates. See the
    # [cert-manager guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
    certManager:
      # Automatically install `cert-manager` on initialization. See the
      # [cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
      install: false

      # The email to use when requesting Let's Encrypt certificates.
      email:

      # The type of issuer for the certificate (only ACME is supported for now).
      issuer: acme

      # Specify which ACME server to request certificates from. Currently Let's Encrypt staging and prod servers are
      # supported.
      acmeServer: letsencrypt-staging

      # The type of ACME challenge used to validate hostnames and generate the certificates (only HTTP-01 is supported
      # for now).
      acmeChallengeType: HTTP-01

    # Exposes the `nodeSelector` field on the PodSpec of system services. This allows you to constrain
    # the system services to only run on particular nodes. [See
    # here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to
    # assigning Pods to nodes.
    systemNodeSelector: {}

    # For setting tolerations on the registry-proxy when using in-cluster building.
    # The registry-proxy is a DaemonSet that proxies connections to the docker registry service on each node.
    #
    # Use this only if you're doing in-cluster building and the nodes in your cluster
    # have [taints](https://kubernetes.io/docs/concepts/configuration/taint-and-toleration/).
    registryProxyTolerations:
      - # "Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
        # allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".
        effect:

        # "Key" is the taint key that the toleration applies to. Empty means match all taint keys.
        # If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.
        key:

        # "Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal". Defaults
        # to
        # "Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
        # particular category.
        operator: Equal

        # "TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
        # otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
        # the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
        # by the system.
        tolerationSeconds:

        # "Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be
        # empty,
        # otherwise just a regular string.
        value:

    # The name of the provider plugin to use.
    name: local-kubernetes

    # The kubectl context to use to connect to the Kubernetes cluster.
    context:

    # Specify which namespace to deploy services to (defaults to the project name). Note that the framework generates
    # other namespaces as well with this name as a prefix.
    namespace:

    # Set this to null or false to skip installing/enabling the `nginx` ingress controller.
    setupIngressController: nginx
```
## Configuration Keys

### `providers[]`

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].environments[]`

[providers](#providers) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
providers:
  - environments:
      - dev
      - stage
```

### `providers[].buildMode`

[providers](#providers) > buildMode

Choose the mechanism for building container images before deploying. By default it uses the local Docker
daemon, but you can set it to `cluster-docker` or `kaniko` to sync files to a remote Docker daemon,
installed in the cluster, and build container images there. This removes the need to run Docker or
Kubernetes locally, and allows you to share layer and image caches between multiple developers, as well
as between your development and CI workflows.

This is currently experimental and sometimes not desired, so it's not enabled by default. For example when using
the `local-kubernetes` provider with Docker for Desktop and Minikube, we directly use the in-cluster docker
daemon when building. You might also be deploying to a remote cluster that isn't intended as a development
environment, so you'd want your builds to happen elsewhere.

Functionally, both `cluster-docker` and `kaniko` do the same thing, but use different underlying mechanisms
to build. The former uses a normal Docker daemon in the cluster. Because this has to run in privileged mode,
this is less secure than Kaniko, but in turn it is generally faster. See the
[Kaniko docs](https://github.com/GoogleContainerTools/kaniko) for more information on Kaniko.

| Type     | Default          | Required |
| -------- | ---------------- | -------- |
| `string` | `"local-docker"` | No       |

### `providers[].clusterDocker`

[providers](#providers) > clusterDocker

Configuration options for the `cluster-docker` build mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.enableBuildKit`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > enableBuildKit

Enable [BuildKit](https://github.com/moby/buildkit) support. This should in most cases work well and be more performant, but we're opting to keep it optional until it's enabled by default in Docker.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].clusterDocker.volumes[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > volumes

A list of volumes that you'd like to attach to the in-cluster Docker deployment Pod. Note that you also need to specify corresponding mounts using the `volumeMounts` field, much like how you specify `volumes` and `containers[].volumeMounts` separately in a Kubernetes Pod spec. In fact, the schema for this field is precisely the same as on the `volumes` field on a Pod spec, and is passed directly to the Docker Deployment spec.

Typical examples would be referencing a Kubernetes Secret, containing e.g. auth information for private package repositories, as well as cache volumes to accelerate image builds.

**Important: Volumes declared here must must be available in the garden-system namespace.**

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `array[customObject]` | `[]`    | No       |

Example:

```yaml
providers:
  - clusterDocker:
      ...
      volumes:
        name: my-auth-secret
        secret:
          secretName: my-auth-secret
```

### `providers[].clusterDocker.volumes[].awsElasticBlockStore`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > awsElasticBlockStore

Represents a Persistent Disk resource in AWS.

An AWS EBS disk must exist before mounting to a container. The disk must also be in the same AWS zone as the kubelet. An AWS EBS disk can only be mounted as read/write once. AWS EBS volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].awsElasticBlockStore.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [awsElasticBlockStore](#providersclusterdockervolumesawselasticblockstore) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].awsElasticBlockStore.partition`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [awsElasticBlockStore](#providersclusterdockervolumesawselasticblockstore) > partition

The partition in the volume that you want to mount. If omitted, the default is to mount by volume name. Examples: For volume /dev/sda1, you specify the partition as "1". Similarly, the volume partition for /dev/sda is "0" (or you can leave the property empty).

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].clusterDocker.volumes[].awsElasticBlockStore.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [awsElasticBlockStore](#providersclusterdockervolumesawselasticblockstore) > readOnly

Specify "true" to force and set the ReadOnly property in VolumeMounts to "true". If omitted, the default is "false". More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].awsElasticBlockStore.volumeID`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [awsElasticBlockStore](#providersclusterdockervolumesawselasticblockstore) > volumeID

Unique ID of the persistent disk resource in AWS (Amazon EBS volume). More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].azureDisk`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > azureDisk

AzureDisk represents an Azure Data Disk mount on the host and bind mount to the pod.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].azureDisk.cachingMode`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [azureDisk](#providersclusterdockervolumesazuredisk) > cachingMode

Host Caching mode: None, Read Only, Read Write.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].azureDisk.diskName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [azureDisk](#providersclusterdockervolumesazuredisk) > diskName

The Name of the data disk in the blob storage

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].azureDisk.diskURI`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [azureDisk](#providersclusterdockervolumesazuredisk) > diskURI

The URI the data disk in the blob storage

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].azureDisk.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [azureDisk](#providersclusterdockervolumesazuredisk) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].azureDisk.kind`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [azureDisk](#providersclusterdockervolumesazuredisk) > kind

Expected values Shared: multiple blob disks per storage account  Dedicated: single blob disk per storage account  Managed: azure managed data disk (only in managed availability set). defaults to shared

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].azureDisk.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [azureDisk](#providersclusterdockervolumesazuredisk) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].azureFile`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > azureFile

AzureFile represents an Azure File Service mount on the host and bind mount to the pod.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].azureFile.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [azureFile](#providersclusterdockervolumesazurefile) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].azureFile.secretName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [azureFile](#providersclusterdockervolumesazurefile) > secretName

the name of secret that contains Azure Storage Account Name and Key

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].azureFile.shareName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [azureFile](#providersclusterdockervolumesazurefile) > shareName

Share Name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].cephfs`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > cephfs

Represents a Ceph Filesystem mount that lasts the lifetime of a pod Cephfs volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].cephfs.monitors[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cephfs](#providersclusterdockervolumescephfs) > monitors

Required: Monitors is a collection of Ceph monitors More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].clusterDocker.volumes[].cephfs.path`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cephfs](#providersclusterdockervolumescephfs) > path

Optional: Used as the mounted root, rather than the full Ceph tree, default is /

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].cephfs.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cephfs](#providersclusterdockervolumescephfs) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].cephfs.secretFile`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cephfs](#providersclusterdockervolumescephfs) > secretFile

Optional: SecretFile is the path to key ring for User, default is /etc/ceph/user.secret More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].cephfs.secretRef`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cephfs](#providersclusterdockervolumescephfs) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].cephfs.secretRef.name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cephfs](#providersclusterdockervolumescephfs) > [secretRef](#providersclusterdockervolumescephfssecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].cephfs.user`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cephfs](#providersclusterdockervolumescephfs) > user

Optional: User is the rados user name, default is admin More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].cinder`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > cinder

Represents a cinder volume resource in Openstack. A Cinder volume must exist before mounting to a container. The volume must also be in the same region as the kubelet. Cinder volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].cinder.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cinder](#providersclusterdockervolumescinder) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://examples.k8s.io/mysql-cinder-pd/README.md

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].cinder.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cinder](#providersclusterdockervolumescinder) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. More info: https://examples.k8s.io/mysql-cinder-pd/README.md

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].cinder.secretRef`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cinder](#providersclusterdockervolumescinder) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].cinder.secretRef.name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cinder](#providersclusterdockervolumescinder) > [secretRef](#providersclusterdockervolumescindersecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].cinder.volumeID`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [cinder](#providersclusterdockervolumescinder) > volumeID

volume id used to identify the volume in cinder. More info: https://examples.k8s.io/mysql-cinder-pd/README.md

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].configMap`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > configMap

Adapts a ConfigMap into a volume.

The contents of the target ConfigMap's Data field will be presented in a volume as files using the keys in the Data field as the file names, unless the items element is populated with specific mappings of keys to paths. ConfigMap volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].configMap.defaultMode`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [configMap](#providersclusterdockervolumesconfigmap) > defaultMode

Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].clusterDocker.volumes[].configMap.items[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [configMap](#providersclusterdockervolumesconfigmap) > items

If unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the ConfigMap, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].clusterDocker.volumes[].configMap.name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [configMap](#providersclusterdockervolumesconfigmap) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].configMap.optional`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [configMap](#providersclusterdockervolumesconfigmap) > optional

Specify whether the ConfigMap or its keys must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].csi`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > csi

Represents a source location of a volume to mount, managed by an external CSI driver

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].csi.driver`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [csi](#providersclusterdockervolumescsi) > driver

Driver is the name of the CSI driver that handles this volume. Consult with your admin for the correct name as registered in the cluster.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].csi.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [csi](#providersclusterdockervolumescsi) > fsType

Filesystem type to mount. Ex. "ext4", "xfs", "ntfs". If not provided, the empty value is passed to the associated CSI driver which will determine the default filesystem to apply.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].csi.nodePublishSecretRef`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [csi](#providersclusterdockervolumescsi) > nodePublishSecretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].csi.nodePublishSecretRef.name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [csi](#providersclusterdockervolumescsi) > [nodePublishSecretRef](#providersclusterdockervolumescsinodepublishsecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].csi.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [csi](#providersclusterdockervolumescsi) > readOnly

Specifies a read-only configuration for the volume. Defaults to false (read/write).

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].csi.volumeAttributes`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [csi](#providersclusterdockervolumescsi) > volumeAttributes

VolumeAttributes stores driver-specific properties that are passed to the CSI driver. Consult your driver's documentation for supported values.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].downwardAPI`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > downwardAPI

DownwardAPIVolumeSource represents a volume containing downward API info. Downward API volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].downwardAPI.defaultMode`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [downwardAPI](#providersclusterdockervolumesdownwardapi) > defaultMode

Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].clusterDocker.volumes[].downwardAPI.items[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [downwardAPI](#providersclusterdockervolumesdownwardapi) > items

Items is a list of downward API volume file

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].clusterDocker.volumes[].emptyDir`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > emptyDir

Represents an empty directory for a pod. Empty directory volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].emptyDir.medium`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [emptyDir](#providersclusterdockervolumesemptydir) > medium

What type of storage medium should back this directory. The default is "" which means to use the node's default medium. Must be an empty string (default) or Memory. More info: https://kubernetes.io/docs/concepts/storage/volumes#emptydir

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].emptyDir.sizeLimit`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [emptyDir](#providersclusterdockervolumesemptydir) > sizeLimit

| Type              | Required |
| ----------------- | -------- |
| `string | number` | No       |

### `providers[].clusterDocker.volumes[].fc`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > fc

Represents a Fibre Channel volume. Fibre Channel volumes can only be mounted as read/write once. Fibre Channel volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].fc.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [fc](#providersclusterdockervolumesfc) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].fc.lun`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [fc](#providersclusterdockervolumesfc) > lun

Optional: FC target lun number

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].clusterDocker.volumes[].fc.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [fc](#providersclusterdockervolumesfc) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].fc.targetWWNs[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [fc](#providersclusterdockervolumesfc) > targetWWNs

Optional: FC target worldwide names (WWNs)

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].clusterDocker.volumes[].fc.wwids[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [fc](#providersclusterdockervolumesfc) > wwids

Optional: FC volume world wide identifiers (wwids) Either wwids or combination of targetWWNs and lun must be set, but not both simultaneously.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].clusterDocker.volumes[].flexVolume`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > flexVolume

FlexVolume represents a generic volume resource that is provisioned/attached using an exec based plugin.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].flexVolume.driver`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [flexVolume](#providersclusterdockervolumesflexvolume) > driver

Driver is the name of the driver to use for this volume.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].flexVolume.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [flexVolume](#providersclusterdockervolumesflexvolume) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". The default filesystem depends on FlexVolume script.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].flexVolume.options`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [flexVolume](#providersclusterdockervolumesflexvolume) > options

Optional: Extra command options if any.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].flexVolume.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [flexVolume](#providersclusterdockervolumesflexvolume) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].flexVolume.secretRef`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [flexVolume](#providersclusterdockervolumesflexvolume) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].flexVolume.secretRef.name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [flexVolume](#providersclusterdockervolumesflexvolume) > [secretRef](#providersclusterdockervolumesflexvolumesecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].flocker`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > flocker

Represents a Flocker volume mounted by the Flocker agent. One and only one of datasetName and datasetUUID should be set. Flocker volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].flocker.datasetName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [flocker](#providersclusterdockervolumesflocker) > datasetName

Name of the dataset stored as metadata -> name on the dataset for Flocker should be considered as deprecated

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].flocker.datasetUUID`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [flocker](#providersclusterdockervolumesflocker) > datasetUUID

UUID of the dataset. This is unique identifier of a Flocker dataset

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].gcePersistentDisk`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > gcePersistentDisk

Represents a Persistent Disk resource in Google Compute Engine.

A GCE PD must exist before mounting to a container. The disk must also be in the same GCE project and zone as the kubelet. A GCE PD can only be mounted as read/write once or read-only many times. GCE PDs support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].gcePersistentDisk.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [gcePersistentDisk](#providersclusterdockervolumesgcepersistentdisk) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].gcePersistentDisk.partition`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [gcePersistentDisk](#providersclusterdockervolumesgcepersistentdisk) > partition

The partition in the volume that you want to mount. If omitted, the default is to mount by volume name. Examples: For volume /dev/sda1, you specify the partition as "1". Similarly, the volume partition for /dev/sda is "0" (or you can leave the property empty). More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].clusterDocker.volumes[].gcePersistentDisk.pdName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [gcePersistentDisk](#providersclusterdockervolumesgcepersistentdisk) > pdName

Unique name of the PD resource in GCE. Used to identify the disk in GCE. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].gcePersistentDisk.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [gcePersistentDisk](#providersclusterdockervolumesgcepersistentdisk) > readOnly

ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].gitRepo`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > gitRepo

Represents a volume that is populated with the contents of a git repository. Git repo volumes do not support ownership management. Git repo volumes support SELinux relabeling.

DEPRECATED: GitRepo is deprecated. To provision a container with a git repo, mount an EmptyDir into an InitContainer that clones the repo using git, then mount the EmptyDir into the Pod's container.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].gitRepo.directory`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [gitRepo](#providersclusterdockervolumesgitrepo) > directory

Target directory name. Must not contain or start with '..'.  If '.' is supplied, the volume directory will be the git repository.  Otherwise, if specified, the volume will contain the git repository in the subdirectory with the given name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].gitRepo.repository`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [gitRepo](#providersclusterdockervolumesgitrepo) > repository

Repository URL

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].gitRepo.revision`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [gitRepo](#providersclusterdockervolumesgitrepo) > revision

Commit hash for the specified revision.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].glusterfs`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > glusterfs

Represents a Glusterfs mount that lasts the lifetime of a pod. Glusterfs volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].glusterfs.endpoints`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [glusterfs](#providersclusterdockervolumesglusterfs) > endpoints

EndpointsName is the endpoint name that details Glusterfs topology. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].glusterfs.path`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [glusterfs](#providersclusterdockervolumesglusterfs) > path

Path is the Glusterfs volume path. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].glusterfs.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [glusterfs](#providersclusterdockervolumesglusterfs) > readOnly

ReadOnly here will force the Glusterfs volume to be mounted with read-only permissions. Defaults to false. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].hostPath`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > hostPath

Represents a host path mapped into a pod. Host path volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].hostPath.path`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [hostPath](#providersclusterdockervolumeshostpath) > path

Path of the directory on the host. If the path is a symlink, it will follow the link to the real path. More info: https://kubernetes.io/docs/concepts/storage/volumes#hostpath

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].hostPath.type`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [hostPath](#providersclusterdockervolumeshostpath) > type

Type for HostPath Volume Defaults to "" More info: https://kubernetes.io/docs/concepts/storage/volumes#hostpath

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].iscsi`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > iscsi

Represents an ISCSI disk. ISCSI volumes can only be mounted as read/write once. ISCSI volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].iscsi.chapAuthDiscovery`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > chapAuthDiscovery

whether support iSCSI Discovery CHAP authentication

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].iscsi.chapAuthSession`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > chapAuthSession

whether support iSCSI Session CHAP authentication

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].iscsi.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#iscsi

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].iscsi.initiatorName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > initiatorName

Custom iSCSI Initiator Name. If initiatorName is specified with iscsiInterface simultaneously, new iSCSI interface <target portal>:<volume name> will be created for the connection.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].iscsi.iqn`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > iqn

Target iSCSI Qualified Name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].iscsi.iscsiInterface`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > iscsiInterface

iSCSI Interface Name that uses an iSCSI transport. Defaults to 'default' (tcp).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].iscsi.lun`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > lun

iSCSI Target Lun number.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].clusterDocker.volumes[].iscsi.portals[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > portals

iSCSI Target Portal List. The portal is either an IP or ip_addr:port if the port is other than default (typically TCP ports 860 and 3260).

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].clusterDocker.volumes[].iscsi.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > readOnly

ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].iscsi.secretRef`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].iscsi.secretRef.name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > [secretRef](#providersclusterdockervolumesiscsisecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].iscsi.targetPortal`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [iscsi](#providersclusterdockervolumesiscsi) > targetPortal

iSCSI Target Portal. The Portal is either an IP or ip_addr:port if the port is other than default (typically TCP ports 860 and 3260).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > name

Volume's name. Must be a DNS_LABEL and unique within the pod. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].nfs`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > nfs

Represents an NFS mount that lasts the lifetime of a pod. NFS volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].nfs.path`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [nfs](#providersclusterdockervolumesnfs) > path

Path that is exported by the NFS server. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].nfs.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [nfs](#providersclusterdockervolumesnfs) > readOnly

ReadOnly here will force the NFS export to be mounted with read-only permissions. Defaults to false. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].nfs.server`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [nfs](#providersclusterdockervolumesnfs) > server

Server is the hostname or IP address of the NFS server. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].persistentVolumeClaim`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > persistentVolumeClaim

PersistentVolumeClaimVolumeSource references the user's PVC in the same namespace. This volume finds the bound PV and mounts that volume for the pod. A PersistentVolumeClaimVolumeSource is, essentially, a wrapper around another type of volume that is owned by someone else (the system).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].persistentVolumeClaim.claimName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [persistentVolumeClaim](#providersclusterdockervolumespersistentvolumeclaim) > claimName

ClaimName is the name of a PersistentVolumeClaim in the same namespace as the pod using this volume. More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#persistentvolumeclaims

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].persistentVolumeClaim.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [persistentVolumeClaim](#providersclusterdockervolumespersistentvolumeclaim) > readOnly

Will force the ReadOnly setting in VolumeMounts. Default false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].photonPersistentDisk`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > photonPersistentDisk

Represents a Photon Controller persistent disk resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].photonPersistentDisk.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [photonPersistentDisk](#providersclusterdockervolumesphotonpersistentdisk) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].photonPersistentDisk.pdID`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [photonPersistentDisk](#providersclusterdockervolumesphotonpersistentdisk) > pdID

ID that identifies Photon Controller persistent disk

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].portworxVolume`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > portworxVolume

PortworxVolumeSource represents a Portworx volume resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].portworxVolume.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [portworxVolume](#providersclusterdockervolumesportworxvolume) > fsType

FSType represents the filesystem type to mount Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].portworxVolume.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [portworxVolume](#providersclusterdockervolumesportworxvolume) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].portworxVolume.volumeID`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [portworxVolume](#providersclusterdockervolumesportworxvolume) > volumeID

VolumeID uniquely identifies a Portworx volume

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].projected`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > projected

Represents a projected volume source

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].projected.defaultMode`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [projected](#providersclusterdockervolumesprojected) > defaultMode

Mode bits to use on created files by default. Must be a value between 0 and 0777. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].clusterDocker.volumes[].projected.sources[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [projected](#providersclusterdockervolumesprojected) > sources

list of volume projections

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].clusterDocker.volumes[].quobyte`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > quobyte

Represents a Quobyte mount that lasts the lifetime of a pod. Quobyte volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].quobyte.group`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [quobyte](#providersclusterdockervolumesquobyte) > group

Group to map volume access to Default is no group

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].quobyte.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [quobyte](#providersclusterdockervolumesquobyte) > readOnly

ReadOnly here will force the Quobyte volume to be mounted with read-only permissions. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].quobyte.registry`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [quobyte](#providersclusterdockervolumesquobyte) > registry

Registry represents a single or multiple Quobyte Registry services specified as a string as host:port pair (multiple entries are separated with commas) which acts as the central registry for volumes

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].quobyte.tenant`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [quobyte](#providersclusterdockervolumesquobyte) > tenant

Tenant owning the given Quobyte volume in the Backend Used with dynamically provisioned Quobyte volumes, value is set by the plugin

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].quobyte.user`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [quobyte](#providersclusterdockervolumesquobyte) > user

User to map volume access to Defaults to serivceaccount user

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].quobyte.volume`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [quobyte](#providersclusterdockervolumesquobyte) > volume

Volume is a string that references an already created Quobyte volume by name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].rbd`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > rbd

Represents a Rados Block Device mount that lasts the lifetime of a pod. RBD volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].rbd.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [rbd](#providersclusterdockervolumesrbd) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#rbd

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].rbd.image`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [rbd](#providersclusterdockervolumesrbd) > image

The rados image name. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].rbd.keyring`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [rbd](#providersclusterdockervolumesrbd) > keyring

Keyring is the path to key ring for RBDUser. Default is /etc/ceph/keyring. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].rbd.monitors[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [rbd](#providersclusterdockervolumesrbd) > monitors

A collection of Ceph monitors. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].clusterDocker.volumes[].rbd.pool`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [rbd](#providersclusterdockervolumesrbd) > pool

The rados pool name. Default is rbd. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].rbd.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [rbd](#providersclusterdockervolumesrbd) > readOnly

ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].rbd.secretRef`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [rbd](#providersclusterdockervolumesrbd) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].rbd.secretRef.name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [rbd](#providersclusterdockervolumesrbd) > [secretRef](#providersclusterdockervolumesrbdsecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].rbd.user`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [rbd](#providersclusterdockervolumesrbd) > user

The rados user name. Default is admin. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].scaleIO`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > scaleIO

ScaleIOVolumeSource represents a persistent ScaleIO volume

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Default is "xfs".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.gateway`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > gateway

The host address of the ScaleIO API Gateway.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.protectionDomain`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > protectionDomain

The name of the ScaleIO Protection Domain for the configured storage.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.secretRef`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.secretRef.name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > [secretRef](#providersclusterdockervolumesscaleiosecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.sslEnabled`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > sslEnabled

Flag to enable/disable SSL communication with Gateway, default false

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.storageMode`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > storageMode

Indicates whether the storage for a volume should be ThickProvisioned or ThinProvisioned. Default is ThinProvisioned.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.storagePool`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > storagePool

The ScaleIO Storage Pool associated with the protection domain.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.system`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > system

The name of the storage system as configured in ScaleIO.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].scaleIO.volumeName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [scaleIO](#providersclusterdockervolumesscaleio) > volumeName

The name of a volume already created in the ScaleIO system that is associated with this volume source.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].secret`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > secret

Adapts a Secret into a volume.

The contents of the target Secret's Data field will be presented in a volume as files using the keys in the Data field as the file names. Secret volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].secret.defaultMode`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [secret](#providersclusterdockervolumessecret) > defaultMode

Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].clusterDocker.volumes[].secret.items[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [secret](#providersclusterdockervolumessecret) > items

If unspecified, each key-value pair in the Data field of the referenced Secret will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the Secret, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].clusterDocker.volumes[].secret.optional`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [secret](#providersclusterdockervolumessecret) > optional

Specify whether the Secret or its keys must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].secret.secretName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [secret](#providersclusterdockervolumessecret) > secretName

Name of the secret in the pod's namespace to use. More info: https://kubernetes.io/docs/concepts/storage/volumes#secret

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].storageos`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > storageos

Represents a StorageOS persistent volume resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].storageos.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [storageos](#providersclusterdockervolumesstorageos) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].storageos.readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [storageos](#providersclusterdockervolumesstorageos) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumes[].storageos.secretRef`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [storageos](#providersclusterdockervolumesstorageos) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].storageos.secretRef.name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [storageos](#providersclusterdockervolumesstorageos) > [secretRef](#providersclusterdockervolumesstorageossecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].storageos.volumeName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [storageos](#providersclusterdockervolumesstorageos) > volumeName

VolumeName is the human-readable name of the StorageOS volume.  Volume names are only unique within a namespace.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].storageos.volumeNamespace`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [storageos](#providersclusterdockervolumesstorageos) > volumeNamespace

VolumeNamespace specifies the scope of the volume within StorageOS.  If no namespace is specified then the Pod's namespace will be used.  This allows the Kubernetes name scoping to be mirrored within StorageOS for tighter integration. Set VolumeName to any name to override the default behaviour. Set to "default" if you are not using namespaces within StorageOS. Namespaces that do not pre-exist within StorageOS will be created.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].vsphereVolume`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > vsphereVolume

Represents a vSphere volume resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.volumes[].vsphereVolume.fsType`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [vsphereVolume](#providersclusterdockervolumesvspherevolume) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].vsphereVolume.storagePolicyID`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [vsphereVolume](#providersclusterdockervolumesvspherevolume) > storagePolicyID

Storage Policy Based Management (SPBM) profile ID associated with the StoragePolicyName.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].vsphereVolume.storagePolicyName`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [vsphereVolume](#providersclusterdockervolumesvspherevolume) > storagePolicyName

Storage Policy Based Management (SPBM) profile name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumes[].vsphereVolume.volumePath`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumes](#providersclusterdockervolumes) > [vsphereVolume](#providersclusterdockervolumesvspherevolume) > volumePath

Path that identifies vSphere volume vmdk

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumeMounts[]`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > volumeMounts

A list of volume mounts, referencing the volumes defined in the `volumes` field, specifying how and where to mount the volume in the Docker deployment container. The schema for this field is the same as on the `containers[].volumeMounts` field on a Pod spec.

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `array[customObject]` | `[]`    | No       |

Example:

```yaml
providers:
  - clusterDocker:
      ...
      volumeMounts:
        name: my-auth-secret
        mountPath: /.my-custom-auth
```

### `providers[].clusterDocker.volumeMounts[].mountPath`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumeMounts](#providersclusterdockervolumemounts) > mountPath

Path within the container at which the volume should be mounted.  Must not contain ':'.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumeMounts[].mountPropagation`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumeMounts](#providersclusterdockervolumemounts) > mountPropagation

mountPropagation determines how mounts are propagated from the host to container and the other way around. When not set, MountPropagationNone is used. This field is beta in 1.10.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumeMounts[].name`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumeMounts](#providersclusterdockervolumemounts) > name

This must match the Name of a Volume.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumeMounts[].readOnly`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumeMounts](#providersclusterdockervolumemounts) > readOnly

Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].clusterDocker.volumeMounts[].subPath`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumeMounts](#providersclusterdockervolumemounts) > subPath

Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's root).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].clusterDocker.volumeMounts[].subPathExpr`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > [volumeMounts](#providersclusterdockervolumemounts) > subPathExpr

Expanded path within the volume from which the container's volume should be mounted. Behaves similarly to SubPath but environment variable references $(VAR_NAME) are expanded using the container's environment. Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko`

[providers](#providers) > kaniko

Configuration options for the `kaniko` build mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.image`

[providers](#providers) > [kaniko](#providerskaniko) > image

Change the kaniko image (repository/image:tag) to use when building in kaniko mode.

| Type     | Default                                          | Required |
| -------- | ------------------------------------------------ | -------- |
| `string` | `"gcr.io/kaniko-project/executor:debug-v0.23.0"` | No       |

### `providers[].kaniko.extraFlags[]`

[providers](#providers) > [kaniko](#providerskaniko) > extraFlags

Specify extra flags to use when building the container image with kaniko. Flags set on container module take precedence over these.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `providers[].kaniko.volumes[]`

[providers](#providers) > [kaniko](#providerskaniko) > volumes

A list of volumes that you'd like to attach to every Kaniko Pod during builds. Note that you also need to specify corresponding mounts using the `volumeMounts` field, much like how you specify `volumes` and `containers[].volumeMounts` separately in a Kubernetes Pod spec. In fact, the schema for this field is precisely the same as on the `volumes` field on a Pod spec, and is passed directly to the Kaniko Pods.

Typical examples would be referencing a Kubernetes Secret, containing e.g. auth information for private package repositories, as well as shared cache volumes to accelerate image builds.

**Important: Volumes declared here must support ReadWriteMany access, since multiple Kaniko Pods will run at the same time, and must also be available in the garden-system namespace.**

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `array[customObject]` | `[]`    | No       |

Example:

```yaml
providers:
  - kaniko:
      ...
      volumes:
        name: my-auth-secret
        secret:
          secretName: my-auth-secret
```

### `providers[].kaniko.volumes[].awsElasticBlockStore`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > awsElasticBlockStore

Represents a Persistent Disk resource in AWS.

An AWS EBS disk must exist before mounting to a container. The disk must also be in the same AWS zone as the kubelet. An AWS EBS disk can only be mounted as read/write once. AWS EBS volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].awsElasticBlockStore.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [awsElasticBlockStore](#providerskanikovolumesawselasticblockstore) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].awsElasticBlockStore.partition`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [awsElasticBlockStore](#providerskanikovolumesawselasticblockstore) > partition

The partition in the volume that you want to mount. If omitted, the default is to mount by volume name. Examples: For volume /dev/sda1, you specify the partition as "1". Similarly, the volume partition for /dev/sda is "0" (or you can leave the property empty).

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].kaniko.volumes[].awsElasticBlockStore.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [awsElasticBlockStore](#providerskanikovolumesawselasticblockstore) > readOnly

Specify "true" to force and set the ReadOnly property in VolumeMounts to "true". If omitted, the default is "false". More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].awsElasticBlockStore.volumeID`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [awsElasticBlockStore](#providerskanikovolumesawselasticblockstore) > volumeID

Unique ID of the persistent disk resource in AWS (Amazon EBS volume). More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].azureDisk`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > azureDisk

AzureDisk represents an Azure Data Disk mount on the host and bind mount to the pod.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].azureDisk.cachingMode`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [azureDisk](#providerskanikovolumesazuredisk) > cachingMode

Host Caching mode: None, Read Only, Read Write.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].azureDisk.diskName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [azureDisk](#providerskanikovolumesazuredisk) > diskName

The Name of the data disk in the blob storage

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].azureDisk.diskURI`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [azureDisk](#providerskanikovolumesazuredisk) > diskURI

The URI the data disk in the blob storage

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].azureDisk.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [azureDisk](#providerskanikovolumesazuredisk) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].azureDisk.kind`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [azureDisk](#providerskanikovolumesazuredisk) > kind

Expected values Shared: multiple blob disks per storage account  Dedicated: single blob disk per storage account  Managed: azure managed data disk (only in managed availability set). defaults to shared

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].azureDisk.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [azureDisk](#providerskanikovolumesazuredisk) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].azureFile`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > azureFile

AzureFile represents an Azure File Service mount on the host and bind mount to the pod.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].azureFile.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [azureFile](#providerskanikovolumesazurefile) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].azureFile.secretName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [azureFile](#providerskanikovolumesazurefile) > secretName

the name of secret that contains Azure Storage Account Name and Key

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].azureFile.shareName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [azureFile](#providerskanikovolumesazurefile) > shareName

Share Name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].cephfs`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > cephfs

Represents a Ceph Filesystem mount that lasts the lifetime of a pod Cephfs volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].cephfs.monitors[]`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cephfs](#providerskanikovolumescephfs) > monitors

Required: Monitors is a collection of Ceph monitors More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].kaniko.volumes[].cephfs.path`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cephfs](#providerskanikovolumescephfs) > path

Optional: Used as the mounted root, rather than the full Ceph tree, default is /

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].cephfs.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cephfs](#providerskanikovolumescephfs) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].cephfs.secretFile`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cephfs](#providerskanikovolumescephfs) > secretFile

Optional: SecretFile is the path to key ring for User, default is /etc/ceph/user.secret More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].cephfs.secretRef`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cephfs](#providerskanikovolumescephfs) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].cephfs.secretRef.name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cephfs](#providerskanikovolumescephfs) > [secretRef](#providerskanikovolumescephfssecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].cephfs.user`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cephfs](#providerskanikovolumescephfs) > user

Optional: User is the rados user name, default is admin More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].cinder`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > cinder

Represents a cinder volume resource in Openstack. A Cinder volume must exist before mounting to a container. The volume must also be in the same region as the kubelet. Cinder volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].cinder.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cinder](#providerskanikovolumescinder) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://examples.k8s.io/mysql-cinder-pd/README.md

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].cinder.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cinder](#providerskanikovolumescinder) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. More info: https://examples.k8s.io/mysql-cinder-pd/README.md

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].cinder.secretRef`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cinder](#providerskanikovolumescinder) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].cinder.secretRef.name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cinder](#providerskanikovolumescinder) > [secretRef](#providerskanikovolumescindersecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].cinder.volumeID`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [cinder](#providerskanikovolumescinder) > volumeID

volume id used to identify the volume in cinder. More info: https://examples.k8s.io/mysql-cinder-pd/README.md

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].configMap`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > configMap

Adapts a ConfigMap into a volume.

The contents of the target ConfigMap's Data field will be presented in a volume as files using the keys in the Data field as the file names, unless the items element is populated with specific mappings of keys to paths. ConfigMap volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].configMap.defaultMode`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [configMap](#providerskanikovolumesconfigmap) > defaultMode

Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].kaniko.volumes[].configMap.items[]`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [configMap](#providerskanikovolumesconfigmap) > items

If unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the ConfigMap, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].kaniko.volumes[].configMap.name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [configMap](#providerskanikovolumesconfigmap) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].configMap.optional`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [configMap](#providerskanikovolumesconfigmap) > optional

Specify whether the ConfigMap or its keys must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].csi`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > csi

Represents a source location of a volume to mount, managed by an external CSI driver

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].csi.driver`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [csi](#providerskanikovolumescsi) > driver

Driver is the name of the CSI driver that handles this volume. Consult with your admin for the correct name as registered in the cluster.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].csi.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [csi](#providerskanikovolumescsi) > fsType

Filesystem type to mount. Ex. "ext4", "xfs", "ntfs". If not provided, the empty value is passed to the associated CSI driver which will determine the default filesystem to apply.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].csi.nodePublishSecretRef`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [csi](#providerskanikovolumescsi) > nodePublishSecretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].csi.nodePublishSecretRef.name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [csi](#providerskanikovolumescsi) > [nodePublishSecretRef](#providerskanikovolumescsinodepublishsecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].csi.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [csi](#providerskanikovolumescsi) > readOnly

Specifies a read-only configuration for the volume. Defaults to false (read/write).

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].csi.volumeAttributes`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [csi](#providerskanikovolumescsi) > volumeAttributes

VolumeAttributes stores driver-specific properties that are passed to the CSI driver. Consult your driver's documentation for supported values.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].downwardAPI`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > downwardAPI

DownwardAPIVolumeSource represents a volume containing downward API info. Downward API volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].downwardAPI.defaultMode`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [downwardAPI](#providerskanikovolumesdownwardapi) > defaultMode

Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].kaniko.volumes[].downwardAPI.items[]`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [downwardAPI](#providerskanikovolumesdownwardapi) > items

Items is a list of downward API volume file

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].kaniko.volumes[].emptyDir`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > emptyDir

Represents an empty directory for a pod. Empty directory volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].emptyDir.medium`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [emptyDir](#providerskanikovolumesemptydir) > medium

What type of storage medium should back this directory. The default is "" which means to use the node's default medium. Must be an empty string (default) or Memory. More info: https://kubernetes.io/docs/concepts/storage/volumes#emptydir

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].emptyDir.sizeLimit`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [emptyDir](#providerskanikovolumesemptydir) > sizeLimit

| Type              | Required |
| ----------------- | -------- |
| `string | number` | No       |

### `providers[].kaniko.volumes[].fc`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > fc

Represents a Fibre Channel volume. Fibre Channel volumes can only be mounted as read/write once. Fibre Channel volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].fc.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [fc](#providerskanikovolumesfc) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].fc.lun`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [fc](#providerskanikovolumesfc) > lun

Optional: FC target lun number

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].kaniko.volumes[].fc.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [fc](#providerskanikovolumesfc) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].fc.targetWWNs[]`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [fc](#providerskanikovolumesfc) > targetWWNs

Optional: FC target worldwide names (WWNs)

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].kaniko.volumes[].fc.wwids[]`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [fc](#providerskanikovolumesfc) > wwids

Optional: FC volume world wide identifiers (wwids) Either wwids or combination of targetWWNs and lun must be set, but not both simultaneously.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].kaniko.volumes[].flexVolume`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > flexVolume

FlexVolume represents a generic volume resource that is provisioned/attached using an exec based plugin.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].flexVolume.driver`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [flexVolume](#providerskanikovolumesflexvolume) > driver

Driver is the name of the driver to use for this volume.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].flexVolume.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [flexVolume](#providerskanikovolumesflexvolume) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". The default filesystem depends on FlexVolume script.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].flexVolume.options`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [flexVolume](#providerskanikovolumesflexvolume) > options

Optional: Extra command options if any.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].flexVolume.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [flexVolume](#providerskanikovolumesflexvolume) > readOnly

Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].flexVolume.secretRef`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [flexVolume](#providerskanikovolumesflexvolume) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].flexVolume.secretRef.name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [flexVolume](#providerskanikovolumesflexvolume) > [secretRef](#providerskanikovolumesflexvolumesecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].flocker`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > flocker

Represents a Flocker volume mounted by the Flocker agent. One and only one of datasetName and datasetUUID should be set. Flocker volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].flocker.datasetName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [flocker](#providerskanikovolumesflocker) > datasetName

Name of the dataset stored as metadata -> name on the dataset for Flocker should be considered as deprecated

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].flocker.datasetUUID`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [flocker](#providerskanikovolumesflocker) > datasetUUID

UUID of the dataset. This is unique identifier of a Flocker dataset

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].gcePersistentDisk`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > gcePersistentDisk

Represents a Persistent Disk resource in Google Compute Engine.

A GCE PD must exist before mounting to a container. The disk must also be in the same GCE project and zone as the kubelet. A GCE PD can only be mounted as read/write once or read-only many times. GCE PDs support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].gcePersistentDisk.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [gcePersistentDisk](#providerskanikovolumesgcepersistentdisk) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].gcePersistentDisk.partition`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [gcePersistentDisk](#providerskanikovolumesgcepersistentdisk) > partition

The partition in the volume that you want to mount. If omitted, the default is to mount by volume name. Examples: For volume /dev/sda1, you specify the partition as "1". Similarly, the volume partition for /dev/sda is "0" (or you can leave the property empty). More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].kaniko.volumes[].gcePersistentDisk.pdName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [gcePersistentDisk](#providerskanikovolumesgcepersistentdisk) > pdName

Unique name of the PD resource in GCE. Used to identify the disk in GCE. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].gcePersistentDisk.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [gcePersistentDisk](#providerskanikovolumesgcepersistentdisk) > readOnly

ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].gitRepo`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > gitRepo

Represents a volume that is populated with the contents of a git repository. Git repo volumes do not support ownership management. Git repo volumes support SELinux relabeling.

DEPRECATED: GitRepo is deprecated. To provision a container with a git repo, mount an EmptyDir into an InitContainer that clones the repo using git, then mount the EmptyDir into the Pod's container.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].gitRepo.directory`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [gitRepo](#providerskanikovolumesgitrepo) > directory

Target directory name. Must not contain or start with '..'.  If '.' is supplied, the volume directory will be the git repository.  Otherwise, if specified, the volume will contain the git repository in the subdirectory with the given name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].gitRepo.repository`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [gitRepo](#providerskanikovolumesgitrepo) > repository

Repository URL

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].gitRepo.revision`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [gitRepo](#providerskanikovolumesgitrepo) > revision

Commit hash for the specified revision.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].glusterfs`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > glusterfs

Represents a Glusterfs mount that lasts the lifetime of a pod. Glusterfs volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].glusterfs.endpoints`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [glusterfs](#providerskanikovolumesglusterfs) > endpoints

EndpointsName is the endpoint name that details Glusterfs topology. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].glusterfs.path`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [glusterfs](#providerskanikovolumesglusterfs) > path

Path is the Glusterfs volume path. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].glusterfs.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [glusterfs](#providerskanikovolumesglusterfs) > readOnly

ReadOnly here will force the Glusterfs volume to be mounted with read-only permissions. Defaults to false. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].hostPath`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > hostPath

Represents a host path mapped into a pod. Host path volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].hostPath.path`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [hostPath](#providerskanikovolumeshostpath) > path

Path of the directory on the host. If the path is a symlink, it will follow the link to the real path. More info: https://kubernetes.io/docs/concepts/storage/volumes#hostpath

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].hostPath.type`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [hostPath](#providerskanikovolumeshostpath) > type

Type for HostPath Volume Defaults to "" More info: https://kubernetes.io/docs/concepts/storage/volumes#hostpath

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].iscsi`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > iscsi

Represents an ISCSI disk. ISCSI volumes can only be mounted as read/write once. ISCSI volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].iscsi.chapAuthDiscovery`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > chapAuthDiscovery

whether support iSCSI Discovery CHAP authentication

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].iscsi.chapAuthSession`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > chapAuthSession

whether support iSCSI Session CHAP authentication

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].iscsi.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#iscsi

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].iscsi.initiatorName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > initiatorName

Custom iSCSI Initiator Name. If initiatorName is specified with iscsiInterface simultaneously, new iSCSI interface <target portal>:<volume name> will be created for the connection.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].iscsi.iqn`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > iqn

Target iSCSI Qualified Name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].iscsi.iscsiInterface`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > iscsiInterface

iSCSI Interface Name that uses an iSCSI transport. Defaults to 'default' (tcp).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].iscsi.lun`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > lun

iSCSI Target Lun number.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].kaniko.volumes[].iscsi.portals[]`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > portals

iSCSI Target Portal List. The portal is either an IP or ip_addr:port if the port is other than default (typically TCP ports 860 and 3260).

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].kaniko.volumes[].iscsi.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > readOnly

ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].iscsi.secretRef`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].iscsi.secretRef.name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > [secretRef](#providerskanikovolumesiscsisecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].iscsi.targetPortal`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [iscsi](#providerskanikovolumesiscsi) > targetPortal

iSCSI Target Portal. The Portal is either an IP or ip_addr:port if the port is other than default (typically TCP ports 860 and 3260).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > name

Volume's name. Must be a DNS_LABEL and unique within the pod. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].nfs`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > nfs

Represents an NFS mount that lasts the lifetime of a pod. NFS volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].nfs.path`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [nfs](#providerskanikovolumesnfs) > path

Path that is exported by the NFS server. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].nfs.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [nfs](#providerskanikovolumesnfs) > readOnly

ReadOnly here will force the NFS export to be mounted with read-only permissions. Defaults to false. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].nfs.server`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [nfs](#providerskanikovolumesnfs) > server

Server is the hostname or IP address of the NFS server. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].persistentVolumeClaim`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > persistentVolumeClaim

PersistentVolumeClaimVolumeSource references the user's PVC in the same namespace. This volume finds the bound PV and mounts that volume for the pod. A PersistentVolumeClaimVolumeSource is, essentially, a wrapper around another type of volume that is owned by someone else (the system).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].persistentVolumeClaim.claimName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [persistentVolumeClaim](#providerskanikovolumespersistentvolumeclaim) > claimName

ClaimName is the name of a PersistentVolumeClaim in the same namespace as the pod using this volume. More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#persistentvolumeclaims

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].persistentVolumeClaim.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [persistentVolumeClaim](#providerskanikovolumespersistentvolumeclaim) > readOnly

Will force the ReadOnly setting in VolumeMounts. Default false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].photonPersistentDisk`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > photonPersistentDisk

Represents a Photon Controller persistent disk resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].photonPersistentDisk.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [photonPersistentDisk](#providerskanikovolumesphotonpersistentdisk) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].photonPersistentDisk.pdID`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [photonPersistentDisk](#providerskanikovolumesphotonpersistentdisk) > pdID

ID that identifies Photon Controller persistent disk

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].portworxVolume`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > portworxVolume

PortworxVolumeSource represents a Portworx volume resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].portworxVolume.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [portworxVolume](#providerskanikovolumesportworxvolume) > fsType

FSType represents the filesystem type to mount Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].portworxVolume.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [portworxVolume](#providerskanikovolumesportworxvolume) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].portworxVolume.volumeID`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [portworxVolume](#providerskanikovolumesportworxvolume) > volumeID

VolumeID uniquely identifies a Portworx volume

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].projected`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > projected

Represents a projected volume source

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].projected.defaultMode`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [projected](#providerskanikovolumesprojected) > defaultMode

Mode bits to use on created files by default. Must be a value between 0 and 0777. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].kaniko.volumes[].projected.sources[]`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [projected](#providerskanikovolumesprojected) > sources

list of volume projections

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].kaniko.volumes[].quobyte`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > quobyte

Represents a Quobyte mount that lasts the lifetime of a pod. Quobyte volumes do not support ownership management or SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].quobyte.group`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [quobyte](#providerskanikovolumesquobyte) > group

Group to map volume access to Default is no group

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].quobyte.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [quobyte](#providerskanikovolumesquobyte) > readOnly

ReadOnly here will force the Quobyte volume to be mounted with read-only permissions. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].quobyte.registry`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [quobyte](#providerskanikovolumesquobyte) > registry

Registry represents a single or multiple Quobyte Registry services specified as a string as host:port pair (multiple entries are separated with commas) which acts as the central registry for volumes

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].quobyte.tenant`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [quobyte](#providerskanikovolumesquobyte) > tenant

Tenant owning the given Quobyte volume in the Backend Used with dynamically provisioned Quobyte volumes, value is set by the plugin

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].quobyte.user`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [quobyte](#providerskanikovolumesquobyte) > user

User to map volume access to Defaults to serivceaccount user

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].quobyte.volume`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [quobyte](#providerskanikovolumesquobyte) > volume

Volume is a string that references an already created Quobyte volume by name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].rbd`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > rbd

Represents a Rados Block Device mount that lasts the lifetime of a pod. RBD volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].rbd.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [rbd](#providerskanikovolumesrbd) > fsType

Filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#rbd

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].rbd.image`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [rbd](#providerskanikovolumesrbd) > image

The rados image name. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].rbd.keyring`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [rbd](#providerskanikovolumesrbd) > keyring

Keyring is the path to key ring for RBDUser. Default is /etc/ceph/keyring. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].rbd.monitors[]`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [rbd](#providerskanikovolumesrbd) > monitors

A collection of Ceph monitors. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].kaniko.volumes[].rbd.pool`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [rbd](#providerskanikovolumesrbd) > pool

The rados pool name. Default is rbd. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].rbd.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [rbd](#providerskanikovolumesrbd) > readOnly

ReadOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].rbd.secretRef`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [rbd](#providerskanikovolumesrbd) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].rbd.secretRef.name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [rbd](#providerskanikovolumesrbd) > [secretRef](#providerskanikovolumesrbdsecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].rbd.user`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [rbd](#providerskanikovolumesrbd) > user

The rados user name. Default is admin. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].scaleIO`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > scaleIO

ScaleIOVolumeSource represents a persistent ScaleIO volume

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].scaleIO.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Default is "xfs".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].scaleIO.gateway`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > gateway

The host address of the ScaleIO API Gateway.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].scaleIO.protectionDomain`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > protectionDomain

The name of the ScaleIO Protection Domain for the configured storage.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].scaleIO.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].scaleIO.secretRef`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].scaleIO.secretRef.name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > [secretRef](#providerskanikovolumesscaleiosecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].scaleIO.sslEnabled`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > sslEnabled

Flag to enable/disable SSL communication with Gateway, default false

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].scaleIO.storageMode`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > storageMode

Indicates whether the storage for a volume should be ThickProvisioned or ThinProvisioned. Default is ThinProvisioned.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].scaleIO.storagePool`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > storagePool

The ScaleIO Storage Pool associated with the protection domain.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].scaleIO.system`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > system

The name of the storage system as configured in ScaleIO.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].scaleIO.volumeName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [scaleIO](#providerskanikovolumesscaleio) > volumeName

The name of a volume already created in the ScaleIO system that is associated with this volume source.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].secret`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > secret

Adapts a Secret into a volume.

The contents of the target Secret's Data field will be presented in a volume as files using the keys in the Data field as the file names. Secret volumes support ownership management and SELinux relabeling.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].secret.defaultMode`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [secret](#providerskanikovolumessecret) > defaultMode

Optional: mode bits to use on created files by default. Must be a value between 0 and 0777. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set.

| Type      | Required |
| --------- | -------- |
| `integer` | No       |

### `providers[].kaniko.volumes[].secret.items[]`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [secret](#providerskanikovolumessecret) > items

If unspecified, each key-value pair in the Data field of the referenced Secret will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the Secret, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].kaniko.volumes[].secret.optional`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [secret](#providerskanikovolumessecret) > optional

Specify whether the Secret or its keys must be defined

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].secret.secretName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [secret](#providerskanikovolumessecret) > secretName

Name of the secret in the pod's namespace to use. More info: https://kubernetes.io/docs/concepts/storage/volumes#secret

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].storageos`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > storageos

Represents a StorageOS persistent volume resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].storageos.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [storageos](#providerskanikovolumesstorageos) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].storageos.readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [storageos](#providerskanikovolumesstorageos) > readOnly

Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumes[].storageos.secretRef`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [storageos](#providerskanikovolumesstorageos) > secretRef

LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].storageos.secretRef.name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [storageos](#providerskanikovolumesstorageos) > [secretRef](#providerskanikovolumesstorageossecretref) > name

Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].storageos.volumeName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [storageos](#providerskanikovolumesstorageos) > volumeName

VolumeName is the human-readable name of the StorageOS volume.  Volume names are only unique within a namespace.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].storageos.volumeNamespace`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [storageos](#providerskanikovolumesstorageos) > volumeNamespace

VolumeNamespace specifies the scope of the volume within StorageOS.  If no namespace is specified then the Pod's namespace will be used.  This allows the Kubernetes name scoping to be mirrored within StorageOS for tighter integration. Set VolumeName to any name to override the default behaviour. Set to "default" if you are not using namespaces within StorageOS. Namespaces that do not pre-exist within StorageOS will be created.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].vsphereVolume`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > vsphereVolume

Represents a vSphere volume resource.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.volumes[].vsphereVolume.fsType`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [vsphereVolume](#providerskanikovolumesvspherevolume) > fsType

Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].vsphereVolume.storagePolicyID`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [vsphereVolume](#providerskanikovolumesvspherevolume) > storagePolicyID

Storage Policy Based Management (SPBM) profile ID associated with the StoragePolicyName.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].vsphereVolume.storagePolicyName`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [vsphereVolume](#providerskanikovolumesvspherevolume) > storagePolicyName

Storage Policy Based Management (SPBM) profile name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumes[].vsphereVolume.volumePath`

[providers](#providers) > [kaniko](#providerskaniko) > [volumes](#providerskanikovolumes) > [vsphereVolume](#providerskanikovolumesvspherevolume) > volumePath

Path that identifies vSphere volume vmdk

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumeMounts[]`

[providers](#providers) > [kaniko](#providerskaniko) > volumeMounts

A list of volume mounts, referencing the volumes defined in the `volumes` field, specifying how and where to mount the volume in the Kaniko Pod container. The schema for this field is the same as on the `containers[].volumeMounts` field on a Pod spec, and is passed directly to the Kaniko Pod container spec.

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `array[customObject]` | `[]`    | No       |

Example:

```yaml
providers:
  - kaniko:
      ...
      volumeMounts:
        name: my-auth-secret
        mountPath: /.my-custom-auth
```

### `providers[].kaniko.volumeMounts[].mountPath`

[providers](#providers) > [kaniko](#providerskaniko) > [volumeMounts](#providerskanikovolumemounts) > mountPath

Path within the container at which the volume should be mounted.  Must not contain ':'.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumeMounts[].mountPropagation`

[providers](#providers) > [kaniko](#providerskaniko) > [volumeMounts](#providerskanikovolumemounts) > mountPropagation

mountPropagation determines how mounts are propagated from the host to container and the other way around. When not set, MountPropagationNone is used. This field is beta in 1.10.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumeMounts[].name`

[providers](#providers) > [kaniko](#providerskaniko) > [volumeMounts](#providerskanikovolumemounts) > name

This must match the Name of a Volume.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumeMounts[].readOnly`

[providers](#providers) > [kaniko](#providerskaniko) > [volumeMounts](#providerskanikovolumemounts) > readOnly

Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].kaniko.volumeMounts[].subPath`

[providers](#providers) > [kaniko](#providerskaniko) > [volumeMounts](#providerskanikovolumemounts) > subPath

Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's root).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.volumeMounts[].subPathExpr`

[providers](#providers) > [kaniko](#providerskaniko) > [volumeMounts](#providerskanikovolumemounts) > subPathExpr

Expanded path within the volume from which the container's volume should be mounted. Behaves similarly to SubPath but environment variable references $(VAR_NAME) are expanded using the container's environment. Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].defaultHostname`

[providers](#providers) > defaultHostname

A default hostname to use when no hostname is explicitly configured for a service.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
providers:
  - defaultHostname: "api.mydomain.com"
```

### `providers[].deploymentStrategy`

[providers](#providers) > deploymentStrategy
> ⚠️ **Experimental**: this is an experimental feature and the API might change in the future.

Defines the strategy for deploying the project services.
Default is "rolling update" and there is experimental support for "blue/green" deployment.
The feature only supports modules of type `container`: other types will just deploy using the default strategy.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"rolling"` | No       |

### `providers[].forceSsl`

[providers](#providers) > forceSsl

Require SSL on all `container` module services. If set to true, an error is raised when no certificate is available for a configured hostname on a `container` module.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].imagePullSecrets[]`

[providers](#providers) > imagePullSecrets

References to `docker-registry` secrets to use for authenticating with remote registries when pulling
images. This is necessary if you reference private images in your module configuration, and is required
when configuring a remote Kubernetes environment with buildMode=local.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].imagePullSecrets[].name`

[providers](#providers) > [imagePullSecrets](#providersimagepullsecrets) > name

The name of the Kubernetes secret.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - imagePullSecrets:
      - name: "my-secret"
```

### `providers[].imagePullSecrets[].namespace`

[providers](#providers) > [imagePullSecrets](#providersimagepullsecrets) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"default"` | No       |

### `providers[].resources`

[providers](#providers) > resources

Resource requests and limits for the in-cluster builder, container registry and code sync service. (which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).

| Type     | Default                                                                                                                                                                                                                                                    | Required |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `object` | `{"builder":{"limits":{"cpu":4000,"memory":8192},"requests":{"cpu":200,"memory":512}},"registry":{"limits":{"cpu":2000,"memory":4096},"requests":{"cpu":200,"memory":512}},"sync":{"limits":{"cpu":500,"memory":512},"requests":{"cpu":100,"memory":64}}}` | No       |

### `providers[].resources.builder`

[providers](#providers) > [resources](#providersresources) > builder

Resource requests and limits for the in-cluster builder.

When `buildMode` is `cluster-docker`, this refers to the Docker Daemon that is installed and run
cluster-wide. This is shared across all users and builds, so it should be resourced accordingly, factoring
in how many concurrent builds you expect and how heavy your builds tend to be.

When `buildMode` is `kaniko`, this refers to _each instance_ of Kaniko, so you'd generally use lower
limits/requests, but you should evaluate based on your needs.

| Type     | Default                                                                     | Required |
| -------- | --------------------------------------------------------------------------- | -------- |
| `object` | `{"limits":{"cpu":4000,"memory":8192},"requests":{"cpu":200,"memory":512}}` | No       |

### `providers[].resources.builder.limits`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > limits

| Type     | Default                      | Required |
| -------- | ---------------------------- | -------- |
| `object` | `{"cpu":4000,"memory":8192}` | No       |

### `providers[].resources.builder.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [limits](#providersresourcesbuilderlimits) > cpu

CPU limit in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `4000`  | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        limits:
          ...
          cpu: 4000
```

### `providers[].resources.builder.limits.memory`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [limits](#providersresourcesbuilderlimits) > memory

Memory limit in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `8192`  | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        limits:
          ...
          memory: 8192
```

### `providers[].resources.builder.requests`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > requests

| Type     | Default                    | Required |
| -------- | -------------------------- | -------- |
| `object` | `{"cpu":200,"memory":512}` | No       |

### `providers[].resources.builder.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [requests](#providersresourcesbuilderrequests) > cpu

CPU request in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `200`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        requests:
          ...
          cpu: 200
```

### `providers[].resources.builder.requests.memory`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [requests](#providersresourcesbuilderrequests) > memory

Memory request in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `512`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        requests:
          ...
          memory: 512
```

### `providers[].resources.registry`

[providers](#providers) > [resources](#providersresources) > registry

Resource requests and limits for the in-cluster image registry. Built images are pushed to this registry,
so that they are available to all the nodes in your cluster.

This is shared across all users and builds, so it should be resourced accordingly, factoring
in how many concurrent builds you expect and how large your images tend to be.

| Type     | Default                                                                     | Required |
| -------- | --------------------------------------------------------------------------- | -------- |
| `object` | `{"limits":{"cpu":2000,"memory":4096},"requests":{"cpu":200,"memory":512}}` | No       |

### `providers[].resources.registry.limits`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > limits

| Type     | Default                      | Required |
| -------- | ---------------------------- | -------- |
| `object` | `{"cpu":2000,"memory":4096}` | No       |

### `providers[].resources.registry.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [limits](#providersresourcesregistrylimits) > cpu

CPU limit in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `2000`  | No       |

Example:

```yaml
providers:
  - resources:
      ...
      registry:
        ...
        limits:
          ...
          cpu: 2000
```

### `providers[].resources.registry.limits.memory`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [limits](#providersresourcesregistrylimits) > memory

Memory limit in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `4096`  | No       |

Example:

```yaml
providers:
  - resources:
      ...
      registry:
        ...
        limits:
          ...
          memory: 4096
```

### `providers[].resources.registry.requests`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > requests

| Type     | Default                    | Required |
| -------- | -------------------------- | -------- |
| `object` | `{"cpu":200,"memory":512}` | No       |

### `providers[].resources.registry.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [requests](#providersresourcesregistryrequests) > cpu

CPU request in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `200`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      registry:
        ...
        requests:
          ...
          cpu: 200
```

### `providers[].resources.registry.requests.memory`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [requests](#providersresourcesregistryrequests) > memory

Memory request in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `512`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      registry:
        ...
        requests:
          ...
          memory: 512
```

### `providers[].resources.sync`

[providers](#providers) > [resources](#providersresources) > sync

Resource requests and limits for the code sync service, which we use to sync build contexts to the cluster
ahead of building images. This generally is not resource intensive, but you might want to adjust the
defaults if you have many concurrent users.

| Type     | Default                                                                  | Required |
| -------- | ------------------------------------------------------------------------ | -------- |
| `object` | `{"limits":{"cpu":500,"memory":512},"requests":{"cpu":100,"memory":64}}` | No       |

### `providers[].resources.sync.limits`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > limits

| Type     | Default                    | Required |
| -------- | -------------------------- | -------- |
| `object` | `{"cpu":500,"memory":512}` | No       |

### `providers[].resources.sync.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [limits](#providersresourcessynclimits) > cpu

CPU limit in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `500`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        limits:
          ...
          cpu: 500
```

### `providers[].resources.sync.limits.memory`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [limits](#providersresourcessynclimits) > memory

Memory limit in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `512`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        limits:
          ...
          memory: 512
```

### `providers[].resources.sync.requests`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > requests

| Type     | Default                   | Required |
| -------- | ------------------------- | -------- |
| `object` | `{"cpu":100,"memory":64}` | No       |

### `providers[].resources.sync.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [requests](#providersresourcessyncrequests) > cpu

CPU request in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `100`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        requests:
          ...
          cpu: 100
```

### `providers[].resources.sync.requests.memory`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [requests](#providersresourcessyncrequests) > memory

Memory request in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `64`    | No       |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        requests:
          ...
          memory: 64
```

### `providers[].storage`

[providers](#providers) > storage

Storage parameters to set for the in-cluster builder, container registry and code sync persistent volumes
(which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).

These are all shared cluster-wide across all users and builds, so they should be resourced accordingly,
factoring in how many concurrent builds you expect and how large your images and build contexts tend to be.

| Type     | Default                                                                                                                                                              | Required |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `object` | `{"builder":{"size":20480,"storageClass":null},"nfs":{"storageClass":null},"registry":{"size":20480,"storageClass":null},"sync":{"size":10240,"storageClass":null}}` | No       |

### `providers[].storage.builder`

[providers](#providers) > [storage](#providersstorage) > builder

Storage parameters for the data volume for the in-cluster Docker Daemon.

Only applies when `buildMode` is set to `cluster-docker`, ignored otherwise.

| Type     | Default                              | Required |
| -------- | ------------------------------------ | -------- |
| `object` | `{"size":20480,"storageClass":null}` | No       |

### `providers[].storage.builder.size`

[providers](#providers) > [storage](#providersstorage) > [builder](#providersstoragebuilder) > size

Volume size in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `20480` | No       |

### `providers[].storage.builder.storageClass`

[providers](#providers) > [storage](#providersstorage) > [builder](#providersstoragebuilder) > storageClass

Storage class to use for the volume.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `null`  | No       |

### `providers[].storage.nfs`

[providers](#providers) > [storage](#providersstorage) > nfs

Storage parameters for the NFS provisioner, which we automatically create for the sync volume, _unless_
you specify a `storageClass` for the sync volume. See the below `sync` parameter for more.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"storageClass":null}` | No       |

### `providers[].storage.nfs.storageClass`

[providers](#providers) > [storage](#providersstorage) > [nfs](#providersstoragenfs) > storageClass

Storage class to use as backing storage for NFS .

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `null`  | No       |

### `providers[].storage.registry`

[providers](#providers) > [storage](#providersstorage) > registry

Storage parameters for the in-cluster Docker registry volume. Built images are stored here, so that they
are available to all the nodes in your cluster.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type     | Default                              | Required |
| -------- | ------------------------------------ | -------- |
| `object` | `{"size":20480,"storageClass":null}` | No       |

### `providers[].storage.registry.size`

[providers](#providers) > [storage](#providersstorage) > [registry](#providersstorageregistry) > size

Volume size in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `20480` | No       |

### `providers[].storage.registry.storageClass`

[providers](#providers) > [storage](#providersstorage) > [registry](#providersstorageregistry) > storageClass

Storage class to use for the volume.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `null`  | No       |

### `providers[].storage.sync`

[providers](#providers) > [storage](#providersstorage) > sync

Storage parameters for the code sync volume, which build contexts are synced to ahead of running
in-cluster builds.

Important: The storage class configured here has to support _ReadWriteMany_ access.
If you don't specify a storage class, Garden creates an NFS provisioner and provisions an
NFS volume for the sync data volume.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type     | Default                              | Required |
| -------- | ------------------------------------ | -------- |
| `object` | `{"size":10240,"storageClass":null}` | No       |

### `providers[].storage.sync.size`

[providers](#providers) > [storage](#providersstorage) > [sync](#providersstoragesync) > size

Volume size in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `10240` | No       |

### `providers[].storage.sync.storageClass`

[providers](#providers) > [storage](#providersstorage) > [sync](#providersstoragesync) > storageClass

Storage class to use for the volume.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `null`  | No       |

### `providers[].tlsCertificates[]`

[providers](#providers) > tlsCertificates

One or more certificates to use for ingress.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].tlsCertificates[].name`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > name

A unique identifier for this certificate.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - tlsCertificates:
      - name: "www"
```

### `providers[].tlsCertificates[].hostnames[]`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > hostnames

A list of hostnames that this certificate should be used for. If you don't specify these, they will be automatically read from the certificate.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
providers:
  - tlsCertificates:
      - hostnames:
          - www.mydomain.com
```

### `providers[].tlsCertificates[].secretRef`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > secretRef

A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

Example:

```yaml
providers:
  - tlsCertificates:
      - secretRef:
            name: my-tls-secret
            namespace: default
```

### `providers[].tlsCertificates[].secretRef.name`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > [secretRef](#providerstlscertificatessecretref) > name

The name of the Kubernetes secret.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - tlsCertificates:
      - secretRef:
            name: my-tls-secret
            namespace: default
          ...
          name: "my-secret"
```

### `providers[].tlsCertificates[].secretRef.namespace`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > [secretRef](#providerstlscertificatessecretref) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"default"` | No       |

### `providers[].tlsCertificates[].managedBy`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > managedBy

Set to `cert-manager` to configure [cert-manager](https://github.com/jetstack/cert-manager) to manage this
certificate. See our
[cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
providers:
  - tlsCertificates:
      - managedBy: "cert-manager"
```

### `providers[].certManager`

[providers](#providers) > certManager

cert-manager configuration, for creating and managing TLS certificates. See the
[cert-manager guide](https://docs.garden.io/advanced/cert-manager-integration) for details.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].certManager.install`

[providers](#providers) > [certManager](#providerscertmanager) > install

Automatically install `cert-manager` on initialization. See the
[cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].certManager.email`

[providers](#providers) > [certManager](#providerscertmanager) > email

The email to use when requesting Let's Encrypt certificates.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - certManager:
      ...
      email: "yourname@example.com"
```

### `providers[].certManager.issuer`

[providers](#providers) > [certManager](#providerscertmanager) > issuer

The type of issuer for the certificate (only ACME is supported for now).

| Type     | Default  | Required |
| -------- | -------- | -------- |
| `string` | `"acme"` | No       |

Example:

```yaml
providers:
  - certManager:
      ...
      issuer: "acme"
```

### `providers[].certManager.acmeServer`

[providers](#providers) > [certManager](#providerscertmanager) > acmeServer

Specify which ACME server to request certificates from. Currently Let's Encrypt staging and prod servers are supported.

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `string` | `"letsencrypt-staging"` | No       |

Example:

```yaml
providers:
  - certManager:
      ...
      acmeServer: "letsencrypt-staging"
```

### `providers[].certManager.acmeChallengeType`

[providers](#providers) > [certManager](#providerscertmanager) > acmeChallengeType

The type of ACME challenge used to validate hostnames and generate the certificates (only HTTP-01 is supported for now).

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"HTTP-01"` | No       |

Example:

```yaml
providers:
  - certManager:
      ...
      acmeChallengeType: "HTTP-01"
```

### `providers[].systemNodeSelector`

[providers](#providers) > systemNodeSelector

Exposes the `nodeSelector` field on the PodSpec of system services. This allows you to constrain
the system services to only run on particular nodes. [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
providers:
  - systemNodeSelector:
        disktype: ssd
```

### `providers[].registryProxyTolerations[]`

[providers](#providers) > registryProxyTolerations

For setting tolerations on the registry-proxy when using in-cluster building.
The registry-proxy is a DaemonSet that proxies connections to the docker registry service on each node.

Use this only if you're doing in-cluster building and the nodes in your cluster
have [taints](https://kubernetes.io/docs/concepts/configuration/taint-and-toleration/).

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].registryProxyTolerations[].effect`

[providers](#providers) > [registryProxyTolerations](#providersregistryproxytolerations) > effect

"Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].registryProxyTolerations[].key`

[providers](#providers) > [registryProxyTolerations](#providersregistryproxytolerations) > key

"Key" is the taint key that the toleration applies to. Empty means match all taint keys.
If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].registryProxyTolerations[].operator`

[providers](#providers) > [registryProxyTolerations](#providersregistryproxytolerations) > operator

"Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal". Defaults to
"Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
particular category.

| Type     | Default   | Required |
| -------- | --------- | -------- |
| `string` | `"Equal"` | No       |

### `providers[].registryProxyTolerations[].tolerationSeconds`

[providers](#providers) > [registryProxyTolerations](#providersregistryproxytolerations) > tolerationSeconds

"TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
by the system.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].registryProxyTolerations[].value`

[providers](#providers) > [registryProxyTolerations](#providersregistryproxytolerations) > value

"Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be empty,
otherwise just a regular string.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type     | Default              | Required |
| -------- | -------------------- | -------- |
| `string` | `"local-kubernetes"` | Yes      |

Example:

```yaml
providers:
  - name: "local-kubernetes"
```

### `providers[].context`

[providers](#providers) > context

The kubectl context to use to connect to the Kubernetes cluster.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
providers:
  - context: "my-dev-context"
```

### `providers[].namespace`

[providers](#providers) > namespace

Specify which namespace to deploy services to (defaults to the project name). Note that the framework generates other namespaces as well with this name as a prefix.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].setupIngressController`

[providers](#providers) > setupIngressController

Set this to null or false to skip installing/enabling the `nginx` ingress controller.

| Type     | Default   | Required |
| -------- | --------- | -------- |
| `string` | `"nginx"` | No       |


## Outputs

The following keys are available via the `${providers.<provider-name>}` template string key for `local-kubernetes` providers.

### `${providers.<provider-name>.outputs.app-namespace}`

The primary namespace used for resource deployments.

| Type     |
| -------- |
| `string` |

### `${providers.<provider-name>.outputs.default-hostname}`

The default hostname configured on the provider.

| Type     |
| -------- |
| `string` |

### `${providers.<provider-name>.outputs.metadata-namespace}`

The namespace used for Garden metadata.

| Type     |
| -------- |
| `string` |
