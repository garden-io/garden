/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/consistent-type-imports */
export declare const appRouter: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
  {
    ctx: any
    meta: object
    errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
    transformer: true
  },
  import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
    account: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      {
        getCurrentAccount: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            email: string
          } | null
        }>
        register: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            email: string
            password: string
            port?: number | undefined
          }
          output: {
            redirectTo: string
          }
        }>
        authenticate: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            email: string
            password: string
            port?: number | undefined
          }
          output: {
            redirectTo: string
          }
        }>
        clearSession: import("@trpc/server").TRPCMutationProcedure<{
          input: void
          output: {
            redirectTo: string
          }
        }>
        oauthUrlRedirect: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            provider: "github"
            port?: number | undefined
          }
          output: {
            url: string
          }
        }>
        authenticateGrow: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
        }>
        githubOauthCallback: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
        }>
      }
    >
    cloudBuilder: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      {
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            id: string
          }
          output:
            | {
                id: string
                imageNameAndTag: string
                builder: string
                createdBy: string
                author: {
                  id: string
                  name: string
                }
                createdAt: Date
                status: "pending" | "completed" | "failed"
                platform: "linux/amd64" | "linux/arm64" | "windows/amd64"
                sha256: string
                totalTiming: number
                timing: {
                  startup: number
                  build: number
                  cleanup: number
                }
              }
            | undefined
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            cursor?: number | undefined
            perPage?: number | undefined
          }
          output: {
            items: {
              id: string
              imageNameAndTag: string
              builder: string
              createdBy: string
              author: {
                id: string
                name: string
              }
              createdAt: Date
              status: "pending" | "completed" | "failed"
              platform: "linux/amd64" | "linux/arm64" | "windows/amd64"
              sha256: string
              totalTiming: number
              timing: {
                startup: number
                build: number
                cleanup: number
              }
            }[]
            nextCursor: number | undefined
          }
        }>
        registerBuild: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            platforms: string[]
            mtlsClientPublicKeyPEM?: string | undefined
          }
          output: {
            version: "v2"
            availability:
              | {
                  reason: string
                  available: false
                }
              | {
                  available: true
                  buildx: {
                    clientCertificatePem: string
                    endpoints: {
                      platform: string
                      serverCaPem: string
                      mtlsEndpoint: string
                    }[]
                    privateKeyPem?: string | undefined
                  }
                }
          }
        }>
      }
    >
    commandRun: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      {
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            status: "unknown" | "active" | "success" | "error" | "cancelled"
            completedAt: Date | null
            startedAt: Date
            command: string
            clientVersion: string
            gitRepositoryUrl: string | null
            gitBranchName: string | null
            gitCommitHash: string | null
            gitIsDirty: boolean | null
          }
          output: {
            status: "unknown" | "active" | "success" | "error" | "cancelled"
            id: string
            createdAt: Date
            updatedAt: Date
            completedAt: Date
            startedAt: Date
            organizationId: string
            accountId: string
            command: string
            clientVersion: string
            gitRepositoryUrl: string
            gitBranchName: string
            gitCommitHash: string
            gitIsDirty: boolean
          }
        }>
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            commandRunId: string
          }
          output: {
            commandRun: {
              status: "unknown" | "active" | "success" | "error" | "cancelled"
              id: string
              createdAt: Date
              updatedAt: Date
              completedAt: Date
              startedAt: Date
              organizationId: string
              accountId: string
              command: string
              clientVersion: string
              gitRepositoryUrl: string
              gitBranchName: string
              gitCommitHash: string
              gitIsDirty: boolean
            }
            actionRuns: {
              id: string
              createdAt: Date
              updatedAt: Date
              completedAt: Date | null
              actionUid: string
              actionName: string
              actionType: string
              actionVersion: string
              actionVersionResolved: string | null
              actionState: "unknown" | "getting-status" | "cached" | "not-ready" | "processing" | "failed" | "ready"
              actionOutputs: Record<string, unknown>
              startedAt: Date
              force: boolean
              durationMs: number | null
              commandRunId: string
            }[]
          }
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            cursor?: number | undefined
            perPage?: number | undefined
            sortOrder?: "asc" | "desc" | undefined
            dates?:
              | {
                  from?: number | undefined
                  to?: number | undefined
                }
              | undefined
          }
          output: {
            items: {
              status: "unknown" | "active" | "success" | "error" | "cancelled"
              id: string
              createdAt: Date
              updatedAt: Date
              completedAt: Date
              startedAt: Date
              organizationId: string
              accountId: string
              command: string
              clientVersion: string
              gitRepositoryUrl: string
              gitBranchName: string
              gitCommitHash: string
              gitIsDirty: boolean
            }[]
            nextCursor: number | undefined
          }
        }>
        timelineChart: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            sortOrder?: "asc" | "desc" | undefined
            dates?:
              | {
                  from?: number | undefined
                  to?: number | undefined
                }
              | undefined
          }
          output: {
            unknown: number
            failed: number
            timestamp: number
            active: number
            cancelled: number
            successful: number
          }[]
        }>
      }
    >
    dockerBuild: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      {
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            status: "success" | "failure"
            completedAt: Date
            startedAt: Date
            runtime: {
              actual: "buildx" | "cloud-builder" | "garden-k8s-kaniko" | "garden-k8s-buildkit"
              preferred?:
                | {
                    fallbackReason: string
                    runtime: "buildx" | "cloud-builder" | "garden-k8s-kaniko" | "garden-k8s-buildkit"
                  }
                | undefined
            }
            runtimeMetadata: {
              docker: {
                clientVersion: string
                serverVersion: string
              }
              builder: {
                implicitName: string
                isDefault: boolean
                driver: string
              }
            }
            dockerLogs: Record<string, Record<string, any>[] | undefined>[]
            dockerMetadata?:
              | import("zod").objectInputType<
                  {
                    "image.name": import("zod").ZodOptional<import("zod").ZodString>
                    "containerimage.digest": import("zod").ZodOptional<import("zod").ZodString>
                    "buildx.build.ref": import("zod").ZodOptional<import("zod").ZodString>
                  },
                  import("zod").ZodTypeAny,
                  "passthrough"
                >
              | undefined
          }
          output: {
            status: "success" | "failure"
            id: string
            createdAt: Date
            updatedAt: Date
            completedAt: Date | null
            startedAt: Date
            organizationId: string
            accountId: string
            dockerRawjsonLogs: {
              [x: string]: unknown
            }
            dockerMetadata: {
              [x: string]: unknown
            }
            tags: string[] | null
            imageManifestDigest: string | null
            buildxBuildRef: string | null
            executedVertexDigests: string[]
            cachedVertexDigests: string[]
            secondsSaved: number | null
            actualRuntime: string
            preferredRuntime: string | null
            fallbackReason: string | null
          }
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            cursor?: number | undefined
            perPage?: number | undefined
            sortOrder?: "asc" | "desc" | undefined
          }
          output: {
            items: {
              status: "success" | "failure"
              id: string
              createdAt: Date
              updatedAt: Date
              startedAt: Date
              organizationId: string
              accountId: string
              accountName: string
              dockerRawjsonLogs: Record<string, unknown>
              actualRuntime: string
              completedAt?: Date | null | undefined
              dockerMetadata?: Record<string, unknown> | null | undefined
              tags?: string[] | null | undefined
              imageManifestDigest?: string | null | undefined
              buildxBuildRef?: string | null | undefined
              executedVertexDigests?: string[] | null | undefined
              cachedVertexDigests?: string[] | null | undefined
              secondsSaved?: number | null | undefined
              preferredRuntime?: string | null | undefined
              fallbackReason?: string | null | undefined
            }[]
            nextCursor?: number | undefined
          }
        }>
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            id: string
          }
          output: {
            status: "success" | "failure"
            id: string
            createdAt: Date
            updatedAt: Date
            startedAt: Date
            organizationId: string
            accountId: string
            accountName: string
            dockerRawjsonLogs: Record<string, unknown>
            actualRuntime: string
            completedAt?: Date | null | undefined
            dockerMetadata?: Record<string, unknown> | null | undefined
            tags?: string[] | null | undefined
            imageManifestDigest?: string | null | undefined
            buildxBuildRef?: string | null | undefined
            executedVertexDigests?: string[] | null | undefined
            cachedVertexDigests?: string[] | null | undefined
            secondsSaved?: number | null | undefined
            preferredRuntime?: string | null | undefined
            fallbackReason?: string | null | undefined
          }
        }>
      }
    >
    events: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      {
        process: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            commandRunId: string
            events: (
              | {
                  name: "commandInfo"
                  timestamp: string
                  payload: {
                    name: string
                    args: Record<string, string | number | boolean | (string | number | boolean | null)[] | null>
                    opts: Record<string, string | number | boolean | (string | number | boolean | null)[] | null>
                    projectName: string
                    projectId: string
                    coreVersion: string
                    vcsBranch: string
                    vcsCommitHash: string
                    vcsOriginUrl: string
                  }
                  eventUid: string
                }
              | {
                  name: "sessionCompleted"
                  timestamp: string
                  payload: {
                    completedAt: Date
                  }
                  eventUid: string
                }
              | {
                  name: "sessionFailed"
                  timestamp: string
                  payload: {
                    completedAt: Date
                  }
                  eventUid: string
                }
              | {
                  name: "sessionCancelled"
                  timestamp: string
                  payload: {
                    completedAt: Date
                  }
                  eventUid: string
                }
              | {
                  name: "deployStatus"
                  timestamp: string
                  payload: {
                    status: {
                      state: "unknown" | "getting-status" | "cached" | "not-ready" | "processing" | "failed" | "ready"
                      ingresses?:
                        | {
                            path: string
                            hostname: string
                            protocol: "http" | "https"
                            linkUrl?: string | undefined
                            port?: number | undefined
                          }[]
                        | undefined
                    }
                    actionUid: string
                    actionName: string
                    actionType: string
                    actionVersion: string
                    actionState:
                      | "unknown"
                      | "getting-status"
                      | "cached"
                      | "not-ready"
                      | "processing"
                      | "failed"
                      | "ready"
                    actionOutputs: {}
                    startedAt: Date
                    force: boolean
                    operation: "process" | "getStatus"
                    sessionId: string
                    completedAt?: Date | undefined
                    actionVersionResolved?: string | undefined
                  }
                  eventUid: string
                }
              | {
                  name: "runStatus"
                  timestamp: string
                  payload: {
                    status: {
                      state: "unknown" | "failed" | "outdated" | "running" | "succeeded" | "not-implemented"
                    }
                    actionUid: string
                    actionName: string
                    actionType: string
                    actionVersion: string
                    actionState:
                      | "unknown"
                      | "getting-status"
                      | "cached"
                      | "not-ready"
                      | "processing"
                      | "failed"
                      | "ready"
                    actionOutputs: {}
                    startedAt: Date
                    force: boolean
                    operation: "process" | "getStatus"
                    sessionId: string
                    completedAt?: Date | undefined
                    actionVersionResolved?: string | undefined
                  }
                  eventUid: string
                }
            )[]
          }
          output: {}[]
        }>
      }
    >
    logEntry: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      {
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            commandRunId: string
            logEntries: {
              message: {
                symbol: string | null
                error: string | null
                msg: string | null
                section: string | null
                rawMsg: string | null
                dataFormat: "json" | "yaml" | null
              }
              timestamp: string
              actionUid: string | null
              actionName: string | null
              level: "error" | "warn" | "info" | "verbose" | "debug" | "silly"
              key: string
            }[]
          }
          output: void
        }>
        getByCommandRunId: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            commandRunId: string
            cursor?: number | undefined
            perPage?: number | undefined
            section?: string | undefined
            logLevels?: ("error" | "warn" | "info" | "verbose" | "debug" | "silly")[] | undefined
          }
          output: {
            items: {
              message: {
                symbol: string | null
                error: string | null
                msg: string | null
                section: string | null
                rawMsg: string | null
                dataFormat: "json" | "yaml" | null
              }
              timestamp: string
              actionUid: string | null
              actionName: string | null
              level: "error" | "warn" | "info" | "verbose" | "debug" | "silly"
              key: string
            }[]
            sections: string[]
            nextCursor?: number | undefined
          }
        }>
        getAll: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: {
            logEntries: {
              message: {
                symbol: string | null
                error: string | null
                msg: string | null
                section: string | null
                rawMsg: string | null
                dataFormat: "json" | "yaml" | null
              }
              timestamp: string
              actionUid: string | null
              actionName: string | null
              level: "error" | "warn" | "info" | "verbose" | "debug" | "silly"
              key: string
            }[]
          }
        }>
      }
    >
    token: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      {
        verifyToken: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            token: string
          }
          output: {
            valid: boolean
          }
        }>
        refreshToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            refreshToken: string
          }
          output: {
            accessToken: string
            refreshToken: string
            tokenValidity: number
          }
        }>
        revokeToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            token: string
          }
          output: {
            revoked: true
          }
        }>
        createAccessToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            label: string
          }
          output: {
            type: "access" | "refresh" | "web"
            value: string
            createdAt: Date
            updatedAt: Date
            accountId: string
            expiresAt: Date
            label: string | null
          }
        }>
        deleteAccessToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            token: string
          }
          output: void
        }>
        listTokens: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            type?: "access" | "refresh" | "web" | undefined
            cursor?: number | undefined
            perPage?: number | undefined
          }
          output: {
            items: {
              type: "access" | "refresh" | "web"
              value: string
              createdAt: Date
              updatedAt: Date
              accountId: string
              expiresAt: Date
              label: string | null
            }[]
            nextCursor?: number | undefined
          }
        }>
      }
    >
  }>
>
export type AppRouter = typeof appRouter
