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
function createServices(service, namespace) {
    return __awaiter(this, void 0, void 0, function* () {
        const services = [];
        const addService = (name, type, servicePorts) => {
            services.push({
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name,
                    annotations: {},
                    namespace,
                },
                spec: {
                    ports: servicePorts,
                    selector: {
                        service: service.name,
                    },
                    type,
                },
            });
        };
        // first add internally exposed (ClusterIP) service
        const internalPorts = [];
        const ports = service.spec.ports;
        for (const portSpec of ports) {
            internalPorts.push({
                name: portSpec.name,
                protocol: portSpec.protocol,
                targetPort: portSpec.containerPort,
                port: portSpec.containerPort,
            });
        }
        if (internalPorts.length) {
            addService(service.name, "ClusterIP", internalPorts);
        }
        // optionally add a NodePort service for externally open ports, if applicable
        // TODO: explore nicer ways to do this
        const exposedPorts = ports.filter(portSpec => portSpec.nodePort);
        if (exposedPorts.length > 0) {
            addService(service.name + "-nodeport", "NodePort", exposedPorts.map(portSpec => ({
                // TODO: do the parsing and defaults when loading the yaml
                name: portSpec.name,
                protocol: portSpec.protocol,
                port: portSpec.containerPort,
                nodePort: portSpec.nodePort,
            })));
        }
        return services;
    });
}
exports.createServices = createServices;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFJSCxTQUFzQixjQUFjLENBQUMsT0FBeUIsRUFBRSxTQUFpQjs7UUFDL0UsTUFBTSxRQUFRLEdBQVEsRUFBRSxDQUFBO1FBRXhCLE1BQU0sVUFBVSxHQUFHLENBQUMsSUFBWSxFQUFFLElBQVksRUFBRSxZQUFtQixFQUFFLEVBQUU7WUFDckUsUUFBUSxDQUFDLElBQUksQ0FBQztnQkFDWixVQUFVLEVBQUUsSUFBSTtnQkFDaEIsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsUUFBUSxFQUFFO29CQUNSLElBQUk7b0JBQ0osV0FBVyxFQUFFLEVBQUU7b0JBQ2YsU0FBUztpQkFDVjtnQkFDRCxJQUFJLEVBQUU7b0JBQ0osS0FBSyxFQUFFLFlBQVk7b0JBQ25CLFFBQVEsRUFBRTt3QkFDUixPQUFPLEVBQUUsT0FBTyxDQUFDLElBQUk7cUJBQ3RCO29CQUNELElBQUk7aUJBQ0w7YUFDRixDQUFDLENBQUE7UUFDSixDQUFDLENBQUE7UUFFRCxtREFBbUQ7UUFDbkQsTUFBTSxhQUFhLEdBQVEsRUFBRSxDQUFBO1FBQzdCLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFBO1FBRWhDLEtBQUssTUFBTSxRQUFRLElBQUksS0FBSyxFQUFFO1lBQzVCLGFBQWEsQ0FBQyxJQUFJLENBQUM7Z0JBQ2pCLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtnQkFDbkIsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRO2dCQUMzQixVQUFVLEVBQUUsUUFBUSxDQUFDLGFBQWE7Z0JBQ2xDLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYTthQUM3QixDQUFDLENBQUE7U0FDSDtRQUVELElBQUksYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUN4QixVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsYUFBYSxDQUFDLENBQUE7U0FDckQ7UUFFRCw2RUFBNkU7UUFDN0Usc0NBQXNDO1FBQ3RDLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUE7UUFFaEUsSUFBSSxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtZQUMzQixVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyxXQUFXLEVBQUUsVUFBVSxFQUFFLFlBQVksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMvRSwwREFBMEQ7Z0JBQzFELElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtnQkFDbkIsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRO2dCQUMzQixJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWE7Z0JBQzVCLFFBQVEsRUFBRSxRQUFRLENBQUMsUUFBUTthQUM1QixDQUFDLENBQUMsQ0FBQyxDQUFBO1NBQ0w7UUFFRCxPQUFPLFFBQVEsQ0FBQTtJQUNqQixDQUFDO0NBQUE7QUF0REQsd0NBc0RDIiwiZmlsZSI6InBsdWdpbnMva3ViZXJuZXRlcy9zZXJ2aWNlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IENvbnRhaW5lclNlcnZpY2UgfSBmcm9tIFwiLi4vY29udGFpbmVyXCJcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVNlcnZpY2VzKHNlcnZpY2U6IENvbnRhaW5lclNlcnZpY2UsIG5hbWVzcGFjZTogc3RyaW5nKSB7XG4gIGNvbnN0IHNlcnZpY2VzOiBhbnkgPSBbXVxuXG4gIGNvbnN0IGFkZFNlcnZpY2UgPSAobmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIHNlcnZpY2VQb3J0czogYW55W10pID0+IHtcbiAgICBzZXJ2aWNlcy5wdXNoKHtcbiAgICAgIGFwaVZlcnNpb246IFwidjFcIixcbiAgICAgIGtpbmQ6IFwiU2VydmljZVwiLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgbmFtZSxcbiAgICAgICAgYW5ub3RhdGlvbnM6IHt9LFxuICAgICAgICBuYW1lc3BhY2UsXG4gICAgICB9LFxuICAgICAgc3BlYzoge1xuICAgICAgICBwb3J0czogc2VydmljZVBvcnRzLFxuICAgICAgICBzZWxlY3Rvcjoge1xuICAgICAgICAgIHNlcnZpY2U6IHNlcnZpY2UubmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdHlwZSxcbiAgICAgIH0sXG4gICAgfSlcbiAgfVxuXG4gIC8vIGZpcnN0IGFkZCBpbnRlcm5hbGx5IGV4cG9zZWQgKENsdXN0ZXJJUCkgc2VydmljZVxuICBjb25zdCBpbnRlcm5hbFBvcnRzOiBhbnkgPSBbXVxuICBjb25zdCBwb3J0cyA9IHNlcnZpY2Uuc3BlYy5wb3J0c1xuXG4gIGZvciAoY29uc3QgcG9ydFNwZWMgb2YgcG9ydHMpIHtcbiAgICBpbnRlcm5hbFBvcnRzLnB1c2goe1xuICAgICAgbmFtZTogcG9ydFNwZWMubmFtZSxcbiAgICAgIHByb3RvY29sOiBwb3J0U3BlYy5wcm90b2NvbCxcbiAgICAgIHRhcmdldFBvcnQ6IHBvcnRTcGVjLmNvbnRhaW5lclBvcnQsXG4gICAgICBwb3J0OiBwb3J0U3BlYy5jb250YWluZXJQb3J0LFxuICAgIH0pXG4gIH1cblxuICBpZiAoaW50ZXJuYWxQb3J0cy5sZW5ndGgpIHtcbiAgICBhZGRTZXJ2aWNlKHNlcnZpY2UubmFtZSwgXCJDbHVzdGVySVBcIiwgaW50ZXJuYWxQb3J0cylcbiAgfVxuXG4gIC8vIG9wdGlvbmFsbHkgYWRkIGEgTm9kZVBvcnQgc2VydmljZSBmb3IgZXh0ZXJuYWxseSBvcGVuIHBvcnRzLCBpZiBhcHBsaWNhYmxlXG4gIC8vIFRPRE86IGV4cGxvcmUgbmljZXIgd2F5cyB0byBkbyB0aGlzXG4gIGNvbnN0IGV4cG9zZWRQb3J0cyA9IHBvcnRzLmZpbHRlcihwb3J0U3BlYyA9PiBwb3J0U3BlYy5ub2RlUG9ydClcblxuICBpZiAoZXhwb3NlZFBvcnRzLmxlbmd0aCA+IDApIHtcbiAgICBhZGRTZXJ2aWNlKHNlcnZpY2UubmFtZSArIFwiLW5vZGVwb3J0XCIsIFwiTm9kZVBvcnRcIiwgZXhwb3NlZFBvcnRzLm1hcChwb3J0U3BlYyA9PiAoe1xuICAgICAgLy8gVE9ETzogZG8gdGhlIHBhcnNpbmcgYW5kIGRlZmF1bHRzIHdoZW4gbG9hZGluZyB0aGUgeWFtbFxuICAgICAgbmFtZTogcG9ydFNwZWMubmFtZSxcbiAgICAgIHByb3RvY29sOiBwb3J0U3BlYy5wcm90b2NvbCxcbiAgICAgIHBvcnQ6IHBvcnRTcGVjLmNvbnRhaW5lclBvcnQsXG4gICAgICBub2RlUG9ydDogcG9ydFNwZWMubm9kZVBvcnQsXG4gICAgfSkpKVxuICB9XG5cbiAgcmV0dXJuIHNlcnZpY2VzXG59XG4iXX0=
