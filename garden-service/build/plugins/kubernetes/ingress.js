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
const lodash_1 = require("lodash");
const util_1 = require("../../util/util");
const Bluebird = require("bluebird");
const exceptions_1 = require("../../exceptions");
const certpem_1 = require("certpem");
const secrets_1 = require("./secrets");
const certificateHostnames = {};
function createIngresses(api, namespace, service) {
    return __awaiter(this, void 0, void 0, function* () {
        if (service.spec.ingresses.length === 0) {
            return [];
        }
        const allIngresses = yield getIngressesWithCert(service, api);
        // first group ingress endpoints by certificate, so we can properly configure TLS
        const groupedByCert = lodash_1.groupBy(allIngresses, e => e.certificate ? e.certificate.name : undefined);
        return Bluebird.map(Object.values(groupedByCert), (certIngresses) => __awaiter(this, void 0, void 0, function* () {
            // second, group ingress endpoints by hostname
            const groupedByHostname = lodash_1.groupBy(certIngresses, e => e.hostname);
            const rules = Object.entries(groupedByHostname).map(([host, hostnameIngresses]) => ({
                host,
                http: {
                    paths: hostnameIngresses.map(ingress => ({
                        path: ingress.path,
                        backend: {
                            serviceName: service.name,
                            servicePort: util_1.findByName(service.spec.ports, ingress.spec.port).containerPort,
                        },
                    })),
                },
            }));
            const cert = certIngresses[0].certificate;
            const annotations = {
                "kubernetes.io/ingress.class": api.provider.config.ingressClass,
                "ingress.kubernetes.io/force-ssl-redirect": !!cert + "",
            };
            const spec = { rules };
            if (!!cert) {
                // make sure the TLS secrets exist in this namespace
                yield secrets_1.ensureSecret(api, cert.secretRef, namespace);
                spec.tls = [{
                        secretName: cert.secretRef.name,
                    }];
            }
            return {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    name: service.name,
                    annotations,
                    namespace,
                },
                spec,
            };
        }));
    });
}
exports.createIngresses = createIngresses;
function getIngress(service, api, spec) {
    return __awaiter(this, void 0, void 0, function* () {
        const hostname = spec.hostname || api.provider.config.defaultHostname;
        if (!hostname) {
            // this should be caught when parsing the module
            throw new exceptions_1.PluginError(`Missing hostname in ingress spec`, { serviceSpec: service.spec, ingressSpec: spec });
        }
        const certificate = yield pickCertificate(service, api, hostname);
        // TODO: support other protocols
        const protocol = !!certificate ? "https" : "http";
        const port = !!certificate ? api.provider.config.ingressHttpsPort : api.provider.config.ingressHttpPort;
        return Object.assign({}, spec, { certificate,
            hostname, path: spec.path, port,
            protocol,
            spec });
    });
}
function getIngressesWithCert(service, api) {
    return __awaiter(this, void 0, void 0, function* () {
        return Bluebird.map(service.spec.ingresses, spec => getIngress(service, api, spec));
    });
}
function getIngresses(service, api) {
    return __awaiter(this, void 0, void 0, function* () {
        return (yield getIngressesWithCert(service, api))
            .map(e => lodash_1.omit(e, ["certificate", "spec"]));
    });
}
exports.getIngresses = getIngresses;
function getCertificateHostnames(api, cert) {
    return __awaiter(this, void 0, void 0, function* () {
        if (cert.hostnames) {
            // use explicitly specified hostnames, if given
            return cert.hostnames;
        }
        else if (certificateHostnames[cert.name]) {
            // return cached hostnames if available
            return certificateHostnames[cert.name];
        }
        else {
            // pull secret via secret ref from k8s
            let res;
            try {
                res = yield api.core.readNamespacedSecret(cert.secretRef.name, cert.secretRef.namespace);
            }
            catch (err) {
                if (err.code === 404) {
                    throw new exceptions_1.ConfigurationError(`Cannot find Secret ${cert.secretRef.name} configured for TLS certificate ${cert.name}`, cert);
                }
                else {
                    throw err;
                }
            }
            const secret = res.body;
            if (!secret.data["tls.crt"] || !secret.data["tls.key"]) {
                throw new exceptions_1.ConfigurationError(`Secret '${cert.secretRef.name}' is not a valid TLS secret (missing tls.crt and/or tls.key).`, cert);
            }
            const crtData = Buffer.from(secret.data["tls.crt"], "base64").toString();
            try {
                // Note: Can't use the certpem.info() method here because of multiple bugs.
                // And yes, this API is insane. Crypto people are bonkers. Seriously. - JE
                const certInfo = certpem_1.certpem.debug(crtData);
                const hostnames = [];
                const commonNameField = lodash_1.find(certInfo.subject.types_and_values, ["type", "2.5.4.3"]);
                if (commonNameField) {
                    hostnames.push(commonNameField.value.value_block.value);
                }
                for (const ext of certInfo.extensions || []) {
                    if (ext.parsedValue && ext.parsedValue.altNames) {
                        for (const alt of ext.parsedValue.altNames) {
                            hostnames.push(alt.Name);
                        }
                    }
                }
                certificateHostnames[cert.name] = hostnames;
                return hostnames;
            }
            catch (error) {
                throw new exceptions_1.ConfigurationError(`Unable to parse Secret '${cert.secretRef.name}' as a valid TLS certificate`, Object.assign({}, cert, { error }));
            }
        }
    });
}
function pickCertificate(service, api, hostname) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const cert of api.provider.config.tlsCertificates) {
            const certHostnames = yield getCertificateHostnames(api, cert);
            for (const certHostname of certHostnames) {
                if (certHostname === hostname
                    || certHostname.startsWith("*") && hostname.endsWith(certHostname.slice(1))) {
                    return cert;
                }
            }
        }
        if (api.provider.config.forceSsl) {
            throw new exceptions_1.ConfigurationError(`Could not find certificate for hostname '${hostname}' ` +
                `configured on service '${service.name}' and forceSsl flag is set.`, {
                serviceName: service.name,
                hostname,
            });
        }
        return undefined;
    });
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9pbmdyZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxtQ0FBNEM7QUFDNUMsMENBQTRDO0FBSTVDLHFDQUFvQztBQUVwQyxpREFBa0U7QUFDbEUscUNBQWlDO0FBQ2pDLHVDQUF3QztBQU94QyxNQUFNLG9CQUFvQixHQUFpQyxFQUFFLENBQUE7QUFFN0QsU0FBc0IsZUFBZSxDQUFDLEdBQVksRUFBRSxTQUFpQixFQUFFLE9BQXlCOztRQUM5RixJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDdkMsT0FBTyxFQUFFLENBQUE7U0FDVjtRQUVELE1BQU0sWUFBWSxHQUFHLE1BQU0sb0JBQW9CLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFBO1FBRTdELGlGQUFpRjtRQUNqRixNQUFNLGFBQWEsR0FBRyxnQkFBTyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQTtRQUVoRyxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFPLGFBQWEsRUFBRSxFQUFFO1lBQ3hFLDhDQUE4QztZQUM5QyxNQUFNLGlCQUFpQixHQUFHLGdCQUFPLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFBO1lBRWpFLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNsRixJQUFJO2dCQUNK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QUksQ0FBQyxHQUFHLFNBQVMsQ0FBQTtnQkFFM0MsT0FBTyxTQUFTLENBQUE7YUFDakI7WUFBQyxPQUFPLEtBQUssRUFBRTtnQkFDZCxNQUFNLElBQUksK0JBQWtCLENBQzFCLDJCQUEyQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksOEJBQThCLG9CQUN2RSxJQUFJLElBQUUsS0FBSyxJQUNqQixDQUFBO2FBQ0Y7U0FDRjtJQUNILENBQUM7Q0FBQTtBQUVELFNBQWUsZUFBZSxDQUM1QixPQUF5QixFQUFFLEdBQVksRUFBRSxRQUFnQjs7UUFFekQsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7WUFDdEQsTUFBTSxhQUFhLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUE7WUFFOUQsS0FBSyxNQUFNLFlBQVksSUFBSSxhQUFhLEVBQUU7Z0JBQ3hDLElBQ0UsWUFBWSxLQUFLLFFBQVE7dUJBQ3RCLFlBQVksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQzNFO29CQUNBLE9BQU8sSUFBSSxDQUFBO2lCQUNaO2FBQ0Y7U0FDRjtRQUVELElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFO1lBQ2hDLE1BQU0sSUFBSSwrQkFBa0IsQ0FDMUIsNENBQTRDLFFBQVEsSUFBSTtnQkFDeEQsMEJBQTBCLE9BQU8sQ0FBQyxJQUFJLDZCQUE2QixFQUNuRTtnQkFDRSxXQUFXLEVBQUUsT0FBTyxDQUFDLElBQUk7Z0JBQ3pCLFFBQVE7YUFDVCxDQUNGLENBQUE7U0FDRjtRQUVELE9BQU8sU0FBUyxDQUFBO0lBQ2xCLENBQUM7Q0FBQSIsImZpbGUiOiJwbHVnaW5zL2t1YmVybmV0ZXMvaW5ncmVzcy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBncm91cEJ5LCBvbWl0LCBmaW5kIH0gZnJvbSBcImxvZGFzaFwiXG5pbXBvcnQgeyBmaW5kQnlOYW1lIH0gZnJvbSBcIi4uLy4uL3V0aWwvdXRpbFwiXG5pbXBvcnQgeyBDb250YWluZXJTZXJ2aWNlLCBDb250YWluZXJJbmdyZXNzU3BlYyB9IGZyb20gXCIuLi9jb250YWluZXJcIlxuaW1wb3J0IHsgSW5ncmVzc1Rsc0NlcnRpZmljYXRlIH0gZnJvbSBcIi4va3ViZXJuZXRlc1wiXG5pbXBvcnQgeyBTZXJ2aWNlSW5ncmVzcywgU2VydmljZVByb3RvY29sIH0gZnJvbSBcIi4uLy4uL3R5cGVzL3NlcnZpY2VcIlxuaW1wb3J0ICogYXMgQmx1ZWJpcmQgZnJvbSBcImJsdWViaXJkXCJcbmltcG9ydCB7IEt1YmVBcGkgfSBmcm9tIFwiLi9hcGlcIlxuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkVycm9yLCBQbHVnaW5FcnJvciB9IGZyb20gXCIuLi8uLi9leGNlcHRpb25zXCJcbmltcG9ydCB7IGNlcnRwZW0gfSBmcm9tIFwiY2VydHBlbVwiXG5pbXBvcnQgeyBlbnN1cmVTZWNyZXQgfSBmcm9tIFwiLi9zZWNyZXRzXCJcblxuaW50ZXJmYWNlIFNlcnZpY2VJbmdyZXNzV2l0aENlcnQgZXh0ZW5kcyBTZXJ2aWNlSW5ncmVzcyB7XG4gIHNwZWM6IENvbnRhaW5lckluZ3Jlc3NTcGVjXG4gIGNlcnRpZmljYXRlPzogSW5ncmVzc1Rsc0NlcnRpZmljYXRlXG59XG5cbmNvbnN0IGNlcnRpZmljYXRlSG9zdG5hbWVzOiB7IFtuYW1lOiBzdHJpbmddOiBzdHJpbmdbXSB9ID0ge31cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUluZ3Jlc3NlcyhhcGk6IEt1YmVBcGksIG5hbWVzcGFjZTogc3RyaW5nLCBzZXJ2aWNlOiBDb250YWluZXJTZXJ2aWNlKSB7XG4gIGlmIChzZXJ2aWNlLnNwZWMuaW5ncmVzc2VzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBbXVxuICB9XG5cbiAgY29uc3QgYWxsSW5ncmVzc2VzID0gYXdhaXQgZ2V0SW5ncmVzc2VzV2l0aENlcnQoc2VydmljZSwgYXBpKVxuXG4gIC8vIGZpcnN0IGdyb3VwIGluZ3Jlc3MgZW5kcG9pbnRzIGJ5IGNlcnRpZmljYXRlLCBzbyB3ZSBjYW4gcHJvcGVybHkgY29uZmlndXJlIFRMU1xuICBjb25zdCBncm91cGVkQnlDZXJ0ID0gZ3JvdXBCeShhbGxJbmdyZXNzZXMsIGUgPT4gZS5jZXJ0aWZpY2F0ZSA/IGUuY2VydGlmaWNhdGUubmFtZSA6IHVuZGVmaW5lZClcblxuICByZXR1cm4gQmx1ZWJpcmQubWFwKE9iamVjdC52YWx1ZXMoZ3JvdXBlZEJ5Q2VydCksIGFzeW5jIChjZXJ0SW5ncmVzc2VzKSA9PiB7XG4gICAgLy8gc2Vjb25kLCBncm91cCBpbmdyZXNzIGVuZHBvaW50cyBieSBob3N0bmFtZVxuICAgIGNvbnN0IGdyb3VwZWRCeUhvc3RuYW1lID0gZ3JvdXBCeShjZXJ0SW5ncmVzc2VzLCBlID0+IGUuaG9zdG5hbWUpXG5cbiAgICBjb25zdCBydWxlcyA9IE9iamVjdC5lbnRyaWVzKGdyb3VwZWRCeUhvc3RuYW1lKS5tYXAoKFtob3N0LCBob3N0bmFtZUluZ3Jlc3Nlc10pID0+ICh7XG4gICAgICBob3N0LFxuICAgICAgaHR0cDoge1xuICAgICAgICBwYXRoczogaG9zdG5hbWVJbmdyZXNzZXMubWFwKGluZ3Jlc3MgPT4gKHtcbiAgICAgICAgICBwYXRoOiBpbmdyZXNzLnBhdGgsXG4gICAgICAgICAgYmFja2VuZDoge1xuICAgICAgICAgICAgc2VydmljZU5hbWU6IHNlcnZpY2UubmFtZSxcbiAgICAgICAgICAgIHNlcnZpY2VQb3J0OiBmaW5kQnlOYW1lKHNlcnZpY2Uuc3BlYy5wb3J0cywgaW5ncmVzcy5zcGVjLnBvcnQpIS5jb250YWluZXJQb3J0LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKSxcbiAgICAgIH0sXG4gICAgfSkpXG5cbiAgICBjb25zdCBjZXJ0ID0gY2VydEluZ3Jlc3Nlc1swXS5jZXJ0aWZpY2F0ZVxuXG4gICAgY29uc3QgYW5ub3RhdGlvbnMgPSB7XG4gICAgICBcImt1YmVybmV0ZXMuaW8vaW5ncmVzcy5jbGFzc1wiOiBhcGkucHJvdmlkZXIuY29uZmlnLmluZ3Jlc3NDbGFzcyxcbiAgICAgIFwiaW5ncmVzcy5rdWJlcm5ldGVzLmlvL2ZvcmNlLXNzbC1yZWRpcmVjdFwiOiAhIWNlcnQgKyBcIlwiLFxuICAgIH1cblxuICAgIGNvbnN0IHNwZWM6IGFueSA9IHsgcnVsZXMgfVxuXG4gICAgaWYgKCEhY2VydCkge1xuICAgICAgLy8gbWFrZSBzdXJlIHRoZSBUTFMgc2VjcmV0cyBleGlzdCBpbiB0aGlzIG5hbWVzcGFjZVxuICAgICAgYXdhaXQgZW5zdXJlU2VjcmV0KGFwaSwgY2VydC5zZWNyZXRSZWYsIG5hbWVzcGFjZSlcblxuICAgICAgc3BlYy50bHMgPSBbe1xuICAgICAgICBzZWNyZXROYW1lOiBjZXJ0LnNlY3JldFJlZi5uYW1lLFxuICAgICAgfV1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgYXBpVmVyc2lvbjogXCJleHRlbnNpb25zL3YxYmV0YTFcIixcbiAgICAgIGtpbmQ6IFwiSW5ncmVzc1wiLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgbmFtZTogc2VydmljZS5uYW1lLFxuICAgICAgICBhbm5vdGF0aW9ucyxcbiAgICAgICAgbmFtZXNwYWNlLFxuICAgICAgfSxcbiAgICAgIHNwZWMsXG4gICAgfVxuICB9KVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbmdyZXNzKFxuICBzZXJ2aWNlOiBDb250YWluZXJTZXJ2aWNlLCBhcGk6IEt1YmVBcGksIHNwZWM6IENvbnRhaW5lckluZ3Jlc3NTcGVjLFxuKTogUHJvbWlzZTxTZXJ2aWNlSW5ncmVzc1dpdGhDZXJ0PiB7XG4gIGNvbnN0IGhvc3RuYW1lID0gc3BlYy5ob3N0bmFtZSB8fCBhcGkucHJvdmlkZXIuY29uZmlnLmRlZmF1bHRIb3N0bmFtZVxuXG4gIGlmICghaG9zdG5hbWUpIHtcbiAgICAvLyB0aGlzIHNob3VsZCBiZSBjYXVnaHQgd2hlbiBwYXJzaW5nIHRoZSBtb2R1bGVcbiAgICB0aHJvdyBuZXcgUGx1Z2luRXJyb3IoYE1pc3NpbmcgaG9zdG5hbWUgaW4gaW5ncmVzcyBzcGVjYCwgeyBzZXJ2aWNlU3BlYzogc2VydmljZS5zcGVjLCBpbmdyZXNzU3BlYzogc3BlYyB9KVxuICB9XG5cbiAgY29uc3QgY2VydGlmaWNhdGUgPSBhd2FpdCBwaWNrQ2VydGlmaWNhdGUoc2VydmljZSwgYXBpLCBob3N0bmFtZSlcbiAgLy8gVE9ETzogc3VwcG9ydCBvdGhlciBwcm90b2NvbHNcbiAgY29uc3QgcHJvdG9jb2w6IFNlcnZpY2VQcm90b2NvbCA9ICEhY2VydGlmaWNhdGUgPyBcImh0dHBzXCIgOiBcImh0dHBcIlxuICBjb25zdCBwb3J0ID0gISFjZXJ0aWZpY2F0ZSA/IGFwaS5wcm92aWRlci5jb25maWcuaW5ncmVzc0h0dHBzUG9ydCA6IGFwaS5wcm92aWRlci5jb25maWcuaW5ncmVzc0h0dHBQb3J0XG5cbiAgcmV0dXJuIHtcbiAgICAuLi5zcGVjLFxuICAgIGNlcnRpZmljYXRlLFxuICAgIGhvc3RuYW1lLFxuICAgIHBhdGg6IHNwZWMucGF0aCxcbiAgICBwb3J0LFxuICAgIHByb3RvY29sLFxuICAgIHNwZWMsXG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0SW5ncmVzc2VzV2l0aENlcnQoc2VydmljZTogQ29udGFpbmVyU2VydmljZSwgYXBpOiBLdWJlQXBpKTogUHJvbWlzZTxTZXJ2aWNlSW5ncmVzc1dpdGhDZXJ0W10+IHtcbiAgcmV0dXJuIEJsdWViaXJkLm1hcChzZXJ2aWNlLnNwZWMuaW5ncmVzc2VzLCBzcGVjID0+IGdldEluZ3Jlc3Moc2VydmljZSwgYXBpLCBzcGVjKSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEluZ3Jlc3NlcyhzZXJ2aWNlOiBDb250YWluZXJTZXJ2aWNlLCBhcGk6IEt1YmVBcGkpOiBQcm9taXNlPFNlcnZpY2VJbmdyZXNzW10+IHtcbiAgcmV0dXJuIChhd2FpdCBnZXRJbmdyZXNzZXNXaXRoQ2VydChzZXJ2aWNlLCBhcGkpKVxuICAgIC5tYXAoZSA9PiBvbWl0KGUsIFtcImNlcnRpZmljYXRlXCIsIFwic3BlY1wiXSkpXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldENlcnRpZmljYXRlSG9zdG5hbWVzKGFwaTogS3ViZUFwaSwgY2VydDogSW5ncmVzc1Rsc0NlcnRpZmljYXRlKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBpZiAoY2VydC5ob3N0bmFtZXMpIHtcbiAgICAvLyB1c2UgZXhwbGljaXRseSBzcGVjaWZpZWQgaG9zdG5hbWVzLCBpZiBnaXZlblxuICAgIHJldHVybiBjZXJ0Lmhvc3RuYW1lc1xuICB9IGVsc2UgaWYgKGNlcnRpZmljYXRlSG9zdG5hbWVzW2NlcnQubmFtZV0pIHtcbiAgICAvLyByZXR1cm4gY2FjaGVkIGhvc3RuYW1lcyBpZiBhdmFpbGFibGVcbiAgICByZXR1cm4gY2VydGlmaWNhdGVIb3N0bmFtZXNbY2VydC5uYW1lXVxuICB9IGVsc2Uge1xuICAgIC8vIHB1bGwgc2VjcmV0IHZpYSBzZWNyZXQgcmVmIGZyb20gazhzXG4gICAgbGV0IHJlc1xuXG4gICAgdHJ5IHtcbiAgICAgIHJlcyA9IGF3YWl0IGFwaS5jb3JlLnJlYWROYW1lc3BhY2VkU2VjcmV0KGNlcnQuc2VjcmV0UmVmLm5hbWUsIGNlcnQuc2VjcmV0UmVmLm5hbWVzcGFjZSlcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIuY29kZSA9PT0gNDA0KSB7XG4gICAgICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoXG4gICAgICAgICAgYENhbm5vdCBmaW5kIFNlY3JldCAke2NlcnQuc2VjcmV0UmVmLm5hbWV9IGNvbmZpZ3VyZWQgZm9yIFRMUyBjZXJ0aWZpY2F0ZSAke2NlcnQubmFtZX1gLFxuICAgICAgICAgIGNlcnQsXG4gICAgICAgIClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVyclxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzZWNyZXQgPSByZXMuYm9keVxuXG4gICAgaWYgKCFzZWNyZXQuZGF0YVtcInRscy5jcnRcIl0gfHwgIXNlY3JldC5kYXRhW1widGxzLmtleVwiXSkge1xuICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihcbiAgICAgICAgYFNlY3JldCAnJHtjZXJ0LnNlY3JldFJlZi5uYW1lfScgaXMgbm90IGEgdmFsaWQgVExTIHNlY3JldCAobWlzc2luZyB0bHMuY3J0IGFuZC9vciB0bHMua2V5KS5gLFxuICAgICAgICBjZXJ0LFxuICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IGNydERhdGEgPSBCdWZmZXIuZnJvbShzZWNyZXQuZGF0YVtcInRscy5jcnRcIl0sIFwiYmFzZTY0XCIpLnRvU3RyaW5nKClcblxuICAgIHRyeSB7XG4gICAgICAvLyBOb3RlOiBDYW4ndCB1c2UgdGhlIGNlcnRwZW0uaW5mbygpIG1ldGhvZCBoZXJlIGJlY2F1c2Ugb2YgbXVsdGlwbGUgYnVncy5cbiAgICAgIC8vIEFuZCB5ZXMsIHRoaXMgQVBJIGlzIGluc2FuZS4gQ3J5cHRvIHBlb3BsZSBhcmUgYm9ua2Vycy4gU2VyaW91c2x5LiAtIEpFXG4gICAgICBjb25zdCBjZXJ0SW5mbyA9IGNlcnRwZW0uZGVidWcoY3J0RGF0YSlcblxuICAgICAgY29uc3QgaG9zdG5hbWVzOiBzdHJpbmdbXSA9IFtdXG5cbiAgICAgIGNvbnN0IGNvbW1vbk5hbWVGaWVsZCA9IGZpbmQoY2VydEluZm8uc3ViamVjdC50eXBlc19hbmRfdmFsdWVzLCBbXCJ0eXBlXCIsIFwiMi41LjQuM1wiXSlcbiAgICAgIGlmIChjb21tb25OYW1lRmllbGQpIHtcbiAgICAgICAgaG9zdG5hbWVzLnB1c2goY29tbW9uTmFtZUZpZWxkLnZhbHVlLnZhbHVlX2Jsb2NrLnZhbHVlKVxuICAgICAgfVxuXG4gICAgICBmb3IgKGNvbnN0IGV4dCBvZiBjZXJ0SW5mby5leHRlbnNpb25zIHx8IFtdKSB7XG4gICAgICAgIGlmIChleHQucGFyc2VkVmFsdWUgJiYgZXh0LnBhcnNlZFZhbHVlLmFsdE5hbWVzKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBhbHQgb2YgZXh0LnBhcnNlZFZhbHVlLmFsdE5hbWVzKSB7XG4gICAgICAgICAgICBob3N0bmFtZXMucHVzaChhbHQuTmFtZSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY2VydGlmaWNhdGVIb3N0bmFtZXNbY2VydC5uYW1lXSA9IGhvc3RuYW1lc1xuXG4gICAgICByZXR1cm4gaG9zdG5hbWVzXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoXG4gICAgICAgIGBVbmFibGUgdG8gcGFyc2UgU2VjcmV0ICcke2NlcnQuc2VjcmV0UmVmLm5hbWV9JyBhcyBhIHZhbGlkIFRMUyBjZXJ0aWZpY2F0ZWAsXG4gICAgICAgIHsgLi4uY2VydCwgZXJyb3IgfSxcbiAgICAgIClcbiAgICB9XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcGlja0NlcnRpZmljYXRlKFxuICBzZXJ2aWNlOiBDb250YWluZXJTZXJ2aWNlLCBhcGk6IEt1YmVBcGksIGhvc3RuYW1lOiBzdHJpbmcsXG4pOiBQcm9taXNlPEluZ3Jlc3NUbHNDZXJ0aWZpY2F0ZSB8IHVuZGVmaW5lZD4ge1xuICBmb3IgKGNvbnN0IGNlcnQgb2YgYXBpLnByb3ZpZGVyLmNvbmZpZy50bHNDZXJ0aWZpY2F0ZXMpIHtcbiAgICBjb25zdCBjZXJ0SG9zdG5hbWVzID0gYXdhaXQgZ2V0Q2VydGlmaWNhdGVIb3N0bmFtZXMoYXBpLCBjZXJ0KVxuXG4gICAgZm9yIChjb25zdCBjZXJ0SG9zdG5hbWUgb2YgY2VydEhvc3RuYW1lcykge1xuICAgICAgaWYgKFxuICAgICAgICBjZXJ0SG9zdG5hbWUgPT09IGhvc3RuYW1lXG4gICAgICAgIHx8IGNlcnRIb3N0bmFtZS5zdGFydHNXaXRoKFwiKlwiKSAmJiBob3N0bmFtZS5lbmRzV2l0aChjZXJ0SG9zdG5hbWUuc2xpY2UoMSkpXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIGNlcnRcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoYXBpLnByb3ZpZGVyLmNvbmZpZy5mb3JjZVNzbCkge1xuICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoXG4gICAgICBgQ291bGQgbm90IGZpbmQgY2VydGlmaWNhdGUgZm9yIGhvc3RuYW1lICcke2hvc3RuYW1lfScgYCArXG4gICAgICBgY29uZmlndXJlZCBvbiBzZXJ2aWNlICcke3NlcnZpY2UubmFtZX0nIGFuZCBmb3JjZVNzbCBmbGFnIGlzIHNldC5gLFxuICAgICAge1xuICAgICAgICBzZXJ2aWNlTmFtZTogc2VydmljZS5uYW1lLFxuICAgICAgICBob3N0bmFtZSxcbiAgICAgIH0sXG4gICAgKVxuICB9XG5cbiAgcmV0dXJuIHVuZGVmaW5lZFxufVxuIl19
