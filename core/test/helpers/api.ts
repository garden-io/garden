/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
  CloudApiFactoryParams,
  CloudOrganization,
  CloudProject,
  GetSecretsParams,
} from "../../src/cloud/api-legacy/api.js"
import { GardenCloudApiLegacy } from "../../src/cloud/api-legacy/api.js"
import { uuidv4 } from "../../src/util/random.js"
import type { StringMap } from "../../src/config/common.js"
import type { GetProfileResponse } from "@garden-io/platform-api-types"

export const dummyOrganization: CloudOrganization = { id: uuidv4(), name: "test-org" } as const

export const apiProjectId = uuidv4()
export const apiRemoteOriginUrl = "git@github.com:garden-io/garden.git"
// The sha512 hash of "test-project-a"
export const apiProjectName =
  "95048f63dc14db38ed4138ffb6ff89992abdc19b8c899099c52a94f8fcc0390eec6480385cfa5014f84c0a14d4984825ce3bf25db1386d2b5382b936899df675"

export class FakeGardenCloudApi extends GardenCloudApiLegacy {
  static override async factory(params: CloudApiFactoryParams) {
    return new FakeGardenCloudApi({
      log: params.log,
      domain: params.cloudDomain,
      projectId: params.projectId,
      globalConfigStore: params.globalConfigStore,
    })
  }

  override async getProfile(): Promise<GetProfileResponse["data"]> {
    return {
      id: "1",
      createdAt: new Date().toString(),
      updatedAt: new Date().toString(),
      name: "gordon",
      vcsUsername: "gordon@garden.io",
      serviceAccount: false,
      organization: {
        id: "1",
        name: "garden",
      },
      cachedPermissions: {},
      accessTokens: [],
      groups: [],
      meta: {},
      singleProjectId: "",
      singleProjectOrgId: "",
      organizations: [],
    }
  }

  override async createProject(name: string): Promise<CloudProject> {
    return {
      id: apiProjectId,
      name,
      repositoryUrl: apiRemoteOriginUrl,
      organization: dummyOrganization,
      environments: [],
    }
  }

  override async getProjectByName(name: string): Promise<CloudProject | undefined> {
    return {
      id: apiProjectId,
      name,
      repositoryUrl: apiRemoteOriginUrl,
      organization: dummyOrganization,
      environments: [],
    }
  }

  override async getProjectById(_: string): Promise<CloudProject> {
    return {
      id: apiProjectId,
      name: apiProjectName,
      repositoryUrl: apiRemoteOriginUrl,
      organization: dummyOrganization,
      environments: [],
    }
  }

  override async getSecrets(_: GetSecretsParams): Promise<StringMap> {
    return {}
  }

  override async checkClientAuthToken(): Promise<boolean> {
    return true
  }
}
