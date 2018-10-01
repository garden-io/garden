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
const exceptions_1 = require("../../exceptions");
const namespace_1 = require("./namespace");
function getSecret({ ctx, key }) {
    return __awaiter(this, void 0, void 0, function* () {
        const api = new api_1.KubeApi(ctx.provider);
        const ns = yield namespace_1.getMetadataNamespace(ctx, ctx.provider);
        try {
            const res = yield api.core.readNamespacedSecret(key, ns);
            return { value: Buffer.from(res.body.data.value, "base64").toString() };
        }
        catch (err) {
            if (err.code === 404) {
                return { value: null };
            }
            else {
                throw err;
            }
        }
    });
}
exports.getSecret = getSecret;
function setSecret({ ctx, key, value }) {
    return __awaiter(this, void 0, void 0, function* () {
        // we store configuration in a separate metadata namespace, so that configs aren't cleared when wiping the namespace
        const api = new api_1.KubeApi(ctx.provider);
        const ns = yield namespace_1.getMetadataNamespace(ctx, ctx.provider);
        const body = {
            body: {
                apiVersion: "v1",
                kind: "Secret",
                metadata: {
                    name: key,
                    annotations: {
                        "garden.io/generated": "true",
                    },
                },
                type: "generic",
                stringData: { value },
            },
        };
        try {
            yield api.core.createNamespacedSecret(ns, body);
        }
        catch (err) {
            if (err.code === 409) {
                yield api.core.patchNamespacedSecret(key, ns, body);
            }
            else {
                throw err;
            }
        }
        return {};
    });
}
exports.setSecret = setSecret;
function deleteSecret({ ctx, key }) {
    return __awaiter(this, void 0, void 0, function* () {
        const api = new api_1.KubeApi(ctx.provider);
        const ns = yield namespace_1.getMetadataNamespace(ctx, ctx.provider);
        try {
            yield api.core.deleteNamespacedSecret(key, ns, {});
        }
        catch (err) {
            if (err.code === 404) {
                return { found: false };
            }
            else {
                throw err;
            }
        }
        return { found: true };
    });
}
exports.deleteSecret = deleteSecret;
/**
 * Make sure the specified secret exists in the target namespace, copying it if necessary.
 */
function ensureSecret(api, secretRef, targetNamespace) {
    return __awaiter(this, void 0, void 0, function* () {
        let secret;
        try {
            secret = (yield api.core.readNamespacedSecret(secretRef.name, secretRef.namespace)).body;
        }
        catch (err) {
            if (err.code === 404) {
                throw new exceptions_1.ConfigurationError(`Could not find secret '${secretRef.name}' in namespace '${secretRef.namespace}'. ` +
                    `Have you correctly configured your secrets?`, {
                    secretRef,
                });
            }
            else {
                throw err;
            }
        }
        if (secretRef.namespace === targetNamespace) {
            return;
        }
        delete secret.metadata.resourceVersion;
        secret.metadata.namespace = targetNamespace;
        yield api.upsert("Secret", targetNamespace, secret);
    });
}
exports.ensureSecret = ensureSecret;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9zZWNyZXRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFJSCwrQkFBK0I7QUFFL0IsaURBQXFEO0FBRXJELDJDQUFrRDtBQUVsRCxTQUFzQixTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFtQjs7UUFDM0QsTUFBTSxHQUFHLEdBQUcsSUFBSSxhQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFBO1FBQ3JDLE1BQU0sRUFBRSxHQUFHLE1BQU0sZ0NBQW9CLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQTtRQUV4RCxJQUFJO1lBQ0YsTUFBTSxHQUFHLEdBQUcsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQTtZQUN4RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUE7U0FDeEU7UUFBQyxPQUFPLEdBQUcsRUFBRTtZQUNaLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxHQUFHLEVBQUU7Z0JBQ3BCLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUE7YUFDdkI7aUJBQU07Z0JBQ0wsTUFBTSxHQUFHLENBQUE7YUFDVjtTQUNGO0lBQ0gsQ0FBQztDQUFBO0FBZEQsOEJBY0M7QUFFRCxTQUFzQixTQUFTLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBbUI7O1FBQ2xFLG9IQUFvSDtRQUNwSCxNQUFNLEdBQUcsR0FBRyxJQUFJLGFBQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUE7UUFDckMsTUFBTSxFQUFFLEdBQUcsTUFBTSxnQ0FBb0IsQ0FBQyxHQUFHLEVBQUUsR0FB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KlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHsgVjFTZWNyZXQgfSBmcm9tIFwiQGt1YmVybmV0ZXMvY2xpZW50LW5vZGVcIlxuXG5pbXBvcnQgeyBLdWJlQXBpIH0gZnJvbSBcIi4vYXBpXCJcbmltcG9ydCB7IFNlY3JldFJlZiB9IGZyb20gXCIuL2t1YmVybmV0ZXNcIlxuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkVycm9yIH0gZnJvbSBcIi4uLy4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHsgR2V0U2VjcmV0UGFyYW1zLCBTZXRTZWNyZXRQYXJhbXMsIERlbGV0ZVNlY3JldFBhcmFtcyB9IGZyb20gXCIuLi8uLi90eXBlcy9wbHVnaW4vcGFyYW1zXCJcbmltcG9ydCB7IGdldE1ldGFkYXRhTmFtZXNwYWNlIH0gZnJvbSBcIi4vbmFtZXNwYWNlXCJcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFNlY3JldCh7IGN0eCwga2V5IH06IEdldFNlY3JldFBhcmFtcykge1xuICBjb25zdCBhcGkgPSBuZXcgS3ViZUFwaShjdHgucHJvdmlkZXIpXG4gIGNvbnN0IG5zID0gYXdhaXQgZ2V0TWV0YWRhdGFOYW1lc3BhY2UoY3R4LCBjdHgucHJvdmlkZXIpXG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBhcGkuY29yZS5yZWFkTmFtZXNwYWNlZFNlY3JldChrZXksIG5zKVxuICAgIHJldHVybiB7IHZhbHVlOiBCdWZmZXIuZnJvbShyZXMuYm9keS5kYXRhLnZhbHVlLCBcImJhc2U2NFwiKS50b1N0cmluZygpIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaWYgKGVyci5jb2RlID09PSA0MDQpIHtcbiAgICAgIHJldHVybiB7IHZhbHVlOiBudWxsIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRTZWNyZXQoeyBjdHgsIGtleSwgdmFsdWUgfTogU2V0U2VjcmV0UGFyYW1zKSB7XG4gIC8vIHdlIHN0b3JlIGNvbmZpZ3VyYXRpb24gaW4gYSBzZXBhcmF0ZSBtZXRhZGF0YSBuYW1lc3BhY2UsIHNvIHRoYXQgY29uZmlncyBhcmVuJ3QgY2xlYXJlZCB3aGVuIHdpcGluZyB0aGUgbmFtZXNwYWNlXG4gIGNvbnN0IGFwaSA9IG5ldyBLdWJlQXBpKGN0eC5wcm92aWRlcilcbiAgY29uc3QgbnMgPSBhd2FpdCBnZXRNZXRhZGF0YU5hbWVzcGFjZShjdHgsIGN0eC5wcm92aWRlcilcbiAgY29uc3QgYm9keSA9IHtcbiAgICBib2R5OiB7XG4gICAgICBhcGlWZXJzaW9uOiBcInYxXCIsXG4gICAgICBraW5kOiBcIlNlY3JldFwiLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgbmFtZToga2V5LFxuICAgICAgICBhbm5vdGF0aW9uczoge1xuICAgICAgICAgIFwiZ2FyZGVuLmlvL2dlbmVyYXRlZFwiOiBcInRydWVcIixcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB0eXBlOiBcImdlbmVyaWNcIixcbiAgICAgIHN0cmluZ0RhdGE6IHsgdmFsdWUgfSxcbiAgICB9LFxuICB9XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBhcGkuY29yZS5jcmVhdGVOYW1lc3BhY2VkU2VjcmV0KG5zLCA8YW55PmJvZHkpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChlcnIuY29kZSA9PT0gNDA5KSB7XG4gICAgICBhd2FpdCBhcGkuY29yZS5wYXRjaE5hbWVzcGFjZWRTZWNyZXQoa2V5LCBucywgYm9keSlcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHt9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVTZWNyZXQoeyBjdHgsIGtleSB9OiBEZWxldGVTZWNyZXRQYXJhbXMpIHtcbiAgY29uc3QgYXBpID0gbmV3IEt1YmVBcGkoY3R4LnByb3ZpZGVyKVxuICBjb25zdCBucyA9IGF3YWl0IGdldE1ldGFkYXRhTmFtZXNwYWNlKGN0eCwgY3R4LnByb3ZpZGVyKVxuXG4gIHRyeSB7XG4gICAgYXdhaXQgYXBpLmNvcmUuZGVsZXRlTmFtZXNwYWNlZFNlY3JldChrZXksIG5zLCA8YW55Pnt9KVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAoZXJyLmNvZGUgPT09IDQwNCkge1xuICAgICAgcmV0dXJuIHsgZm91bmQ6IGZhbHNlIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG4gIHJldHVybiB7IGZvdW5kOiB0cnVlIH1cbn1cblxuLyoqXG4gKiBNYWtlIHN1cmUgdGhlIHNwZWNpZmllZCBzZWNyZXQgZXhpc3RzIGluIHRoZSB0YXJnZXQgbmFtZXNwYWNlLCBjb3B5aW5nIGl0IGlmIG5lY2Vzc2FyeS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVNlY3JldChhcGk6IEt1YmVBcGksIHNlY3JldFJlZjogU2VjcmV0UmVmLCB0YXJnZXROYW1lc3BhY2U6IHN0cmluZykge1xuICBsZXQgc2VjcmV0OiBWMVNlY3JldFxuXG4gIHRyeSB7XG4gICAgc2VjcmV0ID0gKGF3YWl0IGFwaS5jb3JlLnJlYWROYW1lc3BhY2VkU2VjcmV0KHNlY3JldFJlZi5uYW1lLCBzZWNyZXRSZWYubmFtZXNwYWNlKSkuYm9keVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAoZXJyLmNvZGUgPT09IDQwNCkge1xuICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihcbiAgICAgICAgYENvdWxkIG5vdCBmaW5kIHNlY3JldCAnJHtzZWNyZXRSZWYubmFtZX0nIGluIG5hbWVzcGFjZSAnJHtzZWNyZXRSZWYubmFtZXNwYWNlfScuIGAgK1xuICAgICAgICBgSGF2ZSB5b3UgY29ycmVjdGx5IGNvbmZpZ3VyZWQgeW91ciBzZWNyZXRzP2AsXG4gICAgICAgIHtcbiAgICAgICAgICBzZWNyZXRSZWYsXG4gICAgICAgIH0sXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IGVyclxuICAgIH1cbiAgfVxuXG4gIGlmIChzZWNyZXRSZWYubmFtZXNwYWNlID09PSB0YXJnZXROYW1lc3BhY2UpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIGRlbGV0ZSBzZWNyZXQubWV0YWRhdGEucmVzb3VyY2VWZXJzaW9uXG4gIHNlY3JldC5tZXRhZGF0YS5uYW1lc3BhY2UgPSB0YXJnZXROYW1lc3BhY2VcblxuICBhd2FpdCBhcGkudXBzZXJ0KFwiU2VjcmV0XCIsIHRhcmdldE5hbWVzcGFjZSwgc2VjcmV0KVxufVxuIl19
