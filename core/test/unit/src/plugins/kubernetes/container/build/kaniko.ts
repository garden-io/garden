/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  kanikoBuildFailed,
  getKanikoFlags,
  DEFAULT_KANIKO_FLAGS,
  getKanikoBuilderPodManifest,
} from "../../../../../../../src/plugins/kubernetes/container/build/kaniko.js"
import { expect } from "chai"
import type { KubernetesProvider } from "../../../../../../../src/plugins/kubernetes/config.js"
import { defaultResources } from "../../../../../../../src/plugins/kubernetes/config.js"
import {
  defaultKanikoImageName,
  defaultUtilImageRegistryDomain,
  getK8sUtilImagePath,
} from "../../../../../../../src/plugins/kubernetes/constants.js"
import type { DeepPartial } from "utility-types"
import { inClusterBuilderServiceAccount } from "../../../../../../../src/plugins/kubernetes/container/build/common.js"

describe("kaniko build", () => {
  it("should return as successful when immutable tag already exists in destination", () => {
    const errorMessage = `error pushing image: failed to push to destination dockerhub.com/garden/backend:v-1234567: TAG_INVALID: The image tag "v-1234567" already exists in the "garden/backend" repository and cannot be overwritten because the repository is immutable.`

    expect(
      kanikoBuildFailed({
        startedAt: new Date(),
        completedAt: new Date(),
        success: false,
        log: errorMessage,
      })
    ).to.be.false
  })

  it("should return as failure when other error messages are present", () => {
    const errorMessage = `error uploading layer to cache: failed to push to destination dockerhub.com/garden/backend:v-1234567: TAG_INVALID: The image tag "v-1234567" already exists in the "garden / backend" repository and cannot be overwritten because the repository is immutable.`

    expect(
      kanikoBuildFailed({
        startedAt: new Date(),
        completedAt: new Date(),
        success: false,
        log: errorMessage,
      })
    ).to.be.true
  })

  it("should return as success when the build succeeded", () => {
    expect(
      kanikoBuildFailed({
        startedAt: new Date(),
        completedAt: new Date(),
        success: true,
        log: "",
      })
    ).to.be.false
  })

  describe("getKanikoBuilderPodManifest", () => {
    const _provider: DeepPartial<KubernetesProvider> = {
      config: {
        utilImageRegistryDomain: defaultUtilImageRegistryDomain,
        kaniko: {},
        resources: {
          ...defaultResources,
        },
      },
    }
    let provider = _provider as KubernetesProvider
    beforeEach(() => {
      provider = _provider as KubernetesProvider
    })

    it("should return a Kubernetes Pod manifest for kaniko building", () => {
      expect(
        getKanikoBuilderPodManifest({
          provider,
          podName: "builder-pod",
          kanikoCommand: ["build", "command"],
          kanikoNamespace: "namespace",
          authSecretName: "authSecret",
          syncArgs: ["arg1", "arg2"],
          imagePullSecrets: [],
          sourceUrl: "sourceURL",
        })
      ).eql({
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
          annotations: undefined,
          name: "builder-pod",
          namespace: "namespace",
        },
        spec: {
          containers: [
            {
              command: [
                "/bin/sh",
                "-c",
                "'build' 'command';\nexport exitcode=$?;\n'touch' '/.garden/done';\nexit $exitcode;",
              ],
              image: defaultKanikoImageName,
              name: "kaniko",
              resources: {
                limits: {
                  cpu: "4",
                  memory: "8Gi",
                },
                requests: {
                  cpu: "100m",
                  memory: "512Mi",
                },
              },
              volumeMounts: [
                {
                  mountPath: "/kaniko/.docker",
                  name: "authSecret",
                  readOnly: true,
                },
                {
                  mountPath: "/.garden",
                  name: "comms",
                },
              ],
            },
          ],
          imagePullSecrets: [],
          initContainers: [
            {
              command: [
                "/bin/sh",
                "-c",
                'echo "Copying from $SYNC_SOURCE_URL to $SYNC_CONTEXT_PATH"\nmkdir -p "$SYNC_CONTEXT_PATH"\nn=0\nuntil [ "$n" -ge 30 ]\ndo\n  rsync \'arg1\' \'arg2\' && break\n  n=$((n+1))\n  sleep 1\ndone\necho "Done!"',
              ],
              image: getK8sUtilImagePath(provider.config.utilImageRegistryDomain),
              imagePullPolicy: "IfNotPresent",
              name: "init",
              volumeMounts: [
                {
                  mountPath: "/.garden",
                  name: "comms",
                },
              ],
              env: [
                {
                  name: "SYNC_SOURCE_URL",
                  value: "sourceURL",
                },
                {
                  name: "SYNC_CONTEXT_PATH",
                  value: "/.garden/context",
                },
              ],
            },
          ],
          shareProcessNamespace: true,
          serviceAccountName: inClusterBuilderServiceAccount,
          tolerations: [
            {
              effect: "NoSchedule",
              key: "garden-build",
              operator: "Equal",
              value: "true",
            },
          ],
          volumes: [
            {
              name: "authSecret",
              secret: {
                items: [
                  {
                    key: ".dockerconfigjson",
                    path: "config.json",
                  },
                ],
                secretName: "authSecret",
              },
            },
            {
              emptyDir: {},
              name: "comms",
            },
          ],
        },
      })
    })

    it("should return a Kubernetes Pod manifest with configured annotations", () => {
      provider.config.kaniko!.annotations = {
        builderAnnotation: "is-there",
      }

      provider.config.kaniko!.util = {
        annotations: {
          utilAnnotation: "not-there",
        },
      }

      const manifest = getKanikoBuilderPodManifest({
        provider,
        podName: "builder-pod",
        kanikoCommand: ["build", "command"],
        kanikoNamespace: "namespace",
        authSecretName: "authSecret",
        syncArgs: ["arg1", "arg2"],
        imagePullSecrets: [],
        sourceUrl: "sourceURL",
      })

      expect(manifest.metadata.annotations).eql(provider.config.kaniko!.annotations)
    })
  })

  describe("getKanikoFlags", () => {
    it("should only keep all declarations of each flag + the defaults", () => {
      expect(getKanikoFlags(["--here=first", "--here=again"])).to.deep.equal([
        "--here=first",
        "--here=again",
        "--cache=true",
      ])
    })
    it("should allow overriding default flags", () => {
      const overridenFlags = DEFAULT_KANIKO_FLAGS.map((f) => f + "cat")
      expect(getKanikoFlags(overridenFlags)).to.deep.equal(overridenFlags)
    })

    it("should allow toggles", () => {
      expect(getKanikoFlags(["--myToggle"])).to.deep.equal(["--myToggle", "--cache=true"])
    })

    it("should allow options with dashes", () => {
      expect(getKanikoFlags(["--my-toggle", "--my-name=banana"])).to.deep.equal([
        "--my-toggle",
        "--my-name=banana",
        "--cache=true",
      ])
    })

    it("should throw if a flag is malformed", () => {
      expect(() => getKanikoFlags(["--here=first", "-my-flag"])).to.throw(/Invalid format for a kaniko flag/)
    })

    it("should return --cache=true when extraFlags is empty", () => {
      expect(getKanikoFlags([])).to.deep.equal(DEFAULT_KANIKO_FLAGS)
      expect(getKanikoFlags()).to.deep.equal(DEFAULT_KANIKO_FLAGS)
    })

    it("should merge multiple flags if top level flags are provided", () => {
      expect(getKanikoFlags(["--myToggle"], ["--cat=fast"])).to.deep.equal(["--myToggle", "--cat=fast", "--cache=true"])
    })

    it("should make leftmost flags win", () => {
      expect(getKanikoFlags(["--cat=slow"], ["--cat=fast"])).to.deep.equal(["--cat=slow", "--cache=true"])
    })
  })
})
