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
const module_1 = require("../types/module");
const exceptions_1 = require("../exceptions");
/*
  Implements a variation on the Floyd-Warshall algorithm to compute minimal cycles.

  This is approximately O(m^3) + O(s^3), where m is the number of modules and s is the number of services.

  Throws an error if cycles were found.
*/
function detectCircularDependencies(modules, services) {
    return __awaiter(this, void 0, void 0, function* () {
        // Sparse matrices
        const buildGraph = {};
        const serviceGraph = {};
        /*
          There's no need to account for test dependencies here, since any circularities there
          are accounted for via service dependencies.
          */
        for (const module of modules) {
            // Build dependencies
            for (const buildDep of module.build.dependencies) {
                const depName = module_1.getModuleKey(buildDep.name, buildDep.plugin);
                lodash_1.set(buildGraph, [module.name, depName], { distance: 1, next: depName });
            }
            // Service dependencies
            for (const service of module.serviceConfigs || []) {
                for (const depName of service.dependencies) {
                    lodash_1.set(serviceGraph, [service.name, depName], { distance: 1, next: depName });
                }
            }
        }
        const serviceNames = services.map(s => s.name);
        const buildCycles = detectCycles(buildGraph, modules.map(m => m.name));
        const serviceCycles = detectCycles(serviceGraph, serviceNames);
        if (buildCycles.length > 0 || serviceCycles.length > 0) {
            const detail = {};
            if (buildCycles.length > 0) {
                detail["circular-build-dependencies"] = cyclesToString(buildCycles);
            }
            if (serviceCycles.length > 0) {
                detail["circular-service-dependencies"] = cyclesToString(serviceCycles);
            }
            throw new exceptions_1.ConfigurationError("Circular dependencies detected", detail);
        }
    });
}
exports.detectCircularDependencies = detectCircularDependencies;
function detectCycles(graph, vertices) {
    // Compute shortest paths
    for (const k of vertices) {
        for (const i of vertices) {
            for (const j of vertices) {
                const distanceViaK = distance(graph, i, k) + distance(graph, k, j);
                if (distanceViaK < distance(graph, i, j)) {
                    const nextViaK = next(graph, i, k);
                    lodash_1.set(graph, [i, j], { distance: distanceViaK, next: nextViaK });
                }
            }
        }
    }
    // Reconstruct cycles, if any
    const cycleVertices = vertices.filter(v => next(graph, v, v));
    const cycles = cycleVertices.map(v => {
        const cycle = [v];
        let nextInCycle = next(graph, v, v);
        while (nextInCycle !== v) {
            cycle.push(nextInCycle);
            nextInCycle = next(graph, nextInCycle, v);
        }
        return cycle;
    });
    return lodash_1.uniqWith(cycles, // The concat calls below are to prevent in-place sorting.
    (c1, c2) => lodash_1.isEqual(c1.concat().sort(), c2.concat().sort()));
}
exports.detectCycles = detectCycles;
function distance(graph, source, destination) {
    return lodash_1.get(graph, [source, destination, "distance"], Infinity);
}
function next(graph, source, destination) {
    return lodash_1.get(graph, [source, destination, "next"]);
}
function cyclesToString(cycles) {
    const cycleDescriptions = cycles.map(c => lodash_1.join(c.concat([c[0]]), " <- "));
    return cycleDescriptions.length === 1 ? cycleDescriptions[0] : cycleDescriptions;
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QkM7QUFFRCxTQUFTLFFBQVEsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLFdBQVc7SUFDMUMsT0FBTyxZQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQTtBQUNoRSxDQUFDO0FBRUQsU0FBUyxJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxXQUFXO0lBQ3RDLE9BQU8sWUFBRyxDQUFDLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQTtBQUNsRCxDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsTUFBZTtJQUNyQyxNQUFNLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxhQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQTtJQUN6RSxPQUFPLGlCQUFpQixDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQTtBQUNsRixDQUFDIiwiZmlsZSI6InV0aWwvZGV0ZWN0Q3ljbGVzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IGdldCwgaXNFcXVhbCwgam9pbiwgc2V0LCB1bmlxV2l0aCB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgTW9kdWxlLCBnZXRNb2R1bGVLZXkgfSBmcm9tIFwiLi4vdHlwZXMvbW9kdWxlXCJcbmltcG9ydCB7XG4gIENvbmZpZ3VyYXRpb25FcnJvcixcbn0gZnJvbSBcIi4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHsgU2VydmljZSB9IGZyb20gXCIuLi90eXBlcy9zZXJ2aWNlXCJcblxuZXhwb3J0IHR5cGUgQ3ljbGUgPSBzdHJpbmdbXVxuXG4vKlxuICBJbXBsZW1lbnRzIGEgdmFyaWF0aW9uIG9uIHRoZSBGbG95ZC1XYXJzaGFsbCBhbGdvcml0aG0gdG8gY29tcHV0ZSBtaW5pbWFsIGN5Y2xlcy5cblxuICBUaGlzIGlzIGFwcHJveGltYXRlbHkgTyhtXjMpICsgTyhzXjMpLCB3aGVyZSBtIGlzIHRoZSBudW1iZXIgb2YgbW9kdWxlcyBhbmQgcyBpcyB0aGUgbnVtYmVyIG9mIHNlcnZpY2VzLlxuXG4gIFRocm93cyBhbiBlcnJvciBpZiBjeWNsZXMgd2VyZSBmb3VuZC5cbiovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGV0ZWN0Q2lyY3VsYXJEZXBlbmRlbmNpZXMobW9kdWxlczogTW9kdWxlW10sIHNlcnZpY2VzOiBTZXJ2aWNlW10pIHtcbiAgLy8gU3BhcnNlIG1hdHJpY2VzXG4gIGNvbnN0IGJ1aWxkR3JhcGggPSB7fVxuICBjb25zdCBzZXJ2aWNlR3JhcGggPSB7fVxuXG4gIC8qXG4gICAgVGhlcmUncyBubyBuZWVkIHRvIGFjY291bnQgZm9yIHRlc3QgZGVwZW5kZW5jaWVzIGhlcmUsIHNpbmNlIGFueSBjaXJjdWxhcml0aWVzIHRoZXJlXG4gICAgYXJlIGFjY291bnRlZCBmb3IgdmlhIHNlcnZpY2UgZGVwZW5kZW5jaWVzLlxuICAgICovXG4gIGZvciAoY29uc3QgbW9kdWxlIG9mIG1vZHVsZXMpIHtcbiAgICAvLyBCdWlsZCBkZXBlbmRlbmNpZXNcbiAgICBmb3IgKGNvbnN0IGJ1aWxkRGVwIG9mIG1vZHVsZS5idWlsZC5kZXBlbmRlbmNpZXMpIHtcbiAgICAgIGNvbnN0IGRlcE5hbWUgPSBnZXRNb2R1bGVLZXkoYnVpbGREZXAubmFtZSwgYnVpbGREZXAucGx1Z2luKVxuICAgICAgc2V0KGJ1aWxkR3JhcGgsIFttb2R1bGUubmFtZSwgZGVwTmFtZV0sIHsgZGlzdGFuY2U6IDEsIG5leHQ6IGRlcE5hbWUgfSlcbiAgICB9XG5cbiAgICAvLyBTZXJ2aWNlIGRlcGVuZGVuY2llc1xuICAgIGZvciAoY29uc3Qgc2VydmljZSBvZiBtb2R1bGUuc2VydmljZUNvbmZpZ3MgfHwgW10pIHtcbiAgICAgIGZvciAoY29uc3QgZGVwTmFtZSBvZiBzZXJ2aWNlLmRlcGVuZGVuY2llcykge1xuICAgICAgICBzZXQoc2VydmljZUdyYXBoLCBbc2VydmljZS5uYW1lLCBkZXBOYW1lXSwgeyBkaXN0YW5jZTogMSwgbmV4dDogZGVwTmFtZSB9KVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHNlcnZpY2VOYW1lcyA9IHNlcnZpY2VzLm1hcChzID0+IHMubmFtZSlcbiAgY29uc3QgYnVpbGRDeWNsZXMgPSBkZXRlY3RDeWNsZXMoYnVpbGRHcmFwaCwgbW9kdWxlcy5tYXAobSA9PiBtLm5hbWUpKVxuICBjb25zdCBzZXJ2aWNlQ3ljbGVzID0gZGV0ZWN0Q3ljbGVzKHNlcnZpY2VHcmFwaCwgc2VydmljZU5hbWVzKVxuXG4gIGlmIChidWlsZEN5Y2xlcy5sZW5ndGggPiAwIHx8IHNlcnZpY2VDeWNsZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGRldGFpbCA9IHt9XG5cbiAgICBpZiAoYnVpbGRDeWNsZXMubGVuZ3RoID4gMCkge1xuICAgICAgZGV0YWlsW1wiY2lyY3VsYXItYnVpbGQtZGVwZW5kZW5jaWVzXCJdID0gY3ljbGVzVG9TdHJpbmcoYnVpbGRDeWNsZXMpXG4gICAgfVxuXG4gICAgaWYgKHNlcnZpY2VDeWNsZXMubGVuZ3RoID4gMCkge1xuICAgICAgZGV0YWlsW1wiY2lyY3VsYXItc2VydmljZS1kZXBlbmRlbmNpZXNcIl0gPSBjeWNsZXNUb1N0cmluZyhzZXJ2aWNlQ3ljbGVzKVxuICAgIH1cblxuICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoXCJDaXJjdWxhciBkZXBlbmRlbmNpZXMgZGV0ZWN0ZWRcIiwgZGV0YWlsKVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RDeWNsZXMoZ3JhcGgsIHZlcnRpY2VzOiBzdHJpbmdbXSk6IEN5Y2xlW10ge1xuICAvLyBDb21wdXRlIHNob3J0ZXN0IHBhdGhzXG4gIGZvciAoY29uc3QgayBvZiB2ZXJ0aWNlcykge1xuICAgIGZvciAoY29uc3QgaSBvZiB2ZXJ0aWNlcykge1xuICAgICAgZm9yIChjb25zdCBqIG9mIHZlcnRpY2VzKSB7XG4gICAgICAgIGNvbnN0IGRpc3RhbmNlVmlhSzogbnVtYmVyID0gZGlzdGFuY2UoZ3JhcGgsIGksIGspICsgZGlzdGFuY2UoZ3JhcGgsIGssIGopXG4gICAgICAgIGlmIChkaXN0YW5jZVZpYUsgPCBkaXN0YW5jZShncmFwaCwgaSwgaikpIHtcbiAgICAgICAgICBjb25zdCBuZXh0VmlhSyA9IG5leHQoZ3JhcGgsIGksIGspXG4gICAgICAgICAgc2V0KGdyYXBoLCBbaSwgal0sIHsgZGlzdGFuY2U6IGRpc3RhbmNlVmlhSywgbmV4dDogbmV4dFZpYUsgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJlY29uc3RydWN0IGN5Y2xlcywgaWYgYW55XG4gIGNvbnN0IGN5Y2xlVmVydGljZXMgPSB2ZXJ0aWNlcy5maWx0ZXIodiA9PiBuZXh0KGdyYXBoLCB2LCB2KSlcbiAgY29uc3QgY3ljbGVzOiBDeWNsZVtdID0gY3ljbGVWZXJ0aWNlcy5tYXAodiA9PiB7XG4gICAgY29uc3QgY3ljbGUgPSBbdl1cbiAgICBsZXQgbmV4dEluQ3ljbGUgPSBuZXh0KGdyYXBoLCB2LCB2KSFcbiAgICB3aGlsZSAobmV4dEluQ3ljbGUgIT09IHYpIHtcbiAgICAgIGN5Y2xlLnB1c2gobmV4dEluQ3ljbGUpXG4gICAgICBuZXh0SW5DeWNsZSA9IG5leHQoZ3JhcGgsIG5leHRJbkN5Y2xlLCB2KSFcbiAgICB9XG4gICAgcmV0dXJuIGN5Y2xlXG4gIH0pXG5cbiAgcmV0dXJuIHVuaXFXaXRoKFxuICAgIGN5Y2xlcywgLy8gVGhlIGNvbmNhdCBjYWxscyBiZWxvdyBhcmUgdG8gcHJldmVudCBpbi1wbGFjZSBzb3J0aW5nLlxuICAgIChjMSwgYzIpID0+IGlzRXF1YWwoYzEuY29uY2F0KCkuc29ydCgpLCBjMi5jb25jYXQoKS5zb3J0KCkpKVxufVxuXG5mdW5jdGlvbiBkaXN0YW5jZShncmFwaCwgc291cmNlLCBkZXN0aW5hdGlvbik6IG51bWJlciB7XG4gIHJldHVybiBnZXQoZ3JhcGgsIFtzb3VyY2UsIGRlc3RpbmF0aW9uLCBcImRpc3RhbmNlXCJdLCBJbmZpbml0eSlcbn1cblxuZnVuY3Rpb24gbmV4dChncmFwaCwgc291cmNlLCBkZXN0aW5hdGlvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIHJldHVybiBnZXQoZ3JhcGgsIFtzb3VyY2UsIGRlc3RpbmF0aW9uLCBcIm5leHRcIl0pXG59XG5cbmZ1bmN0aW9uIGN5Y2xlc1RvU3RyaW5nKGN5Y2xlczogQ3ljbGVbXSkge1xuICBjb25zdCBjeWNsZURlc2NyaXB0aW9ucyA9IGN5Y2xlcy5tYXAoYyA9PiBqb2luKGMuY29uY2F0KFtjWzBdXSksIFwiIDwtIFwiKSlcbiAgcmV0dXJuIGN5Y2xlRGVzY3JpcHRpb25zLmxlbmd0aCA9PT0gMSA/IGN5Y2xlRGVzY3JpcHRpb25zWzBdIDogY3ljbGVEZXNjcmlwdGlvbnNcbn1cbiJdfQ==
