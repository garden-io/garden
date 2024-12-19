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
            id: string
            createdAt: Date
            updatedAt: Date
            name: string
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
    builds: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      {
        registerBuild: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            platforms: string[]
            mtlsClientPublicKeyPEM?: string | undefined
          }
          output: {
            version: "v2"
            availability:
              | {
                  available: false
                  reason: string
                }
              | {
                  buildx: {
                    endpoints: {
                      platform: string
                      mtlsEndpoint: string
                      serverCaPem: string
                    }[]
                    clientCertificatePem: string
                    privateKeyPem?: string | undefined
                  }
                  available: true
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
            startedAt: Date
            completedAt: Date | null
            status: "unknown" | "error" | "active" | "success" | "cancelled"
            clientVersion: string
            command: string
            gitRepositoryUrl: string | null
            gitBranchName: string | null
            gitCommitHash: string | null
            gitIsDirty: boolean | null
          }
          output: {
            startedAt: Date
            completedAt: Date
            accountId: string
            organizationId: string
            id: string
            createdAt: Date
            updatedAt: Date
            status: "unknown" | "error" | "active" | "success" | "cancelled"
            clientVersion: string
            command: string
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
              startedAt: Date
              completedAt: Date
              accountId: string
              organizationId: string
              id: string
              createdAt: Date
              updatedAt: Date
              status: "unknown" | "error" | "active" | "success" | "cancelled"
              clientVersion: string
              command: string
              gitRepositoryUrl: string
              gitBranchName: string
              gitCommitHash: string
              gitIsDirty: boolean
            }
            actionRuns: {
              startedAt: Date
              completedAt: Date | null
              id: string
              createdAt: Date
              updatedAt: Date
              actionUid: string
              actionName: string
              actionType: string
              actionVersion: string
              actionVersionResolved: string | null
              actionState: "failed" | "unknown" | "getting-status" | "cached" | "not-ready" | "processing" | "ready"
              actionOutputs: Record<string, unknown>
              force: boolean
              durationMs: number | null
              commandRunId: string
            }[]
          }
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            sortOrder?: "asc" | "desc" | undefined
            dates?:
              | {
                  from?: number | undefined
                  to?: number | undefined
                }
              | undefined
            cursor?: number | undefined
            perPage?: number | undefined
          }
          output: {
            items: {
              startedAt: Date
              completedAt: Date
              accountId: string
              organizationId: string
              id: string
              createdAt: Date
              updatedAt: Date
              status: "unknown" | "error" | "active" | "success" | "cancelled"
              clientVersion: string
              command: string
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
            failed: number
            unknown: number
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
            startedAt: Date
            completedAt: Date
            failed: boolean
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
            startedAt: Date
            completedAt: Date | null
            accountId: string
            organizationId: string
            failed: boolean
            dockerRawjsonLogs: {
              [x: string]: unknown
            }
            dockerMetadata: {
              [x: string]: unknown
            }
            tags: string[] | null
            imageManifestDigest: string | null
            platforms: string[] | null
            buildxBuildRef: string | null
            executedVertexDigests: string[]
            cachedVertexDigests: string[]
            secondsSaved: number | null
            actualRuntime: string
            preferredRuntime: string | null
            fallbackReason: string | null
            id: string
            createdAt: Date
            updatedAt: Date
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
                  name: "deployStatus"
                  timestamp: string
                  payload: {
                    startedAt: Date
                    status: {
                      state: "failed" | "unknown" | "getting-status" | "cached" | "not-ready" | "processing" | "ready"
                      ingresses?:
                        | {
                            path: string
                            hostname: string
                            protocol: "http" | "https"
                            port?: number | undefined
                            linkUrl?: string | undefined
                          }[]
                        | undefined
                    }
                    actionUid: string
                    actionName: string
                    actionType: string
                    actionVersion: string
                    actionState:
                      | "failed"
                      | "unknown"
                      | "getting-status"
                      | "cached"
                      | "not-ready"
                      | "processing"
                      | "ready"
                    actionOutputs: {}
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
                    startedAt: Date
                    status: {
                      state: "failed" | "unknown" | "outdated" | "running" | "succeeded" | "not-implemented"
                    }
                    actionUid: string
                    actionName: string
                    actionType: string
                    actionVersion: string
                    actionState:
                      | "failed"
                      | "unknown"
                      | "getting-status"
                      | "cached"
                      | "not-ready"
                      | "processing"
                      | "ready"
                    actionOutputs: {}
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
                section: string | null
                msg: string | null
                rawMsg: string | null
                dataFormat: "json" | "yaml" | null
              }
              level: "debug" | "info" | "warn" | "error" | "verbose" | "silly"
              timestamp: string
              key: string
              actionUid: string | null
              actionName: string | null
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
            logLevels?: ("debug" | "info" | "warn" | "error" | "verbose" | "silly")[] | undefined
          }
          output: {
            items: {
              message: {
                symbol: string | null
                error: string | null
                section: string | null
                msg: string | null
                rawMsg: string | null
                dataFormat: "json" | "yaml" | null
              }
              level: "debug" | "info" | "warn" | "error" | "verbose" | "silly"
              timestamp: string
              key: string
              actionUid: string | null
              actionName: string | null
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
                section: string | null
                msg: string | null
                rawMsg: string | null
                dataFormat: "json" | "yaml" | null
              }
              level: "debug" | "info" | "warn" | "error" | "verbose" | "silly"
              timestamp: string
              key: string
              actionUid: string | null
              actionName: string | null
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
            accountId: string
            createdAt: Date
            updatedAt: Date
            value: string
            type: "access" | "refresh" | "web"
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
              accountId: string
              createdAt: Date
              updatedAt: Date
              value: string
              type: "access" | "refresh" | "web"
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
