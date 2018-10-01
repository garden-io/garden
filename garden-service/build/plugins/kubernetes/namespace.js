"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("./api");
const kubernetes_1 = require("./kubernetes");
const exceptions_1 = require("../../exceptions");
const created = {};
function ensureNamespace(api, namespace) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!created[namespace]) {
            const namespacesStatus = yield api.core.listNamespace();
            for (const n of namespacesStatus.body.items) {
                if (n.status.phase === "Active") {
                    created[n.metadata.name] = true;
                }
            }
            if (!created[namespace]) {
                // TODO: the types for all the create functions in the library are currently broken
                yield api.core.createNamespace({
                    apiVersion: "v1",
                    kind: "Namespace",
                    metadata: {
                        name: namespace,
                        annotations: {
                            "garden.io/generated": "true",
                        },
                    },
                });
                created[namespace] = true;
            }
        }
    });
}
exports.ensureNamespace = ensureNamespace;
function getNamespace({ ctx, provider, suffix, skipCreate }) {
    return __awaiter(this, void 0, void 0, function* () {
        let namespace;
        if (provider.config.namespace) {
            namespace = provider.config.namespace;
        }
        else {
            const localConfig = yield ctx.localConfigStore.get();
            const k8sConfig = localConfig.kubernetes || {};
            let { username, ["previous-usernames"]: previousUsernames } = k8sConfig;
            if (!username) {
                username = provider.config.defaultUsername;
            }
            if (!username) {
                throw new exceptions_1.AuthenticationError(`User not logged into provider ${kubernetes_1.name}. Please specify defaultUsername in provider ` +
                    `config or run garden init.`, { previousUsernames, provider: kubernetes_1.name });
            }
            namespace = `garden--${username}--${ctx.projectName}`;
        }
        if (suffix) {
            namespace = `${namespace}--${suffix}`;
        }
        if (!skipCreate) {
            const api = new api_1.KubeApi(provider);
            yield ensureNamespace(api, namespace);
        }
        return namespace;
    });
}
exports.getNamespace = getNamespace;
function getAppNamespace(ctx, provider) {
    return __awaiter(this, void 0, void 0, function* () {
        return getNamespace({ ctx, provider });
    });
}
exports.getAppNamespace = getAppNamespace;
function getMetadataNamespace(ctx, provider) {
    return getNamespace({ ctx, provider, suffix: "metadata" });
}
exports.getMetadataNamespace = getMetadataNamespace;
function getAllGardenNamespaces(api) {
    return __awaiter(this, void 0, void 0, function* () {
        const allNamespaces = yield api.core.listNamespace();
        return allNamespaces.body.items
            .map(n => n.metadata.name)
            .filter(n => n.startsWith("garden--"));
    });
}
exports.getAllGardenNamespaces = getAllGardenNamespaces;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9uYW1lc3BhY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUdILCtCQUErQjtBQUUvQiw2Q0FBbUQ7QUFDbkQsaURBQXNEO0FBRXRELE1BQU0sT0FBTyxHQUFnQyxFQUFFLENBQUE7QUFFL0MsU0FBc0IsZUFBZSxDQUFDLEdBQVksRUFBRSxTQUFpQjs7UUFDbkUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUN2QixNQUFNLGdCQUFnQixHQUFHLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQTtZQUV2RCxLQUFLLE1BQU0sQ0FBQyxJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUU7Z0JBQzNDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEtBQUssUUFBUSxFQUFFO29CQUMvQixPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUE7aUJBQ2hDO2FBQ0Y7WUFFRCxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFO2dCQUN2QixtRkFBbUY7Z0JBQ25GLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQU07b0JBQ2xDLFVBQVUsRUFBRSxJQUFJO29CQUNoQixJQUFJLEVBQUUsV0FBVztvQkFDakIsUUFBUSxFQUFFO3dCQUNSLElBQUksRUFBRSxTQUFTO3dCQUNmLFdBQVcsRUFBRTs0QkFDWCxxQkFBcUIsRUFBRSxNQUFNO3lCQUM5QjtxQkFDRjtpQkFDRixDQUFDLENBQUE7Z0JBQ0YsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLElBQUksQ0FBQTthQUMxQjtTQUNGO0lBQ0gsQ0FBQztDQUFBO0FBekJELDBDQXlCQztBQUVELFNBQXNCLFlBQVksQ0FDaEMsRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQzBEOztRQUU3RixJQUFJLFNBQVMsQ0FBQTtRQUViLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUU7WUFDN0IsU0FBUyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFBO1NBQ3RDO2FBQU07WUFDTCxNQUFNLFdBQVcsR0FBRyxNQUFNLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtZQUNwRCxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQTtZQUM5QyxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUMsb0JBQW9CLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLFNBQVMsQ0FBQTtZQUV2RSxJQUFJLENBQUMsUUFBUSxFQUFFO2dCQUNiLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQTthQUMzQztZQUVELElBQUksQ0FBQyxRQUFRLEVBQUU7Z0JBQ2IsTUFBTSxJQUFJLGdDQUFtQixDQUMzQixpQ0FBaUMsaUJBQVksK0NBQStDO29CQUM1Riw0QkFBNEIsRUFDNUIsRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsaUJBQVksRUFBRSxDQUM5QyxDQUFBO2FBQ0Y7WUFFRCxTQUFTLEdBQUcsV0FBVyxRQUFRLEtBQUssR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFBO1NBQ3REO1FBRUQsSUFBSSxNQUFNLEVBQUU7WUFDVixTQUFTLEdBQUcsR0FBRyxTQUFTLEtBQUssTUFBTSxFQUFFLENBQUE7U0FDdEM7UUFFRCxJQUFJLENBQUMsVUFBVSxFQUFFO1lBQ2YsTUFBTSxHQUFHLEdBQUcsSUFBSSxhQUFPLENBQUMsUUFBUSxDQUFDLENBQUE7WUFDakMsTUFBTSxlQUFlLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFBO1NBQ3RDO1FBRUQsT0FBTyxTQUFTLENBQUE7SUFDbEIsQ0FBQztDQUFBO0FBdENELG9DQXNDQztBQUVELFNBQXNCLGVBQWUsQ0FBQyxHQUFrQixFQUFFLFFBQTRCOztRQUNwRixPQUFPLFlBQVksQ0FBQyxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFBO0lBQ3hDLENBQUM7Q0FBQTtBQUZELDBDQUVDO0FBRUQsU0FBZ0Isb0JBQW9CLENBQUMsR0FBa0IsRUFBRSxRQUE0QjtJQUNuRixPQUFPLFlBQVksQ0FBQyxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUE7QUFDNUQsQ0FBQztBQUZELG9EQUVDO0FBRUQsU0FBc0Isc0JBQXNCLENBQUMsR0FBWTs7UUFDdkQsTUFBTSxhQUFhLEdBQUcsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFBO1FBQ3BELE9BQU8sYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLO2FBQzVCLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO2FBQ3pCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQTtJQUMxQyxDQUFDO0NBQUE7QUFMRCx3REFLQyIsImZpbGUiOiJwbHVnaW5zL2t1YmVybmV0ZXMvbmFtZXNwYWNlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IFBsdWdpbkNvbnRleHQgfSBmcm9tIFwiLi4vLi4vcGx1Z2luLWNvbnRleHRcIlxuaW1wb3J0IHsgS3ViZUFwaSB9IGZyb20gXCIuL2FwaVwiXG5pbXBvcnQgeyBLdWJlcm5ldGVzUHJvdmlkZXIgfSBmcm9tIFwiLi9rdWJlcm5ldGVzXCJcbmltcG9ydCB7IG5hbWUgYXMgcHJvdmlkZXJOYW1lIH0gZnJvbSBcIi4va3ViZXJuZXRlc1wiXG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvbkVycm9yIH0gZnJvbSBcIi4uLy4uL2V4Y2VwdGlvbnNcIlxuXG5jb25zdCBjcmVhdGVkOiB7IFtuYW1lOiBzdHJpbmddOiBib29sZWFuIH0gPSB7fVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZW5zdXJlTmFtZXNwYWNlKGFwaTogS3ViZUFwaSwgbmFtZXNwYWNlOiBzdHJpbmcpIHtcbiAgaWYgKCFjcmVhdGVkW25hbWVzcGFjZV0pIHtcbiAgICBjb25zdCBuYW1lc3BhY2VzU3RhdHVzID0gYXdhaXQgYXBpLmNvcmUubGlzdE5hbWVzcGFjZSgpXG5cbiAgICBmb3IgKGNvbnN0IG4gb2YgbmFtZXNwYWNlc1N0YXR1cy5ib2R5Lml0ZW1zKSB7XG4gICAgICBpZiAobi5zdGF0dXMucGhhc2UgPT09IFwiQWN0aXZlXCIpIHtcbiAgICAgICAgY3JlYXRlZFtuLm1ldGFkYXRhLm5hbWVdID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghY3JlYXRlZFtuYW1lc3BhY2VdKSB7XG4gICAgICAvLyBUT0RPOiB0aGUgdHlwZXMgZm9yIGFsbCB0aGUgY3JlYXRlIGZ1bmN0aW9ucyBpbiB0aGUgbGlicmFyeSBhcmUgY3VycmVudGx5IGJyb2tlblxuICAgICAgYXdhaXQgYXBpLmNvcmUuY3JlYXRlTmFtZXNwYWNlKDxhbnk+e1xuICAgICAgICBhcGlWZXJzaW9uOiBcInYxXCIsXG4gICAgICAgIGtpbmQ6IFwiTmFtZXNwYWNlXCIsXG4gICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgbmFtZTogbmFtZXNwYWNlLFxuICAgICAgICAgIGFubm90YXRpb25zOiB7XG4gICAgICAgICAgICBcImdhcmRlbi5pby9nZW5lcmF0ZWRcIjogXCJ0cnVlXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgICBjcmVhdGVkW25hbWVzcGFjZV0gPSB0cnVlXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXROYW1lc3BhY2UoXG4gIHsgY3R4LCBwcm92aWRlciwgc3VmZml4LCBza2lwQ3JlYXRlIH06XG4gICAgeyBjdHg6IFBsdWdpbkNvbnRleHQsIHByb3ZpZGVyOiBLdWJlcm5ldGVzUHJvdmlkZXIsIHN1ZmZpeD86IHN0cmluZywgc2tpcENyZWF0ZT86IGJvb2xlYW4gfSxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGxldCBuYW1lc3BhY2VcblxuICBpZiAocHJvdmlkZXIuY29uZmlnLm5hbWVzcGFjZSkge1xuICAgIG5hbWVzcGFjZSA9IHByb3ZpZGVyLmNvbmZpZy5uYW1lc3BhY2VcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBsb2NhbENvbmZpZyA9IGF3YWl0IGN0eC5sb2NhbENvbmZpZ1N0b3JlLmdldCgpXG4gICAgY29uc3QgazhzQ29uZmlnID0gbG9jYWxDb25maWcua3ViZXJuZXRlcyB8fCB7fVxuICAgIGxldCB7IHVzZXJuYW1lLCBbXCJwcmV2aW91cy11c2VybmFtZXNcIl06IHByZXZpb3VzVXNlcm5hbWVzIH0gPSBrOHNDb25maWdcblxuICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgIHVzZXJuYW1lID0gcHJvdmlkZXIuY29uZmlnLmRlZmF1bHRVc2VybmFtZVxuICAgIH1cblxuICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBBdXRoZW50aWNhdGlvbkVycm9yKFxuICAgICAgICBgVXNlciBub3QgbG9nZ2VkIGludG8gcHJvdmlkZXIgJHtwcm92aWRlck5hbWV9LiBQbGVhc2Ugc3BlY2lmeSBkZWZhdWx0VXNlcm5hbWUgaW4gcHJvdmlkZXIgYCArXG4gICAgICAgIGBjb25maWcgb3IgcnVuIGdhcmRlbiBpbml0LmAsXG4gICAgICAgIHsgcHJldmlvdXNVc2VybmFtZXMsIHByb3ZpZGVyOiBwcm92aWRlck5hbWUgfSxcbiAgICAgIClcbiAgICB9XG5cbiAgICBuYW1lc3BhY2UgPSBgZ2FyZGVuLS0ke3VzZXJuYW1lfS0tJHtjdHgucHJvamVjdE5hbWV9YFxuICB9XG5cbiAgaWYgKHN1ZmZpeCkge1xuICAgIG5hbWVzcGFjZSA9IGAke25hbWVzcGFjZX0tLSR7c3VmZml4fWBcbiAgfVxuXG4gIGlmICghc2tpcENyZWF0ZSkge1xuICAgIGNvbnN0IGFwaSA9IG5ldyBLdWJlQXBpKHByb3ZpZGVyKVxuICAgIGF3YWl0IGVuc3VyZU5hbWVzcGFjZShhcGksIG5hbWVzcGFjZSlcbiAgfVxuXG4gIHJldHVybiBuYW1lc3BhY2Vcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEFwcE5hbWVzcGFjZShjdHg6IFBsdWdpbkNvbnRleHQsIHByb3ZpZGVyOiBLdWJlcm5ldGVzUHJvdmlkZXIpIHtcbiAgcmV0dXJuIGdldE5hbWVzcGFjZSh7IGN0eCwgcHJvdmlkZXIgfSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1ldGFkYXRhTmFtZXNwYWNlKGN0eDogUGx1Z2luQ29udGV4dCwgcHJvdmlkZXI6IEt1YmVybmV0ZXNQcm92aWRlcikge1xuICByZXR1cm4gZ2V0TmFtZXNwYWNlKHsgY3R4LCBwcm92aWRlciwgc3VmZml4OiBcIm1ldGFkYXRhXCIgfSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEFsbEdhcmRlbk5hbWVzcGFjZXMoYXBpOiBLdWJlQXBpKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBjb25zdCBhbGxOYW1lc3BhY2VzID0gYXdhaXQgYXBpLmNvcmUubGlzdE5hbWVzcGFjZSgpXG4gIHJldHVybiBhbGxOYW1lc3BhY2VzLmJvZHkuaXRlbXNcbiAgICAubWFwKG4gPT4gbi5tZXRhZGF0YS5uYW1lKVxuICAgIC5maWx0ZXIobiA9PiBuLnN0YXJ0c1dpdGgoXCJnYXJkZW4tLVwiKSlcbn1cbiJdfQ==
