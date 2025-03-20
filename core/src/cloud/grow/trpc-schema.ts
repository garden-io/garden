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
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        getCurrentAccount: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            email: string
            avatarUrl: string
            organizations: {
              name: string
              id: string
              createdAt: Date
              updatedAt: Date
              role: "admin" | "member"
            }[]
          } | null
        }>
        register: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            email: string
            password: string
            port?: number | undefined
            organizationId?: string | undefined
            invitationToken?: string | undefined
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
            organizationId?: string | undefined
            invitationToken?: string | undefined
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
            organizationId?: string | undefined
            invitationToken?: string | undefined
          }
          output: {
            url: string
          }
        }>
        cliAuthConfirmAccountAndOrganization: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
        }>
        githubOauthCallback: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
        }>
        acceptInvitation: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            cursor?: number | undefined
            perPage?: number | undefined
          }
          output: {
            items: {
              name: string | null
              id: string
              createdAt: Date
              updatedAt: Date
              email: string
              role: "admin" | "member"
              expiresAt: Date | null
              kind: "account" | "invitation"
            }[]
            nextCursor?: number | undefined
          }
        }>
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            accountId: string
          }
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            email: string
            role: "admin" | "member"
          }
        }>
        update: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            accountId: string
            role: "admin" | "member"
          }
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            email: string
            role: "admin" | "member"
          }
        }>
        remove: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            accountId: string
          }
          output: void
        }>
        updateProfile: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
          }
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            email: string
            avatarUrl: string
            organizations: {
              name: string
              id: string
              createdAt: Date
              updatedAt: Date
              role: "admin" | "member"
            }[]
          } | null
        }>
        requestPasswordReset: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            email: string
          }
          output: {
            success: boolean
          }
        }>
        resetPassword: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            token: string
            password: string
          }
          output: {
            success: boolean
          }
        }>
      }>
    >
    actionCache: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        createEntry: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            actionType: string
            startedAt: string
            completedAt: string
            organizationId: string
            schemaVersion: string
            actionRef: string
            cacheKey: string
            result?: unknown
          }
          output: {
            version: "v1"
          }
        }>
        getEntry: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            actionType: string
            organizationId: string
            schemaVersion: string
            actionRef: string
            cacheKey: string
          }
          output: {
            data:
              | {
                  startedAt: string
                  completedAt: string
                  found: true
                  result?: unknown
                }
              | {
                  found: false
                  notFoundReason: "no-result-exists" | "max-result-age-exceeded" | "max-hits-exceeded"
                  notFoundDescription: string
                }
            version: "v1"
          }
        }>
      }>
    >
    agentConfiguration: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            description: string
            registries: Map<
              string,
              {
                http: boolean
                mirrors: string[]
                insecure: boolean
              }
            >
            dns:
              | {
                  options: string[]
                  nameservers: string[]
                  searchDomains: string[]
                }
              | {}
          }
          output: {
            id: string
            createdAt: Date
            updatedAt: Date
            registrationToken: string
            organizationId: string
            description: string
            registries: Map<
              string,
              {
                http: boolean
                mirrors: string[]
                insecure: boolean
              }
            >
            dns:
              | {
                  options: string[]
                  nameservers: string[]
                  searchDomains: string[]
                }
              | {}
          }
        }>
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            id: string
            organizationId: string
          }
          output: {
            id: string
            createdAt: Date
            updatedAt: Date
            organizationId: string
            description: string
            registries: Map<
              string,
              {
                http: boolean
                mirrors: string[]
                insecure: boolean
              }
            >
            dns:
              | {
                  options: string[]
                  nameservers: string[]
                  searchDomains: string[]
                }
              | {}
          }
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
          }
          output: {
            id: string
            createdAt: Date
            updatedAt: Date
            organizationId: string
            description: string
            registries: Map<
              string,
              {
                http: boolean
                mirrors: string[]
                insecure: boolean
              }
            >
            dns:
              | {
                  options: string[]
                  nameservers: string[]
                  searchDomains: string[]
                }
              | {}
          }[]
        }>
      }>
    >
    agentInstance: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        listByConfigurationId: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            agentConfigurationId: string
          }
          output: {
            id: string
            createdAt: Date
            updatedAt: Date
            platforms: {
              os: string
              architecture: string
              osVersion: string
              osFeatures: string[]
              variant: string
            }[]
            agentVersion: string
            lastSeen: Date
            connectivity:
              | {
                  type: "tunnel"
                }
              | {
                  type: "direct"
                  buildkitAddress: string
                }
          }[]
        }>
        getStatus: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            agentInstanceId: string
          }
          output: string
        }>
        restart: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            agentInstanceId: string
          }
          output: void
        }>
      }>
    >
    analytics: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        trackPageViewEvent: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            path: string
            title: string
            userAgent: string
            url: string
            referrer: string
            pathNameClean: string
            prevPage?:
              | {
                  path: string
                  title: string
                }
              | undefined
          }
          output: {
            success: boolean
          }
        }>
      }>
    >
    billing: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        currentPlan: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
          }
          output: {
            products: {
              name: string
              id: `prod_${string}`
              description: string | null
              metadata: Record<string, unknown>
              defaultPrice?: `price_${string}` | undefined
            }[]
            prices: {
              id: `price_${string}`
              product: `prod_${string}`
              metadata: Record<string, unknown>
              recurring: {
                interval: "month" | "year" | "day" | "week"
              } | null
              unitAmount: number | null
              unitAmountDecimal: string | null
            }[]
            billingProfile?:
              | {
                  invoiceStatus: "void" | "draft" | "open" | "paid" | "uncollectible" | null
                  stripeSubscriptionId?: `sub_${string}` | undefined
                  stripePriceId?: `price_${string}` | undefined
                  subscriptionStatus?:
                    | "active"
                    | "canceled"
                    | "incomplete"
                    | "incomplete_expired"
                    | "past_due"
                    | "paused"
                    | "trialing"
                    | "unpaid"
                    | undefined
                  priceQuantity?: number | undefined
                  billingInterval?: "month" | "year" | undefined
                  currentPeriodStart?: Date | undefined
                  currentPeriodEnd?: Date | undefined
                  cancelAtPeriodEnd?: boolean | undefined
                }
              | undefined
            customerPortalUrl?: string | null | undefined
          }
        }>
        createCheckoutSession: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            interval: "month" | "year"
          }
          output: string | null
        }>
        checkoutSessionSuccess: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
        }>
        checkoutSessionCancel: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
        }>
      }>
    >
    cloudBuilder: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        registerBuild: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            platforms: string[]
            organizationId?: string | undefined
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
                    clientCertificatePem: string
                    endpoints: {
                      platform: string
                      mtlsEndpoint: string
                      serverCaPem: string
                    }[]
                    privateKeyPem?: string | undefined
                  }
                  available: true
                }
          }
        }>
        metrics: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            buildRef: string
            start: Date
            end: Date
          }
          output: {
            instance: {
              os: string
              virtualCpu: number
              memoryMegabytes: number
              machineArch: string
            } | null
            timeSeries: {
              values: Record<string, (string | number)[]>
              timestamps: number[]
            }[]
          }
        }>
      }>
    >
    commandRun: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            status: "unknown" | "error" | "active" | "success" | "cancelled"
            startedAt: Date
            completedAt: Date | null
            command: string
            clientVersion: string
            gitRepositoryUrl: string | null
            gitBranchName: string | null
            gitCommitHash: string | null
            gitIsDirty: boolean | null
            organizationId?: string | undefined
          }
          output: {
            status: "unknown" | "error" | "active" | "success" | "cancelled"
            id: string
            createdAt: Date
            updatedAt: Date
            startedAt: Date
            completedAt: Date
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
              status: "unknown" | "error" | "active" | "success" | "cancelled"
              id: string
              createdAt: Date
              updatedAt: Date
              startedAt: Date
              completedAt: Date
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
              actionUid: string
              actionName: string
              actionType: string
              actionVersion: string
              actionVersionResolved: string | null
              actionState: "unknown" | "getting-status" | "cached" | "not-ready" | "processing" | "failed" | "ready"
              actionOutputs: Record<string, unknown>
              startedAt: Date
              completedAt: Date | null
              force: boolean
              durationMs: number | null
              commandRunId: string
            }[]
          }
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            cursor?: number | undefined
            perPage?: number | undefined
            sortOrder?: "desc" | "asc" | undefined
            dates?:
              | {
                  from?: number | undefined
                  to?: number | undefined
                }
              | undefined
          }
          output: {
            items: {
              status: "unknown" | "error" | "active" | "success" | "cancelled"
              id: string
              createdAt: Date
              updatedAt: Date
              startedAt: Date
              completedAt: Date
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
            organizationId: string
            sortOrder?: "desc" | "asc" | undefined
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
      }>
    >
    dockerBuild: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            status: "success" | "failure"
            startedAt: Date
            completedAt: Date
            platforms: string[]
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
            imageTags: string[]
            organizationId?: string | undefined
            dockerMetadata?:
              | import("zod").objectInputType<
                  {
                    "image.name": import("zod").ZodOptional<import("zod").ZodString>
                    "containerimage.digest": import("zod").ZodOptional<import("zod").ZodString>
                    "buildx.build.ref": import("zod").ZodOptional<import("zod").ZodString>
                    "buildx.build.provenance": import("zod").ZodOptional<
                      import("zod").ZodObject<
                        {
                          buildType: import("zod").ZodOptional<import("zod").ZodString>
                          metadata: import("zod").ZodOptional<
                            import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodUnknown>
                          >
                        },
                        "strip",
                        import("zod").ZodTypeAny,
                        {
                          buildType?: string | undefined
                          metadata?: Record<string, unknown> | undefined
                        },
                        {
                          buildType?: string | undefined
                          metadata?: Record<string, unknown> | undefined
                        }
                      >
                    >
                  },
                  import("zod").ZodTypeAny,
                  "passthrough"
                >
              | undefined
            dockerLogs?: unknown[] | undefined
          }
          output: {
            id: string
            timeSaved: number
          }
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            cursor?: number | undefined
            perPage?: number | undefined
            sortOrder?: "desc" | "asc" | undefined
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
              dockerRawjsonLogs: Record<string, unknown>[]
              actualRuntime: string
              sourceFilename: string | null
              sourceLanguage: string | null
              sourceData: string | null
              accountName: string
              completedAt?: Date | null | undefined
              dockerClientVersion?: string | null | undefined
              dockerServerVersion?: string | null | undefined
              builderImplicitName?: string | null | undefined
              builderIsDefault?: boolean | null | undefined
              builderDriver?: string | null | undefined
              platforms?: string[] | null | undefined
              tags?: string[] | null | undefined
              imageManifestDigest?: string | null | undefined
              buildxBuildRef?: string | null | undefined
              executedVertexDigests?: string[] | null | undefined
              cachedVertexDigests?: string[] | null | undefined
              timeSavedMs?: number | null | undefined
              preferredRuntime?: string | null | undefined
              fallbackReason?: string | null | undefined
            }[]
            nextCursor?: number | undefined
          }
        }>
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            id: string
            organizationId: string
          }
          output: {
            status: "success" | "failure"
            id: string
            createdAt: Date
            updatedAt: Date
            startedAt: Date
            organizationId: string
            accountId: string
            dockerRawjsonLogs: Record<string, unknown>[]
            actualRuntime: string
            sourceFilename: string | null
            sourceLanguage: string | null
            sourceData: string | null
            accountName: string
            sourceCodeAsHtml: string | null
            cloudBuilderInfo: {
              instance: {
                os: string
                virtualCpu: number
                memoryMegabytes: number
                machineArch: string
              } | null
              timeSeries: {
                values: Record<string, (string | number)[]>
                timestamps: number[]
              }[]
            } | null
            completedAt?: Date | null | undefined
            dockerClientVersion?: string | null | undefined
            dockerServerVersion?: string | null | undefined
            builderImplicitName?: string | null | undefined
            builderIsDefault?: boolean | null | undefined
            builderDriver?: string | null | undefined
            platforms?: string[] | null | undefined
            tags?: string[] | null | undefined
            imageManifestDigest?: string | null | undefined
            buildxBuildRef?: string | null | undefined
            executedVertexDigests?: string[] | null | undefined
            cachedVertexDigests?: string[] | null | undefined
            timeSavedMs?: number | null | undefined
            preferredRuntime?: string | null | undefined
            fallbackReason?: string | null | undefined
          }
        }>
        statistics: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            runtime?: string | undefined
          }
          output: {
            builder: {
              maxCpu: number
              maxMemoryMb: number
              cpu: number
              memoryMb: number
            }
            usage: {
              total: {
                buildCount: bigint
                buildUnitMinutes: bigint
                buildWallMinutes: bigint
              }
              perDay: {
                date: string
                buildCount: bigint
                buildUnitMinutes: bigint
                buildWallMinutes: bigint
              }[]
            }
            limits: {
              concurrencyLimits: {
                maxCpu: number
                maxMemoryMb: number
              }
              usageLimits: {
                unitMinutes: number
                builds: number
              }
              enabledPlatforms: string[]
            }
            totalTimeSavedMs: number
          }
        }>
      }>
    >
    events: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
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
                    actionVersionResolved?: string | undefined
                    completedAt?: Date | undefined
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
                    actionVersionResolved?: string | undefined
                    completedAt?: Date | undefined
                  }
                  eventUid: string
                }
            )[]
          }
          output: {}[]
        }>
      }>
    >
    invitation: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            email: string
            role: "admin" | "member"
          }
          output: void
        }>
        sendMultiple: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            emails: string[]
          }
          output: {
            sentInvitationEmails: string[]
          }
        }>
        resend: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            id: string
          }
          output: {
            email: string
          }
        }>
        rescind: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            id: string
          }
          output: null
        }>
      }>
    >
    logEntry: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
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
              actionUid: string | null
              actionName: string | null
              timestamp: string
              key: string
            }[]
          }
          output: void
        }>
        getByCommandRunId: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            commandRunId: string
            section?: string | undefined
            cursor?: number | undefined
            perPage?: number | undefined
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
              actionUid: string | null
              actionName: string | null
              timestamp: string
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
                section: string | null
                msg: string | null
                rawMsg: string | null
                dataFormat: "json" | "yaml" | null
              }
              level: "debug" | "info" | "warn" | "error" | "verbose" | "silly"
              actionUid: string | null
              actionName: string | null
              timestamp: string
              key: string
            }[]
          }
        }>
      }>
    >
    organization: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
          }
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
          }
        }>
        getById: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
          }
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            usersCount: number
          }
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            cursor?: number | undefined
            perPage?: number | undefined
          }
          output: {
            items: {
              name: string
              id: string
              createdAt: Date
              updatedAt: Date
            }[]
            nextCursor?: number | undefined
          }
        }>
        update: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            organizationId: string
          }
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
          }
        }>
        hardDelete: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
          }
          output: void
        }>
      }>
    >
    token: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
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
            value: string
            type: "access" | "refresh" | "web"
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
              value: string
              type: "access" | "refresh" | "web"
              createdAt: Date
              updatedAt: Date
              accountId: string
              expiresAt: Date
              label: string | null
            }[]
            nextCursor?: number | undefined
          }
        }>
      }>
    >
  }>
>
export type AppRouter = typeof appRouter
