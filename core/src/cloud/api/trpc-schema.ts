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
            organizationId?: string | undefined
            port?: number | undefined
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
            organizationId?: string | undefined
            port?: number | undefined
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
            organizationId?: string | undefined
            port?: number | undefined
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
              email: string
              kind: "account" | "invitation"
              role: "admin" | "member"
              expiresAt: Date | null
              isOwner: boolean
              serviceAccount?: boolean | undefined
              tokens?:
                | {
                    type: "access" | "refresh" | "web"
                    id: string
                    createdAt: Date
                    updatedAt: Date
                    description: string | null
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
            token: string
            account: {
              name: string
              id: string
              createdAt: Date
              updatedAt: Date
              email: string
              role: "admin" | "member"
              isOwner: boolean
            }
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        createEntry: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            startedAt: string
            completedAt: string
            schemaVersion: string
            actionType: string
            actionRef: string
            cacheKey: string
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
            environmentType?: string | undefined
            environmentName?: string | undefined
            cursor?: number | undefined
            perPage?: number | undefined
            orderBy?: "projectId" | "environmentName" | "latestEventUlid" | "timestamp" | undefined
            sortOrder?: "asc" | "desc" | undefined
          }
          output: {
            items: {
              error: boolean
              organizationId: string
              success: boolean | null
              commandUlid: string
              sessionUlid: string
              actorId: string
              projectId: string
              environmentType: string
              environmentName: string
              agentPluginName: string
              agentEnvironmentType: string
              latestEventUlid: string
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
              timestamp: Date
            }[]
            nextCursor?: number | undefined
          }
          meta: object
        }>
        getEnvironmentStatus: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            projectId: string
            environmentType: string
            environmentName: string
          }
          output: {
            error: boolean
            organizationId: string
            success: boolean | null
            commandUlid: string
            sessionUlid: string
            actorId: string
            projectId: string
            environmentType: string
            environmentName: string
            agentPluginName: string
            agentEnvironmentType: string
            latestEventUlid: string
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
            timestamp: Date
          } | null
          meta: object
        }>
        listAgentStatuses: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            agentPluginName?: string | undefined
            agentEnvironmentType?: string | undefined
            cursor?: number | undefined
            perPage?: number | undefined
            orderBy?: "agentPluginName" | "agentEnvironmentType" | "latestEventUlid" | "timestamp" | undefined
            sortOrder?: "asc" | "desc" | undefined
          }
          output: {
            items: {
              status: "Unknown" | "Running" | "Stopped" | "Error" | "Inactive"
              organizationId: string
              commandUlid: string
              sessionUlid: string
              actorId: string
              agentPluginName: string
              agentEnvironmentType: string
              latestEventUlid: string
              agentDescription: {
                project: string
                k8sContext: string
                namespace: string
              }
              agentVersion: string | null
              statusDescription: string
              timestamp: Date
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
            commandUlid: string
            sessionUlid: string
            actorId: string
            agentPluginName: string
            agentEnvironmentType: string
            latestEventUlid: string
            agentDescription: {
              project: string
              k8sContext: string
              namespace: string
            }
            agentVersion: string | null
            statusDescription: string
            timestamp: Date
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
            organizationId: string
            description: string
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
            id: string
            createdAt: Date
            updatedAt: Date
            organizationId: string
            registrationToken: string
            description: string
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
            id: string
            createdAt: Date
            updatedAt: Date
            organizationId: string
            description: string
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
            path: string
            title: string
            userAgent: string
            url: string
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
          output:
            | {
                resolvedPlan: "enterprise"
                maxSeats?: number | null | undefined
              }
            | {
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
                products: {
                  name: string
                  id: `prod_${string}`
                  description: string | null
                  metadata: Record<string, unknown>
                  defaultPrice?: `price_${string}` | undefined
                }[]
                resolvedPlan: "free" | "team"
                maxSeats?: number | null | undefined
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            id: string
            organizationId: string
            actionUlid?: string | undefined
            cursor?: number | undefined
            perPage?: number | undefined
            sortOrder?: "asc" | "desc" | undefined
            maxLogLevel?: string | undefined
          }
          output: {
            items: {
              organizationId: string
              commandUlid: string
              sessionUlid: string
              actorId: string
              actionUlid: string | null
              eventUlid: string
              logLevel: number
              originDescription: string | null
              loggedAt: Date
              logDetails: {
                symbol?: string | undefined
                error?: string | undefined
                data?: string | undefined
                msg?: string | undefined
                rawMsg?: string | undefined
                dataFormat?: string | undefined
                section?: string | undefined
                coreLog?:
                  | {
                      name?: string | undefined
                      origin?: string | undefined
                    }
                  | undefined
                actionLog?:
                  | {
                      actionName: string
                      actionKind: string
                      actionUid: string
                      origin?: string | undefined
                    }
                  | undefined
              }
            }[]
            nextCursor?: number | undefined
          }
          meta: object
        }>
        watch: import("@trpc/server").TRPCSubscriptionProcedure<{
          input: {
            id: string
            organizationId: string
            actionUlid?: string | undefined
          }
          output: any
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
        watchCommandExecutionStatus: import("@trpc/server").TRPCSubscriptionProcedure<{
          input: {
            organizationId: string
            accountIds: string[] | null
            projectNames: string[] | null
            lastKnownEventUlid: string
            dates?:
              | {
                  from?: number | undefined
                  to?: number | undefined
                }
              | undefined
          }
          output: AsyncIterable<
            {
              type: "created" | "updated"
              data: {
                account:
                  | {
                      name: string
                      id: string
                      createdAt: Date
                      updatedAt: Date
                      email: string
                      avatarUrl: string
                      otherEmails: string | undefined
                      githubUsername: string | undefined
                      gitlabUsername: string | undefined
                      serviceAccount: boolean | undefined
                    }
                  | undefined
                id: string
                status: string
                organizationId: string
                startedAt: Date
                completedAt: Date | null
                createdEventUlid: string
                updatedEventUlid: string
                commandUlid: string
                sessionUlid: string
                actorId: string
                isCustomCommand: boolean
                completedSuccessfully: boolean | null
                lastHeartbeatAt: Date | null
                projectName: string
                invocation: any
                gitMetadata: any
                projectMetadata: any
              }
            },
            void,
            any
          >
          meta: object
        }>
        watchActionStatuses: import("@trpc/server").TRPCSubscriptionProcedure<{
          input: {
            id: string
            organizationId: string
            lastKnownEventUlid: string
          }
          output: any
          meta: object
        }>
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
            createdEventUlid: string
            updatedEventUlid: string
            commandUlid: string
            sessionUlid: string
            actorId: string
            isCustomCommand: boolean
            lastHeartbeatAt: Date | null
            invocation: {
              cwd: string
              instruction: {
                name: string
                args: string[]
              }
            }
            gitMetadata: {
              gitRemotes: {
                name: string
                url: string
              }[]
              headRefName: string
              headRefSha: string
              repositoryRootDir: string
            }
            projectMetadata: {
              projectName: string
              environmentName: string
              namespaceName: string
              projectApiVersion: string
              projectRootDir: string
            }
            account?:
              | {
                  name: string | null
                  id: string
                  createdAt: Date
                  updatedAt: Date
                  email: string
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
              createdEventUlid: string
              updatedEventUlid: string
              commandUlid: string
              sessionUlid: string
              actorId: string
              isCustomCommand: boolean
              lastHeartbeatAt: Date | null
              invocation: {
                cwd: string
                instruction: {
                  name: string
                  args: string[]
                }
              }
              gitMetadata: {
                gitRemotes: {
                  name: string
                  url: string
                }[]
                headRefName: string
                headRefSha: string
                repositoryRootDir: string
              }
              projectMetadata: {
                projectName: string
                environmentName: string
                namespaceName: string
                projectApiVersion: string
                projectRootDir: string
              }
              account?:
                | {
                    name: string | null
                    id: string
                    createdAt: Date
                    updatedAt: Date
                    email: string
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
              name: string
              type: string
              status: "aborted" | "failed" | "ready" | "cached" | "processing" | "getting-status" | "queued"
              organizationId: string
              createdEventUlid: string
              updatedEventUlid: string
              commandUlid: string
              sessionUlid: string
              actorId: string
              actionUlid: string
              kind: "Build" | "Deploy" | "Run" | "Test"
              statusCompletedSuccess: boolean | null
              statusCompletedNeedsRun: boolean | null
              runCompletedSuccess: boolean | null
              scannedAt: Date
              statusStartedAt: Date | null
              statusCompletedAt: Date | null
              runStartedAt: Date | null
              runCompletedAt: Date | null
              overallDurationSeconds: number | null
              overallDuration: {
                years: number
                months: number
                days: number
                hours: number
                minutes: number
                seconds: number
                milliseconds: number
              } | null
              runDuration: {
                years: number
                months: number
                days: number
                hours: number
                minutes: number
                seconds: number
                milliseconds: number
              } | null
              statusDuration: {
                years: number
                months: number
                days: number
                hours: number
                minutes: number
                seconds: number
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
                state?: string | undefined
                mode?: string | undefined
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
              dependencies: {
                ref: {
                  name: string
                  kind: "Build" | "Deploy" | "Run" | "Test"
                }
                isExplicit: boolean
              }[]
            }[]
          }
          meta: object
        }>
      }>
    >
    gardenEnvironment: import("@trpc/server").TRPCBuiltRouter<
      {
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
        transformer: true
      },
      import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
            variableListId: string
          }
          output: {
            name: string
            id: string
            description: string | null
            adminOnly: boolean
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
            name: string
            id: string
            description: string | null
            variableListId: `varlist_${string}`
          }
          meta: object
        }>
        updateAdminOnlySettings: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            variableListId: string
            adminOnly: boolean
            environmentId: string
          }
          output: {
            name: string
            id: string
            description: string | null
            variableListId: `varlist_${string}`
            adminOnly: boolean
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
            id: string
            organizationId: string
            variableListId: `varlist_${string}`
            adminOnly: boolean
          }
          meta: object
        }>
        delete: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            variableListId: string
            environmentId: string
          }
          output: void
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
              accountName: string
              startedAt: Date
              dockerRawjsonLogs: Record<string, unknown>[]
              actualRuntime: string
              sourceFilename: string | null
              sourceLanguage: string | null
              sourceData: string | null
              completedAt?: Date | null | undefined
              platforms?: string[] | null | undefined
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
              fallbackReason?: string | null | undefined
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
            accountName: string
            startedAt: Date
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
            fallbackReason?: string | null | undefined
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
            name: string
            id: string
            description: string
            visible: boolean
            enabled: boolean
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
              severity: "info" | "error" | "warning"
            }[]
          }
          meta: object
        }>
        refreshToken: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            refreshToken: string
          }
          output: {
            accessToken: string
            refreshToken: string
            tokenValidity: number
            notices: {
              message: string
              severity: "info" | "error" | "warning"
            }[]
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
            id: string
            createdAt: Date
            updatedAt: Date
            description: string | null
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
            value: string
            type: "access" | "refresh" | "web"
            id: string
            createdAt: Date
            updatedAt: Date
            description: string | null
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
            type: "access" | "refresh" | "web"
            id: string
            createdAt: Date
            updatedAt: Date
            description: string | null
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
              type: "access" | "refresh" | "web"
              id: string
              createdAt: Date
              updatedAt: Date
              description: string | null
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
            name: string
            value: string
            organizationId: string
            description: string | null
            variableListId: string
            expiresAt: Date | null
            isSecret: boolean
            scopedAccountId: string | null
            scopedGardenEnvironmentId: string | null
            scopedGardenEnvironmentName: string | null
          }
          output: {
            id: string
          }
          meta: object
        }>
        update: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            description: string | null
            expiresAt: Date | null
            scopedAccountId: string | null
            scopedGardenEnvironmentId: string | null
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
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            organizationId: string
            description: string | null
            expiresAt: Date | null
            isSecret: boolean
            scopedAccountId: string | null
            createdByAccountId: string
            scopedGardenEnvironmentId: string | null
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
                variableListId?: string | undefined
                search?: string | undefined
                cursor?: number | undefined
                perPage?: number | undefined
              }
          output: {
            items: {
              name: string
              id: string
              createdAt: Date
              updatedAt: Date
              organizationId: string
              description: string | null
              expiresAt: Date | null
              isSecret: boolean
              scopedAccountId: string | null
              createdByAccountId: string
              scopedGardenEnvironmentId: string | null
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
        ctx: any
        meta: object
        errorShape: import("@trpc/server").TRPCErrorShape<object>
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
              scopedAccountId: string | null
              scopedGardenEnvironmentId: string | null
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
            name: string
            id: `varlist_${string}`
            description: string
            migratedFromProjectId: string | null
          }
          meta: object
        }>
        create: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            name: string
            organizationId: string
            description: string
            adminOnly: boolean
          }
          output: {
            name: string
            id: `varlist_${string}`
            organizationId: string
            description: string
            adminOnly: boolean
          }
          meta: object
        }>
        update: import("@trpc/server").TRPCMutationProcedure<{
          input: {
            organizationId: string
            variableListId: string
            name?: string | undefined
            description?: string | undefined
            adminOnly?: boolean | undefined
          }
          output: {
            name: string
            id: `varlist_${string}`
            organizationId: string
            description: string
            adminOnly: boolean
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
            name: string
            id: string
            createdAt: Date
            updatedAt: Date
            organizationId: string
            description: string
            adminOnly: boolean
            migratedFromProjectId: string | null
          }
          meta: object
        }>
        list: import("@trpc/server").TRPCQueryProcedure<{
          input: {
            organizationId: string
          }
          output: {
            name: string
            id: `varlist_${string}`
            createdAt: Date
            updatedAt: Date
            organizationId: string
            description: string
            adminOnly: boolean
          }[]
          meta: object
        }>
      }>
    >
  }>
>
export type AppRouter = typeof appRouter
