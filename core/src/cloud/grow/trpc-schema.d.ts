export declare const appRouter: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<{
    ctx: import("./context").Context;
    meta: object;
    errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>;
    transformer: true;
}, import("@trpc/server/unstable-core-do-not-import").DecorateCreateRouterOptions<{
    account: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<{
        ctx: import("./context").Context;
        meta: object;
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>;
        transformer: true;
    }, {
        getCurrentAccount: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                id: string;
                name: string;
                email: string;
                createdAt: Date;
                updatedAt: Date;
            } | null;
        }>;
        register: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                email: string;
                password: string;
                port?: number | undefined;
            };
            output: {
                redirectTo: string;
            };
        }>;
        authenticate: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                email: string;
                password: string;
                port?: number | undefined;
            };
            output: {
                redirectTo: string;
            };
        }>;
        clearSession: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: {
                redirectTo: string;
            };
        }>;
        oauthUrlRedirect: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                provider: "github";
                port?: number | undefined;
            };
            output: {
                url: string;
            };
        }>;
        authenticateGrow: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: void;
        }>;
        githubOauthCallback: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: void;
        }>;
    }>;
    commandRun: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<{
        ctx: import("./context").Context;
        meta: object;
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>;
        transformer: true;
    }, {
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                status: "unknown" | "error" | "active" | "success" | "cancelled";
                command: string;
                clientVersion: string;
                startedAt: Date;
                completedAt: Date | null;
                gitCommitHash: string | null;
                gitRepositoryUrl: string | null;
                gitBranchName: string | null;
                gitIsDirty: boolean | null;
            };
            output: {
                status: "unknown" | "error" | "active" | "success" | "cancelled";
                id: string;
                createdAt: Date;
                updatedAt: Date;
                accountId: string;
                organizationId: string;
                command: string;
                clientVersion: string;
                startedAt: Date;
                completedAt: Date;
                gitCommitHash: string;
                gitRepositoryUrl: string;
                gitBranchName: string;
                gitIsDirty: boolean;
            };
        }>;
        get: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                commandRunId: string;
            };
            output: {
                commandRun: {
                    status: "unknown" | "error" | "active" | "success" | "cancelled";
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    accountId: string;
                    organizationId: string;
                    command: string;
                    clientVersion: string;
                    startedAt: Date;
                    completedAt: Date;
                    gitCommitHash: string;
                    gitRepositoryUrl: string;
                    gitBranchName: string;
                    gitIsDirty: boolean;
                };
                actionRuns: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    startedAt: Date;
                    completedAt: Date | null;
                    commandRunId: string;
                    actionUid: string;
                    actionName: string;
                    actionType: string;
                    actionVersion: string;
                    actionVersionResolved: string | null;
                    actionState: "unknown" | "getting-status" | "cached" | "not-ready" | "processing" | "failed" | "ready";
                    actionOutputs: Record<string, unknown>;
                    force: boolean;
                    durationMs: number | null;
                }[];
            };
        }>;
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                cursor?: number | undefined;
                perPage?: number | undefined;
                sortOrder?: "asc" | "desc" | undefined;
                dates?: {
                    from?: number | undefined;
                    to?: number | undefined;
                } | undefined;
            };
            output: {
                items: {
                    status: "unknown" | "error" | "active" | "success" | "cancelled";
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    accountId: string;
                    organizationId: string;
                    command: string;
                    clientVersion: string;
                    startedAt: Date;
                    completedAt: Date;
                    gitCommitHash: string;
                    gitRepositoryUrl: string;
                    gitBranchName: string;
                    gitIsDirty: boolean;
                }[];
                nextCursor: number | undefined;
            };
        }>;
        timelineChart: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                dates?: {
                    from?: number | undefined;
                    to?: number | undefined;
                } | undefined;
            };
            output: {
                timestamp: number;
                cancelled: number;
                failed: number;
                successful: number;
            }[];
        }>;
    }>;
    events: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<{
        ctx: import("./context").Context;
        meta: object;
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>;
        transformer: true;
    }, {
        process: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                commandRunId: string;
                events: ({
                    name: "sessionCompleted";
                    timestamp: string;
                    payload: {
                        completedAt: Date;
                    };
                    eventUid: string;
                } | {
                    name: "sessionFailed";
                    timestamp: string;
                    payload: {
                        completedAt: Date;
                    };
                    eventUid: string;
                } | {
                    name: "sessionCancelled";
                    timestamp: string;
                    payload: {
                        completedAt: Date;
                    };
                    eventUid: string;
                } | {
                    name: "commandInfo";
                    timestamp: string;
                    payload: {
                        name: string;
                        args: Record<string, string | number | boolean | (string | number | boolean | null)[] | null>;
                        opts: Record<string, string | number | boolean | (string | number | boolean | null)[] | null>;
                        projectName: string;
                        projectId: string;
                        coreVersion: string;
                        vcsBranch: string;
                        vcsCommitHash: string;
                        vcsOriginUrl: string;
                    };
                    eventUid: string;
                } | {
                    name: "deployStatus";
                    timestamp: string;
                    payload: {
                        status: {
                            state: "unknown" | "getting-status" | "cached" | "not-ready" | "processing" | "failed" | "ready";
                            ingresses?: {
                                path: string;
                                hostname: string;
                                protocol: "http" | "https";
                                port?: number | undefined;
                                linkUrl?: string | undefined;
                            }[] | undefined;
                        };
                        startedAt: Date;
                        actionUid: string;
                        actionName: string;
                        actionType: string;
                        actionVersion: string;
                        actionState: "unknown" | "getting-status" | "cached" | "not-ready" | "processing" | "failed" | "ready";
                        actionOutputs: {};
                        force: boolean;
                        operation: "process" | "getStatus";
                        sessionId: string;
                        completedAt?: Date | undefined;
                        actionVersionResolved?: string | undefined;
                    };
                    eventUid: string;
                } | {
                    name: "runStatus";
                    timestamp: string;
                    payload: {
                        status: {
                            state: "unknown" | "failed" | "outdated" | "running" | "succeeded" | "not-implemented";
                        };
                        startedAt: Date;
                        actionUid: string;
                        actionName: string;
                        actionType: string;
                        actionVersion: string;
                        actionState: "unknown" | "getting-status" | "cached" | "not-ready" | "processing" | "failed" | "ready";
                        actionOutputs: {};
                        force: boolean;
                        operation: "process" | "getStatus";
                        sessionId: string;
                        completedAt?: Date | undefined;
                        actionVersionResolved?: string | undefined;
                    };
                    eventUid: string;
                })[];
            };
            output: {}[];
        }>;
    }>;
    logEntry: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<{
        ctx: import("./context").Context;
        meta: object;
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>;
        transformer: true;
    }, {
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                commandRunId: string;
                logEntries: {
                    message: {
                        symbol: string | null;
                        error: string | null;
                        section: string | null;
                        msg: string | null;
                        rawMsg: string | null;
                        dataFormat: "json" | "yaml" | null;
                    };
                    level: "debug" | "info" | "warn" | "error" | "verbose" | "silly";
                    timestamp: string;
                    actionUid: string | null;
                    actionName: string | null;
                    key: string;
                }[];
            };
            output: void;
        }>;
        getByCommandRunId: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                commandRunId: string;
                cursor?: number | undefined;
                perPage?: number | undefined;
                section?: string | undefined;
                logLevels?: ("debug" | "info" | "warn" | "error" | "verbose" | "silly")[] | undefined;
            };
            output: {
                items: {
                    message: {
                        symbol: string | null;
                        error: string | null;
                        section: string | null;
                        msg: string | null;
                        rawMsg: string | null;
                        dataFormat: "json" | "yaml" | null;
                    };
                    level: "debug" | "info" | "warn" | "error" | "verbose" | "silly";
                    timestamp: string;
                    actionUid: string | null;
                    actionName: string | null;
                    key: string;
                }[];
                sections: string[];
                nextCursor?: number | undefined;
            };
        }>;
        getAll: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                logEntries: {
                    message: {
                        symbol: string | null;
                        error: string | null;
                        section: string | null;
                        msg: string | null;
                        rawMsg: string | null;
                        dataFormat: "json" | "yaml" | null;
                    };
                    level: "debug" | "info" | "warn" | "error" | "verbose" | "silly";
                    timestamp: string;
                    actionUid: string | null;
                    actionName: string | null;
                    key: string;
                }[];
            };
        }>;
    }>;
    token: import("@trpc/server/unstable-core-do-not-import").BuiltRouter<{
        ctx: import("./context").Context;
        meta: object;
        errorShape: import("@trpc/server/unstable-core-do-not-import").TRPCErrorShape<object>;
        transformer: true;
    }, {
        verifyToken: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                token: string;
            };
            output: {
                valid: boolean;
            };
        }>;
        refreshToken: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                refreshToken: string;
            };
            output: {
                refreshToken: string;
                accessToken: string;
                tokenValidity: number;
            };
        }>;
        revokeToken: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                token: string;
            };
            output: {
                revoked: true;
            };
        }>;
        createAccessToken: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                label: string;
            };
            output: {
                value: string;
                type: "access" | "refresh" | "web";
                createdAt: Date;
                updatedAt: Date;
                accountId: string;
                expiresAt: Date;
                label: string | null;
            };
        }>;
        deleteAccessToken: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                token: string;
            };
            output: void;
        }>;
        listTokens: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                type?: "access" | "refresh" | "web" | undefined;
                cursor?: number | undefined;
                perPage?: number | undefined;
            };
            output: {
                items: {
                    value: string;
                    type: "access" | "refresh" | "web";
                    createdAt: Date;
                    updatedAt: Date;
                    accountId: string;
                    expiresAt: Date;
                    label: string | null;
                }[];
                nextCursor?: number | undefined;
            };
        }>;
    }>;
}>>;
export type AppRouter = typeof appRouter;
