/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CloudProject, GetSecretsParams } from "../../src/cloud/api.js"
import { CloudApi } from "../../src/cloud/api.js"
import type { Log } from "../../src/logger/log-entry.js"
import { GlobalConfigStore } from "../../src/config-store/global.js"
import { uuidv4 } from "../../src/util/random.js"
import type { StringMap } from "../../src/config/common.js"

export const apiProjectId = uuidv4()
export const apiRemoteOriginUrl = "git@github.com:garden-io/garden.git"
// The sha512 hash of "test-project-a"
export const apiProjectName =
  "95048f63dc14db38ed4138ffb6ff89992abdc19b8c899099c52a94f8fcc0390eec6480385cfa5014f84c0a14d4984825ce3bf25db1386d2b5382b936899df675"

export class FakeCloudApi extends CloudApi {
  static override async factory(params: { log: Log; skipLogging?: boolean }) {
    return new FakeCloudApi({
      log: params.log,
      domain: "https://garden.io",
      globalConfigStore: new GlobalConfigStore(),
    })
  }

  override async getProfile() {
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
    }
  }

  override async getAllProjects(): Promise<CloudProject[]> {
    return [(await this.getProjectById(apiProjectId))!]
  }

  override async createProject(name: string): Promise<CloudProject> {
    return {
      id: apiProjectId,
      name,
      repositoryUrl: apiRemoteOriginUrl,
      environments: [],
    }
  }

  override async getProjectByName(name: string): Promise<CloudProject | undefined> {
    return {
      id: apiProjectId,
      name,
      repositoryUrl: apiRemoteOriginUrl,
      environments: [],
    }
  }

  override async getProjectById(_: string): Promise<CloudProject> {
    return {
      id: apiProjectId,
      name: apiProjectName,
      repositoryUrl: apiRemoteOriginUrl,
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
