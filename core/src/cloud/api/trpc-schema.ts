/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/consistent-type-imports */
export declare const appRouter: import("@trpc/server").TRPCBuiltRouter<
  {
    ctx: unknown
    meta: object
    errorShape: unknown
    transformer: true
  },
  import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    account: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
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
              slug: string | null
              plan: "free" | "team" | "enterprise"
              isCurrentAccountOwner: boolean
              featureFlags: "private-container-builder"[]
            }[]
          } | null
          meta: object
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
            accountId: string
            redirectTo: string
          }
          meta: object
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
          meta: object
        }>
        clearSession: import("@trpc/server").TRPCMutationProcedure<{
          input: void
          output: {
            redirectTo: string
          }
          meta: object
        }>
        oauthUrlRedirect: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            provider: "github" | "gitlab"
            port?: number | undefined
            organizationId?: string | undefined
            invitationToken?: string | undefined
          }
          output: {
            url: string
          }
          meta: object
        }>
        cliAuthConfirmAccountAndOrganization: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
          meta: object
        }>
        githubOauthCallback: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
          meta: object
        }>
        gitlabOauthCallback: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
          meta: object
        }>
        acceptInvitation: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
          meta: object
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
              expiresAt: Date | null
              email: string
              role: "admin" | "member"
              isOwner: boolean
              kind: "account" | "invitation"
              serviceAccount?: boolean | undefined
              tokens?:
                | {
                    type: "access" | "refresh" | "web"
                    description: string | null
                    id: string
                    createdAt: Date
                    updatedAt: Date
                    expiresAt: Date
                    accountId: string
                    label: string | null
                  }[]
                | undefined
            }[]
            nextCursor?: number | undefined
          }
          meta: object
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
            isOwner: boolean
          }
          meta: object
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
            isOwner: boolean
          }
          meta: object
        }>
        remove: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            accountId: string
          }
          output: void
          meta: object
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
              slug: string | null
              plan: "free" | "team" | "enterprise"
              isCurrentAccountOwner: boolean
              featureFlags: "private-container-builder"[]
            }[]
          } | null
          meta: object
        }>
        requestPasswordReset: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            email: string
          }
          output: {
            success: boolean
          }
          meta: object
        }>
        resetPassword: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            token: string
            password: string
          }
          output: {
            success: boolean
          }
          meta: object
        }>
        changeRole: import("@trpc/server").TRPCMutationProcedure<{
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
            isOwner: boolean
          }
          meta: object
        }>
        getOrCreateServiceAccountAndToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            organizationId: string
            accountId: string
            label?: string | undefined
          }
          output: {
            account: {
              name: string
              id: string
              createdAt: Date
              updatedAt: Date
              email: string
              role: "admin" | "member"
              isOwner: boolean
            }
            token: string
          }
          meta: object
        }>
        createServiceAccount: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            organizationId: string
          }
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            email: string
            role: "admin" | "member"
            isOwner: boolean
          }
          meta: object
        }>
      }>
    >
    actionCache: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        createEntry: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            schemaVersion: string
            actionType: string
            actionRef: string
            cacheKey: string
            startedAt: string
            completedAt: string
            result?: unknown
          }
          output: {
            version: "v1"
          }
          meta: object
        }>
        getEntry: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            schemaVersion: string
            actionType: string
            actionRef: string
            cacheKey: string
          }
          output: {
            version: "v1"
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
          }
          meta: object
        }>
      }>
    >
    aec: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        listEnvironmentStatuses: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            cursor?: number | undefined
            perPage?: number | undefined
            environmentName?: string | undefined
            projectId?: string | undefined
            environmentType?: string | undefined
            orderBy?: "timestamp" | "environmentName" | "projectId" | "latestEventUlid" | undefined
            sortOrder?: "asc" | "desc" | undefined
          }
          output: {
            items: {
              error: boolean
              organizationId: string
              timestamp: Date
              success: boolean | null
              environmentName: string
              projectId: string
              environmentType: string
              latestEventUlid: string
              actorId: string
              commandUlid: string
              sessionUlid: string
              agentPluginName: string
              agentEnvironmentType: string
              agentDescription: {
                project: string
                k8sContext: string
                namespace: string
              }
              agentVersion: string | null
              statusDescription: string
              inProgress: boolean
              lastDeployed: string | null
              actionTriggered: "Active" | "Cleanup" | "Pause" | "Cleaning up..." | "Pausing..." | null
              resource: string[] | null
              environment: string
            }[]
            nextCursor?: number | undefined
          }
          meta: object
        }>
        getEnvironmentStatus: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            environmentName: string
            projectId: string
            environmentType: string
          }
          output: {
            error: boolean
            organizationId: string
            timestamp: Date
            success: boolean | null
            environmentName: string
            projectId: string
            environmentType: string
            latestEventUlid: string
            actorId: string
            commandUlid: string
            sessionUlid: string
            agentPluginName: string
            agentEnvironmentType: string
            agentDescription: {
              project: string
              k8sContext: string
              namespace: string
            }
            agentVersion: string | null
            statusDescription: string
            inProgress: boolean
            lastDeployed: string | null
            actionTriggered: "Active" | "Cleanup" | "Pause" | "Cleaning up..." | "Pausing..." | null
            resource: string[] | null
            environment: string
          } | null
          meta: object
        }>
        listAgentStatuses: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            cursor?: number | undefined
            perPage?: number | undefined
            orderBy?: "timestamp" | "latestEventUlid" | "agentPluginName" | "agentEnvironmentType" | undefined
            sortOrder?: "asc" | "desc" | undefined
            agentPluginName?: string | undefined
            agentEnvironmentType?: string | undefined
          }
          output: {
            items: {
              status: "Unknown" | "Running" | "Stopped" | "Error" | "Inactive"
              organizationId: string
              timestamp: Date
              latestEventUlid: string
              actorId: string
              commandUlid: string
              sessionUlid: string
              agentPluginName: string
              agentEnvironmentType: string
              agentDescription: {
                project: string
                k8sContext: string
                namespace: string
              }
              agentVersion: string | null
              statusDescription: string
            }[]
            nextCursor?: number | undefined
          }
          meta: object
        }>
        getAgentStatus: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            agentPluginName: string
            agentEnvironmentType: string
          }
          output: {
            status: "Unknown" | "Running" | "Stopped" | "Error" | "Inactive"
            organizationId: string
            timestamp: Date
            latestEventUlid: string
            actorId: string
            commandUlid: string
            sessionUlid: string
            agentPluginName: string
            agentEnvironmentType: string
            agentDescription: {
              project: string
              k8sContext: string
              namespace: string
            }
            agentVersion: string | null
            statusDescription: string
          } | null
          meta: object
        }>
      }>
    >
    agentConfiguration: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            description: string
            organizationId: string
            registries: Map<
              string,
              {
                mirrors: string[]
                http: boolean
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
            description: string
            organizationId: string
            id: string
            createdAt: Date
            updatedAt: Date
            registries: Map<
              string,
              {
                mirrors: string[]
                http: boolean
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
            registrationToken: string
          }
          meta: object
        }>
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            id: string
          }
          output: {
            description: string
            organizationId: string
            id: string
            createdAt: Date
            updatedAt: Date
            registries: Map<
              string,
              {
                mirrors: string[]
                http: boolean
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
          meta: object
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
          }
          output: {
            description: string
            organizationId: string
            id: string
            createdAt: Date
            updatedAt: Date
            registries: Map<
              string,
              {
                mirrors: string[]
                http: boolean
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
          meta: object
        }>
      }>
    >
    agentInstance: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        listByConfigurationId: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            agentConfigurationId: string
          }
          output: {
            status: string
            id: string
            createdAt: Date
            updatedAt: Date
            agentVersion: string
            connectivity:
              | {
                  type: "tunnel"
                }
              | {
                  type: "direct"
                  buildkitAddress: string
                }
            platforms: {
              architecture: string
              os: string
              variant: string
              osVersion: string
              osFeatures: string[]
            }[]
            lastSeen: Date
          }[]
          meta: object
        }>
        restart: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            agentInstanceId: string
          }
          output: void
          meta: object
        }>
      }>
    >
    analytics: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        trackPageViewEvent: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            path: string
            userAgent: string
            url: string
            title: string
            pathNameClean: string
            referrer: string
            prevPage?:
              | {
                  path: string
                  title: string
                  pathNameClean: string
                }
              | undefined
          }
          output: {
            success: boolean
          }
          meta: object
        }>
      }>
    >
    billing: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        currentPlan: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
          }
          output:
            | {
                resolvedPlan: "enterprise"
                maxSeats?: number | null | undefined
              }
            | {
                resolvedPlan: "free" | "team"
                products: {
                  description: string | null
                  name: string
                  id: `prod_${string}`
                  metadata: Record<string, unknown>
                  defaultPrice?: `price_${string}` | undefined
                }[]
                prices: {
                  id: `price_${string}`
                  product: `prod_${string}`
                  metadata: Record<string, unknown>
                  unitAmount: number | null
                  unitAmountDecimal: string | null
                  recurring: {
                    interval: "month" | "year" | "week" | "day"
                  } | null
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
                      currentPriceQuantity?: number | undefined
                      maximumPriceQuantity?: number | undefined
                      billingInterval?: "month" | "year" | undefined
                      currentPeriodStart?: Date | undefined
                      currentPeriodEnd?: Date | undefined
                      cancelAtPeriodEnd?: boolean | undefined
                    }
                  | undefined
                maxSeats?: number | null | undefined
                customerPortalUrl?: string | null | undefined
              }
          meta: object
        }>
        createCheckoutSession: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            interval: "month" | "year"
          }
          output: string | null
          meta: object
        }>
        checkoutSessionSuccess: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
          meta: object
        }>
        checkoutSessionCancel: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: void
          meta: object
        }>
      }>
    >
    cloudBuilder: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        registerBuild: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
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
                  available: true
                  buildx: {
                    endpoints: {
                      platform: string
                      mtlsEndpoint: string
                      serverCaPem: string
                    }[]
                    clientCertificatePem: string
                    privateKeyPem?: string | undefined
                  }
                }
          }
          meta: object
        }>
        metrics: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            buildRef: string
            start: Date
            end: Date
          }
          output: {
            timeSeries: {
              values: Record<string, (string | number)[]>
              timestamps: number[]
            }[]
            instance: {
              os: string
              virtualCpu: number
              memoryMegabytes: number
              machineArch: string
            } | null
          }
          meta: object
        }>
      }>
    >
    commandLogs: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            commandUlid: string
            cursor?: number | undefined
            perPage?: number | undefined
            sortOrder?: "asc" | "desc" | undefined
            actionUlid?: string | undefined
            maxLogLevel?: string | undefined
          }
          output: {
            items: {
              organizationId: string
              actorId: string
              commandUlid: string
              sessionUlid: string
              actionUlid: string | null
              eventUlid: string
              logLevel: number
              originDescription: string | null
              logDetails: {
                symbol?: string | null | undefined
                error?: string | null | undefined
                data?: string | null | undefined
                msg?: string | null | undefined
                rawMsg?: string | null | undefined
                dataFormat?: string | null | undefined
                section?: string | null | undefined
                coreLog?:
                  | {
                      name?: string | null | undefined
                      origin?: string | null | undefined
                    }
                  | null
                  | undefined
                actionLog?:
                  | {
                      actionName: string
                      actionKind: string
                      actionUid: string
                      origin?: string | null | undefined
                    }
                  | null
                  | undefined
              }
              loggedAt: Date
            }[]
            nextCursor?: number | undefined
          }
          meta: object
        }>
        watch: import("@trpc/server").TRPCSubscriptionProcedure<{
          input: {
            organizationId: string
            commandUlid: string
            actionUlid?: string | undefined
          }
          output: unknown
          meta: object
        }>
      }>
    >
    gardenEnvironment: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            variableListId: string
          }
          output: {
            description: string | null
            name: string
            adminOnly: boolean
            id: string
            variableCount: number
          }[]
          meta: object
        }>
        update: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            organizationId: string
            variableListId: string
            environmentId: string
          }
          output: {
            description: string | null
            name: string
            id: string
            variableListId: `varlist_${string}`
          }
          meta: object
        }>
        updateAdminOnlySettings: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            adminOnly: boolean
            variableListId: string
            environmentId: string
          }
          output: {
            description: string | null
            name: string
            adminOnly: boolean
            id: string
            variableListId: `varlist_${string}`
          }
          meta: object
        }>
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            organizationId: string
            variableListId: string
          }
          output: {
            name: string
            organizationId: string
            adminOnly: boolean
            id: string
            variableListId: `varlist_${string}`
          }
          meta: object
        }>
        delete: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            variableListId: string
            environmentId: string
          }
          output: {
            success: boolean
          }
          meta: object
        }>
      }>
    >
    dockerBuild: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            status: "success" | "failure"
            organizationId: string
            startedAt: Date
            completedAt: Date
            platforms: string[]
            runtime: {
              actual: "buildx" | "cloud-builder" | "garden-k8s-kaniko" | "garden-k8s-buildkit"
              preferred?:
                | {
                    runtime: "buildx" | "cloud-builder" | "garden-k8s-kaniko" | "garden-k8s-buildkit"
                    fallbackReason: string
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
            dockerLogs?: unknown[] | undefined
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
                          metadata?: Record<string, unknown> | undefined
                          buildType?: string | undefined
                        },
                        {
                          metadata?: Record<string, unknown> | undefined
                          buildType?: string | undefined
                        }
                      >
                    >
                  },
                  import("zod").ZodTypeAny,
                  "passthrough"
                >
              | undefined
          }
          output: {
            id: string
            timeSaved: number
          }
          meta: object
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            cursor?: number | undefined
            perPage?: number | undefined
            sortOrder?: "asc" | "desc" | undefined
          }
          output: {
            items: {
              status: "success" | "failure"
              organizationId: string
              id: string
              createdAt: Date
              updatedAt: Date
              accountId: string
              startedAt: Date
              accountName: string
              actualRuntime: string | null
              totalLayers: number | null
              cachedLayers: number | null
              completedAt?: Date | null | undefined
              platforms?: string[] | null | undefined
              tags?: string[] | null | undefined
            }[]
            nextCursor?: number | undefined
          }
          meta: object
        }>
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            id: string
          }
          output: {
            status: "success" | "failure"
            organizationId: string
            id: string
            createdAt: Date
            updatedAt: Date
            accountId: string
            startedAt: Date
            accountName: string
            actualRuntime: string | null
            totalLayers: number | null
            cachedLayers: number | null
            dockerRawjsonLogs: Record<string, unknown>[]
            sourceFilename: string | null
            sourceLanguage: string | null
            sourceData: string | null
            sourceCodeAsHtml: string | null
            cloudBuilderInfo: {
              timeSeries: {
                values: Record<string, (string | number)[]>
                timestamps: number[]
              }[]
              instance: {
                os: string
                virtualCpu: number
                memoryMegabytes: number
                machineArch: string
              } | null
            } | null
            completedAt?: Date | null | undefined
            platforms?: string[] | null | undefined
            fallbackReason?: string | null | undefined
            tags?: string[] | null | undefined
            dockerClientVersion?: string | null | undefined
            dockerServerVersion?: string | null | undefined
            builderImplicitName?: string | null | undefined
            builderIsDefault?: boolean | null | undefined
            builderDriver?: string | null | undefined
            imageManifestDigest?: string | null | undefined
            buildxBuildRef?: string | null | undefined
            executedVertexDigests?: string[] | null | undefined
            cachedVertexDigests?: string[] | null | undefined
            timeSavedMs?: number | null | undefined
            preferredRuntime?: string | null | undefined
          }
          meta: object
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
            totalTimeSavedMs: number
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
            usage: {
              total: {
                buildCount: bigint
                buildWallMinutes: bigint
                buildUnitMinutes: bigint
              }
              perDay: {
                date: string
                buildCount: bigint
                buildWallMinutes: bigint
                buildUnitMinutes: bigint
              }[]
            }
          }
          meta: object
        }>
      }>
    >
    invitation: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getByToken: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            token: string
          }
          output: {
            organizationName: string
            inviterName: string
          }
          meta: object
        }>
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            email: string
            role: "admin" | "member"
          }
          output: void
          meta: object
        }>
        sendMultiple: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            emails: string[]
          }
          output: {
            sentInvitationEmails: string[]
          }
          meta: object
        }>
        resend: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            id: string
          }
          output: {
            email: string
          }
          meta: object
        }>
        rescind: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            id: string
          }
          output: null
          meta: object
        }>
      }>
    >
    organization: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            slug?: string | null | undefined
          }
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            slug: string | null
            plan: "free" | "team" | "enterprise"
          }
          meta: object
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
            slug: string | null
            plan: "free" | "team" | "enterprise"
            activeUsersCount: number
            usedSeatsCount: number
          }
          meta: object
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
              slug: string | null
              plan: "free" | "team" | "enterprise"
            }[]
            nextCursor?: number | undefined
          }
          meta: object
        }>
        update: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            name?: string | undefined
            slug?: string | null | undefined
          }
          output: {
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            slug: string | null
            plan: "free" | "team" | "enterprise"
          }
          meta: object
        }>
        checkSlugAvailability: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            slug: string
            organizationId?: string | undefined
          }
          output: {
            available: boolean
          }
          meta: object
        }>
        legacyGetDefaultOrganization: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            legacyProjectId: string
          }
          output: {
            name: string | null
            id: string | null
            slug: string | null
          }
          meta: object
        }>
        hardDelete: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
          }
          output: void
          meta: object
        }>
        listFeatureFlags: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
          }
          output: {
            description: string
            name: string
            id: string
            enabled: boolean
            visible: boolean
          }[]
          meta: object
        }>
        updateFeatureFlag: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            changes: {
              state: boolean
              flagId: string
            }[]
          }
          output: void
          meta: object
        }>
      }>
    >
    token: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        verifyToken: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            token: string
          }
          output: {
            valid: boolean
            notices: {
              message: string
              severity: "error" | "info" | "warning"
            }[]
          }
          meta: object
        }>
        refreshToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            refreshToken: string
          }
          output: {
            notices: {
              message: string
              severity: "error" | "info" | "warning"
            }[]
            refreshToken: string
            accessToken: string
            tokenValidity: number
          }
          meta: object
        }>
        revokeToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            token: string
          }
          output: {
            revoked: true
          }
          meta: object
        }>
        createAccessToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            description?: string | undefined
            expiresAt?: Date | undefined
          }
          output: {
            value: string
            type: "access" | "refresh" | "web"
            description: string | null
            id: string
            createdAt: Date
            updatedAt: Date
            expiresAt: Date
            accountId: string
            label: string | null
          }
          meta: object
        }>
        createServiceAccountToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            organizationId: string
            accountId: string
            description?: string | undefined
            expiresAt?: Date | undefined
          }
          output: {
            value: string
            type: "access" | "refresh" | "web"
            description: string | null
            id: string
            createdAt: Date
            updatedAt: Date
            expiresAt: Date
            accountId: string
            label: string | null
          }
          meta: object
        }>
        deleteAccessToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            tokenId: string
          }
          output: void
          meta: object
        }>
        deleteServiceAccountToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            accountId: string
            tokenId: string
          }
          output: void
          meta: object
        }>
        listAccessTokens: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: {
            type: "access" | "refresh" | "web"
            description: string | null
            id: string
            createdAt: Date
            updatedAt: Date
            expiresAt: Date
            accountId: string
            label: string | null
          }[]
          meta: object
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
              description: string | null
              id: string
              createdAt: Date
              updatedAt: Date
              expiresAt: Date
              accountId: string
              label: string | null
            }[]
            nextCursor?: number | undefined
          }
          meta: object
        }>
      }>
    >
    variable: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            value: string
            description: string | null
            name: string
            organizationId: string
            isSecret: boolean
            scopedGardenEnvironmentId: string | null
            scopedAccountId: string | null
            variableListId: string
            expiresAt: Date | null
            scopedGardenEnvironmentName: string | null
            upsert?: boolean | undefined
          }
          output: {
            id: string
            replacedPrevious: boolean
          }
          meta: object
        }>
        update: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            description: string | null
            organizationId: string
            scopedGardenEnvironmentId: string | null
            scopedAccountId: string | null
            expiresAt: Date | null
            scopedGardenEnvironmentName: string | null
            variableId: string
            value?: string | undefined
          }
          output: {
            success: boolean
          }
          meta: object
        }>
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            variableId: string
          }
          output: {
            description: string | null
            name: string
            organizationId: string
            id: string
            createdAt: Date
            updatedAt: Date
            isSecret: boolean
            scopedGardenEnvironmentId: string | null
            scopedAccountId: string | null
            createdByAccountId: string
            expiresAt: Date | null
            value: string
            createdByName: string | null
            scopedGardenEnvironmentName: string | null
            scopedGardenEnvironmentAdminOnly: boolean | null
            scopedAccountName: string | null
          }
          meta: object
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input:
            | {
                organizationId: string
                variableListId: string
                search?: string | undefined
                cursor?: number | undefined
                perPage?: number | undefined
                variableListName?: string | undefined
              }
            | {
                organizationId: string
                variableListName: string
                search?: string | undefined
                variableListId?: string | undefined
                cursor?: number | undefined
                perPage?: number | undefined
              }
          output: {
            items: {
              description: string | null
              name: string
              organizationId: string
              id: string
              createdAt: Date
              updatedAt: Date
              isSecret: boolean
              scopedGardenEnvironmentId: string | null
              scopedAccountId: string | null
              createdByAccountId: string
              expiresAt: Date | null
              value: string
              createdByName: string | null
              scopedGardenEnvironmentName: string | null
              scopedGardenEnvironmentAdminOnly: boolean | null
              scopedAccountName: string | null
              variableListName: string | null
              variableListDescription: string | null
              variableListAdminOnly: boolean | null
            }[]
            nextCursor: number | undefined
          }
          meta: object
        }>
        delete: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            variableId: string
          }
          output: {
            success: boolean
          }
          meta: object
        }>
      }>
    >
    variableList: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: unknown
        meta: object
        errorShape: unknown
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getValues: import("@trpc/server").TRPCQueryProcedure<{
          input:
            | {
                organizationId: string
                variableListId: string
                gardenEnvironmentName: string
                variableListName?: string | undefined
              }
            | {
                organizationId: string
                gardenEnvironmentName: string
                variableListName: string
                variableListId?: string | undefined
              }
          output: Record<
            string,
            {
              value: string
              isSecret: boolean
              scopedGardenEnvironmentId: string | null
              scopedAccountId: string | null
            }
          >
          meta: object
        }>
        legacyGetDefaultProjectList: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            projectId: string
          }
          output: {
            description: string
            name: string
            migratedFromProjectId: string | null
            id: `varlist_${string}`
          }
          meta: object
        }>
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            description: string
            name: string
            organizationId: string
            adminOnly: boolean
          }
          output: {
            description: string
            name: string
            organizationId: string
            adminOnly: boolean
            id: `varlist_${string}`
          }
          meta: object
        }>
        update: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            variableListId: string
            description?: string | undefined
            name?: string | undefined
            adminOnly?: boolean | undefined
          }
          output: {
            description: string
            name: string
            organizationId: string
            adminOnly: boolean
            id: `varlist_${string}`
          }
          meta: object
        }>
        delete: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            variableListId: string
          }
          output: {
            success: boolean
          }
          meta: object
        }>
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            variableListId: string
          }
          output: {
            description: string
            name: string
            organizationId: string
            adminOnly: boolean
            migratedFromProjectId: string | null
            id: string
            createdAt: Date
            updatedAt: Date
          }
          meta: object
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
          }
          output: {
            description: string
            name: string
            organizationId: string
            adminOnly: boolean
            id: `varlist_${string}`
            createdAt: Date
            updatedAt: Date
          }[]
          meta: object
        }>
      }>
    >
  }>
>
export type AppRouter = typeof appRouter
