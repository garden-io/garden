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
    ctx: any
    meta: object
    errorShape: import("@trpc/server").TRPCErrorShape<object>
    transformer: true
  },
  import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    account: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getCurrentAccount: import("@trpc/server").TRPCQueryProcedure<{
          input: void
          output: {
            name: string
            email: string
            avatarUrl: string
            id: string
            createdAt: Date
            updatedAt: Date
            organizations: {
              name: string
              id: string
              createdAt: Date
              updatedAt: Date
              role: "admin" | "member"
              slug: string | null
              isCurrentUserOwner: boolean
              featureFlags: ("variables" | "command-runs" | "aec-ui" | "private-container-builder")[]
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
            provider: "github"
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
              email: string
              id: string
              createdAt: Date
              updatedAt: Date
              role: "admin" | "member"
              expiresAt: Date | null
              isOwner: boolean
              kind: "account" | "invitation"
              serviceAccount?: boolean | undefined
              tokens?:
                | {
                    description: string | null
                    type: "access" | "refresh" | "web"
                    id: string
                    createdAt: Date
                    updatedAt: Date
                    accountId: string
                    expiresAt: Date
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
            email: string
            id: string
            createdAt: Date
            updatedAt: Date
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
            email: string
            id: string
            createdAt: Date
            updatedAt: Date
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
            email: string
            avatarUrl: string
            id: string
            createdAt: Date
            updatedAt: Date
            organizations: {
              name: string
              id: string
              createdAt: Date
              updatedAt: Date
              role: "admin" | "member"
              slug: string | null
              isCurrentUserOwner: boolean
              featureFlags: ("variables" | "command-runs" | "aec-ui" | "private-container-builder")[]
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
            email: string
            id: string
            createdAt: Date
            updatedAt: Date
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
              email: string
              id: string
              createdAt: Date
              updatedAt: Date
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
            email: string
            id: string
            createdAt: Date
            updatedAt: Date
            role: "admin" | "member"
            isOwner: boolean
          }
          meta: object
        }>
      }>
    >
    actionCache: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        listEnvironmentStatuses: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            projectId?: string | undefined
            cursor?: number | undefined
            perPage?: number | undefined
            environmentName?: string | undefined
            environmentType?: string | undefined
            orderBy?: "timestamp" | "projectId" | "environmentName" | "latestEventUlid" | undefined
            sortOrder?: "asc" | "desc" | undefined
          }
          output: {
            items: {
              error: boolean
              organizationId: string
              timestamp: Date
              projectId: string
              success: boolean | null
              environmentName: string
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
            projectId: string
            environmentName: string
            environmentType: string
          }
          output: {
            error: boolean
            organizationId: string
            timestamp: Date
            projectId: string
            success: boolean | null
            environmentName: string
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
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
            id: string
            createdAt: Date
            updatedAt: Date
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
            registrationToken: string
          }
          meta: object
        }>
        get: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            id: string
            organizationId: string
          }
          output: {
            description: string
            id: string
            createdAt: Date
            updatedAt: Date
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
          meta: object
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
          }
          output: {
            description: string
            id: string
            createdAt: Date
            updatedAt: Date
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
          }[]
          meta: object
        }>
      }>
    >
    agentInstance: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        trackPageViewEvent: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            userAgent: string
            path: string
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        currentPlan: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
          }
          output: {
            resolvedPlan: "free" | "trial" | "team" | "enterprise"
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
                interval: "month" | "year" | "day" | "week"
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
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
    commandRun: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getCommandExecutionStatus: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            id: string
            organizationId: string
          }
          output: {
            status: "FAILED" | "SUCCEEDED" | "RUNNING" | "TIMED_OUT"
            id: string
            organizationId: string
            startedAt: Date
            completedAt: Date | null
            actorId: string
            commandUlid: string
            sessionUlid: string
            createdEventUlid: string
            updatedEventUlid: string
            lastHeartbeatAt: Date | null
            gitMetadata: {
              gitRemotes: {
                name: string
                url: string
              }[]
              headRefName: string
              headRefSha: string
              repositoryRootDir: string
            }
            invocation: {
              cwd: string
              instruction: {
                name: string
                args: string[]
              }
            }
            isCustomCommand: boolean
            projectMetadata: {
              environmentName: string
              namespaceName: string
              projectApiVersion: string
              projectName: string
              projectRootDir: string
            }
            account?:
              | {
                  name: string | null
                  email: string
                  id: string
                  createdAt: Date
                  updatedAt: Date
                  serviceAccount?: boolean | undefined
                }
              | undefined
          }
          meta: object
        }>
        listCommandExecutionStatuses: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            accountIds: string[] | null
            projectNames: string[] | null
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
              status: "FAILED" | "SUCCEEDED" | "RUNNING" | "TIMED_OUT"
              id: string
              organizationId: string
              startedAt: Date
              completedAt: Date | null
              actorId: string
              commandUlid: string
              sessionUlid: string
              createdEventUlid: string
              updatedEventUlid: string
              lastHeartbeatAt: Date | null
              gitMetadata: {
                gitRemotes: {
                  name: string
                  url: string
                }[]
                headRefName: string
                headRefSha: string
                repositoryRootDir: string
              }
              invocation: {
                cwd: string
                instruction: {
                  name: string
                  args: string[]
                }
              }
              isCustomCommand: boolean
              projectMetadata: {
                environmentName: string
                namespaceName: string
                projectApiVersion: string
                projectName: string
                projectRootDir: string
              }
              account?:
                | {
                    name: string | null
                    email: string
                    id: string
                    createdAt: Date
                    updatedAt: Date
                    serviceAccount?: boolean | undefined
                  }
                | undefined
            }[]
            nextCursor?: number | undefined
          }
          meta: object
        }>
        getActionStatuses: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            id: string
            organizationId: string
          }
          output: {
            actionStatuses: {
              type: string
              status: "aborted" | "ready" | "cached" | "processing" | "failed" | "getting-status" | "queued"
              name: string
              organizationId: string
              kind: "Build" | "Deploy" | "Run" | "Test"
              actorId: string
              commandUlid: string
              sessionUlid: string
              actionUlid: string
              createdEventUlid: string
              updatedEventUlid: string
              statusCompletedSuccess: boolean | null
              statusCompletedNeedsRun: boolean | null
              runCompletedSuccess: boolean | null
              scannedAt: Date
              dependencies: {
                ref: {
                  name: string
                  kind: "Build" | "Deploy" | "Run" | "Test"
                }
                isExplicit: boolean
              }[]
              statusStartedAt: Date | null
              statusCompletedAt: Date | null
              runStartedAt: Date | null
              runCompletedAt: Date | null
              overallDurationSeconds: number | null
              overallDuration: {
                seconds: number
                years: number
                months: number
                days: number
                hours: number
                minutes: number
                milliseconds: number
              } | null
              runDuration: {
                seconds: number
                years: number
                months: number
                days: number
                hours: number
                minutes: number
                milliseconds: number
              } | null
              statusDuration: {
                seconds: number
                years: number
                months: number
                days: number
                hours: number
                minutes: number
                milliseconds: number
              } | null
              commandStatus: "FAILED" | "SUCCEEDED" | "RUNNING" | "TIMED_OUT"
              buildGetStatusResult: {
                state: "unspecified" | "found-in-registry" | "missing-from-registry"
              } | null
              deployGetStatusResult: {
                state: "ready" | "unspecified" | "outdated" | "missing" | "unhealthy" | "deploying" | "stopped"
              } | null
              runGetStatusResult: {
                state:
                  | "unspecified"
                  | "found-in-team-cache"
                  | "found-in-local-cache"
                  | "missing-checked-all-caches"
                  | "missing-checked-local-cache"
              } | null
              testGetStatusResult: {
                state:
                  | "unspecified"
                  | "found-in-team-cache"
                  | "found-in-local-cache"
                  | "missing-checked-all-caches"
                  | "missing-checked-local-cache"
              } | null
              deployRunResult: {
                createdAt?: string | undefined
                updatedAt?: string | undefined
                mode?: string | undefined
                state?: string | undefined
                externalId?: string | undefined
                externalVersion?: string | undefined
                ingresses?:
                  | {
                      path: string
                      hostname: string
                      protocol: string
                      port?: number | undefined
                      linkUrl?: string | undefined
                    }[]
                  | undefined
                lastMessage?: string | undefined
                lastError?: string | undefined
                runningReplicas?: number | undefined
              } | null
            }[]
          }
          meta: object
        }>
      }>
    >
    dockerBuild: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
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
              id: string
              createdAt: Date
              updatedAt: Date
              organizationId: string
              accountId: string
              startedAt: Date
              accountName: string
              dockerRawjsonLogs: Record<string, unknown>[]
              actualRuntime: string
              sourceFilename: string | null
              sourceLanguage: string | null
              sourceData: string | null
              completedAt?: Date | null | undefined
              platforms?: string[] | null | undefined
              fallbackReason?: string | null | undefined
              dockerClientVersion?: string | null | undefined
              dockerServerVersion?: string | null | undefined
              builderImplicitName?: string | null | undefined
              builderIsDefault?: boolean | null | undefined
              builderDriver?: string | null | undefined
              tags?: string[] | null | undefined
              imageManifestDigest?: string | null | undefined
              buildxBuildRef?: string | null | undefined
              executedVertexDigests?: string[] | null | undefined
              cachedVertexDigests?: string[] | null | undefined
              timeSavedMs?: number | null | undefined
              preferredRuntime?: string | null | undefined
            }[]
            nextCursor?: number | undefined
          }
          meta: object
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
            organizationId: string
            accountId: string
            startedAt: Date
            accountName: string
            dockerRawjsonLogs: Record<string, unknown>[]
            actualRuntime: string
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
            dockerClientVersion?: string | null | undefined
            dockerServerVersion?: string | null | undefined
            builderImplicitName?: string | null | undefined
            builderIsDefault?: boolean | null | undefined
            builderDriver?: string | null | undefined
            tags?: string[] | null | undefined
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
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
            plan: "free" | "trial" | "team" | "enterprise"
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
            plan: "free" | "trial" | "team" | "enterprise"
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
              plan: "free" | "trial" | "team" | "enterprise"
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
            plan: "free" | "trial" | "team" | "enterprise"
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
            enabled: boolean
            description: string
            name: string
            id: string
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
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
            description: string | null
            value: string
            type: "access" | "refresh" | "web"
            id: string
            createdAt: Date
            updatedAt: Date
            accountId: string
            expiresAt: Date
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
            description: string | null
            value: string
            type: "access" | "refresh" | "web"
            id: string
            createdAt: Date
            updatedAt: Date
            accountId: string
            expiresAt: Date
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
            description: string | null
            type: "access" | "refresh" | "web"
            id: string
            createdAt: Date
            updatedAt: Date
            accountId: string
            expiresAt: Date
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
              description: string | null
              type: "access" | "refresh" | "web"
              id: string
              createdAt: Date
              updatedAt: Date
              accountId: string
              expiresAt: Date
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            description: string | null
            value: string
            name: string
            organizationId: string
            expiresAt: Date | null
            variableListId: string
            isSecret: boolean
            scopedGardenEnvironmentId: string | null
            scopedAccountId: string | null
            scopedGardenEnvironmentName: string | null
          }
          output: {
            id: string
          }
          meta: object
        }>
        update: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            description: string | null
            organizationId: string
            expiresAt: Date | null
            scopedGardenEnvironmentId: string | null
            scopedAccountId: string | null
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
            id: string
            createdAt: Date
            updatedAt: Date
            organizationId: string
            expiresAt: Date | null
            isSecret: boolean
            scopedGardenEnvironmentId: string | null
            scopedAccountId: string | null
            createdByAccountId: string
            value: string
            createdByName: string | null
            scopedGardenEnvironmentName: string | null
            scopedAccountName: string | null
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        listEnvironments: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            variableListId: string
          }
          output: {
            description: string | null
            name: string
            id: string
          }[]
          meta: object
        }>
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
                variableListName: string
                gardenEnvironmentName: string
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
            id: `varlist_${string}`
            migratedFromProjectId: string | null
          }
          meta: object
        }>
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            description: string
            name: string
            organizationId: string
          }
          output: {
            description: string
            name: string
            id: `varlist_${string}`
            organizationId: string
          }
          meta: object
        }>
        update: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            variableListId: string
            description?: string | undefined
            name?: string | undefined
          }
          output: {
            description: string
            name: string
            id: `varlist_${string}`
            organizationId: string
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
            id: string
            createdAt: Date
            updatedAt: Date
            organizationId: string
            migratedFromProjectId: string | null
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
            id: `varlist_${string}`
            createdAt: Date
            updatedAt: Date
            organizationId: string
          }[]
          meta: object
        }>
        listVariables: import("@trpc/server").TRPCQueryProcedure<{
          input:
            | {
                organizationId: string
                variableListId: string
                search?: string | undefined
                variableListName?: string | undefined
                cursor?: number | undefined
                perPage?: number | undefined
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
              id: string
              createdAt: Date
              updatedAt: Date
              organizationId: string
              expiresAt: Date | null
              isSecret: boolean
              scopedGardenEnvironmentId: string | null
              scopedAccountId: string | null
              createdByAccountId: string
              value: string
              variableListName: string | null
              variableListDescription: string | null
              createdByName: string | null
              scopedGardenEnvironmentName: string | null
              scopedAccountName: string | null
            }[]
            nextCursor: number | undefined
          }
          meta: object
        }>
      }>
    >
  }>
>
export type AppRouter = typeof appRouter
