/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
} from "../../../../../../../src/plugins/kubernetes/container/build/kaniko"
import { expect } from "chai"
import {
  defaultResources,
  DEFAULT_KANIKO_IMAGE,
  KubernetesProvider,
} from "../../../../../../../src/plugins/kubernetes/config"
import { k8sUtilImageName } from "../../../../../../../src/plugins/kubernetes/constants"
import { DeepPartial } from "utility-types"

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
          commandStr: "build command",
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
              command: ["sh", "-c", "build command"],
              image: DEFAULT_KANIKO_IMAGE,
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
                'echo "Copying from sourceURL to /.garden/context"\nmkdir -p /.garden/context\nn=0\nuntil [ "$n" -ge 30 ]\ndo\n  rsync arg1 arg2 && break\n  n=$((n+1))\n  sleep 1\ndone\necho "Done!"',
              ],
              image: k8sUtilImageName,
              imagePullPolicy: "IfNotPresent",
              name: "init",
              volumeMounts: [
                {
                  mountPath: "/.garden",
                  name: "comms",
                },
              ],
            },
          ],
          shareProcessNamespace: true,
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
        commandStr: "build command",
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
