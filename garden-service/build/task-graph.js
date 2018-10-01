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
const Bluebird = require("bluebird");
const PQueue = require("p-queue");
const chalk_1 = require("chalk");
const lodash_1 = require("lodash");
const base_1 = require("./tasks/base");
const exceptions_1 = require("./exceptions");
class TaskGraphError extends Error {
}
exports.DEFAULT_CONCURRENCY = 4;
class TaskGraph {
    constructor(garden, concurrency = exports.DEFAULT_CONCURRENCY) {
        this.garden = garden;
        this.concurrency = concurrency;
        this.roots = new TaskNodeMap();
        this.index = new TaskNodeMap();
        this.inProgress = new TaskNodeMap();
        this.resultCache = new ResultCache();
        this.opQueue = new PQueue({ concurrency: 1 });
        this.logEntryMap = {};
    }
    addTask(task) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.opQueue.add(() => this.addTaskInternal(task));
        });
    }
    processTasks() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.opQueue.add(() => this.processTasksInternal());
        });
    }
    addTaskInternal(task) {
        return __awaiter(this, void 0, void 0, function* () {
            const predecessor = this.getPredecessor(task);
            let node = this.getNode(task);
            if (predecessor) {
                /*
                  predecessor is already in the graph, having the same baseKey as task,
                  but a different key (see the getPredecessor method below).
                */
                if (this.inProgress.contains(predecessor)) {
                    this.index.addNode(node);
                    /*
                      We transition
                        [dependencies] > predecessor > [dependants]
                      to
                        [dependencies] > predecessor > node > [dependants]
                     */
                    this.inherit(predecessor, node);
                    return;
                }
                else {
                    node = predecessor; // No need to add a new TaskNode.
                }
            }
            this.index.addNode(node);
            yield this.addDependencies(node);
            if (node.getDependencies().length === 0) {
                this.roots.addNode(node);
            }
            else {
                yield this.addDependants(node);
            }
        });
    }
    getNode(task) {
        const existing = this.index.getNode(task);
        return existing || new TaskNode(task);
    }
    /*
      Process the graph until it's complete
     */
    processTasksInternal() {
        return __awaiter(this, void 0, void 0, function* () {
            const _this = this;
            const results = {};
            const loop = () => __awaiter(this, void 0, void 0, function* () {
                if (_this.index.length === 0) {
                    // done!
                    this.logEntryMap.counter && this.logEntryMap.counter.setDone({ symbol: "info" });
                    return;
                }
                const batch = _this.roots.getNodes()
                    .filter(n => !this.inProgress.contains(n))
                    .slice(0, _this.concurrency - this.inProgress.length);
                batch.forEach(n => this.inProgress.addNode(n));
                this.initLogging();
                return Bluebird.map(batch, (node) => __awaiter(this, void 0, void 0, function* () {
                    const task = node.task;
                    const type = node.getType();
                    const baseKey = node.getBaseKey();
                    const description = node.getDescription();
                    let result;
                    try {
                        this.logTask(node);
                        this.logEntryMap.inProgress.setState(inProgressToStr(this.inProgress.getNodes()));
                        const dependencyBaseKeys = (yield task.getDependencies())
                            .map(dep => dep.getBaseKey());
                        const dependencyResults = lodash_1.merge(this.resultCache.pick(dependencyBaseKeys), lodash_1.pick(results, dependencyBaseKeys));
                        try {
                            result = yield node.process(dependencyResults);
                        }
                        catch (error) {
                            result = { type, description, error };
                            this.logTaskError(node, error);
                            this.cancelDependants(node);
                        }
                        finally {
                            results[baseKey] = result;
                            this.resultCache.put(baseKey, task.version.versionString, result);
                        }
                    }
                    finally {
                        this.completeTask(node, !result.error);
                    }
                    return loop();
                }));
            });
            yield loop();
            return results;
        });
    }
    completeTask(node, success) {
        if (node.getDependencies().length > 0) {
            throw new TaskGraphError(`Task ${node.getKey()} still has unprocessed dependencies`);
        }
        for (let d of node.getDependants()) {
            d.removeDependency(node);
            if (d.getDependencies().length === 0) {
                this.roots.addNode(d);
            }
        }
        this.remove(node);
        this.logTaskComplete(node, success);
    }
    getPredecessor(task) {
        const key = task.getKey();
        const baseKey = task.getBaseKey();
        const predecessors = this.index.getNodes()
            .filter(n => n.getBaseKey() === baseKey && n.getKey() !== key)
            .reverse();
        return predecessors[0] || null;
    }
    addDependencies(node) {
        return __awaiter(this, void 0, void 0, function* () {
            const task = node.task;
            for (const d of yield task.getDependencies()) {
                if (!d.force && this.resultCache.get(d.getBaseKey(), d.version.versionString)) {
                    continue;
                }
                const dependency = this.getPredecessor(d) || this.getNode(d);
                this.index.addNode(dependency);
                node.addDependency(dependency);
            }
        });
    }
    addDependants(node) {
        return __awaiter(this, void 0, void 0, function* () {
            const nodeDependencies = node.getDependencies();
            for (const d of nodeDependencies) {
                const dependant = this.getPredecessor(d.task) || d;
                yield this.addTaskInternal(dependant.task);
                dependant.addDependant(node);
            }
        });
    }
    inherit(oldNode, newNode) {
        oldNode.getDependants().forEach(node => {
            newNode.addDependant(node);
            oldNode.removeDependant(node);
            node.removeDependency(oldNode);
            node.addDependency(newNode);
        });
        newNode.addDependency(oldNode);
        oldNode.addDependant(newNode);
    }
    // Should only be called when node is not a dependant for any task.
    remove(node) {
        this.roots.removeNode(node);
        this.index.removeNode(node);
        this.inProgress.removeNode(node);
    }
    // Recursively remove node's dependants, without removing node.
    cancelDependants(node) {
        const remover = (n) => {
            for (const dependant of n.getDependants()) {
                this.logTaskComplete(n, false);
                remover(dependant);
            }
            this.remove(n);
        };
        for (const dependant of node.getDependants()) {
            node.removeDependant(dependant);
            remover(dependant);
        }
    }
    // Logging
    logTask(node) {
        const entry = this.garden.log.debug({
            section: "tasks",
            msg: `Processing task ${taskStyle(node.getKey())}`,
            status: "active",
        });
        this.logEntryMap[node.getKey()] = entry;
    }
    logTaskComplete(node, success) {
        const entry = this.logEntryMap[node.getKey()];
        if (entry) {
            success ? entry.setSuccess() : entry.setError();
        }
        this.logEntryMap.counter.setState(remainingTasksToStr(this.index.length));
    }
    initLogging() {
        if (!Object.keys(this.logEntryMap).length) {
            const header = this.garden.log.debug("Processing tasks...");
            const counter = this.garden.log.debug({
                msg: remainingTasksToStr(this.index.length),
                status: "active",
            });
            const inProgress = this.garden.log.debug(inProgressToStr(this.inProgress.getNodes()));
            this.logEntryMap = Object.assign({}, this.logEntryMap, { header,
                counter,
                inProgress });
        }
    }
    logTaskError(node, err) {
        const divider = lodash_1.padEnd("", 80, "—");
        const error = exceptions_1.toGardenError(err);
        const msg = `\nFailed ${node.getDescription()}. Here is the output:\n${divider}\n${error.message}\n${divider}\n`;
        this.garden.log.error({ msg, error });
    }
}
exports.TaskGraph = TaskGraph;
function getIndexKey(task) {
    const key = task.getKey();
    if (!task.type || !key || task.type.length === 0 || key.length === 0) {
        throw new base_1.TaskDefinitionError("Tasks must define a type and a key");
    }
    return key;
}
class TaskNodeMap {
    constructor() {
        this.index = new Map();
        this.length = 0;
    }
    getNode(task) {
        const indexKey = getIndexKey(task);
        const element = this.index.get(indexKey);
        return element;
    }
    addNode(node) {
        const indexKey = node.getKey();
        if (!this.index.get(indexKey)) {
            this.index.set(indexKey, node);
            this.length++;
        }
    }
    removeNode(node) {
        if (this.index.delete(node.getKey())) {
            this.length--;
        }
    }
    getNodes() {
        return Array.from(this.index.values());
    }
    contains(node) {
        return this.index.has(node.getKey());
    }
}
class TaskNode {
    constructor(task) {
        this.task = task;
        this.dependencies = new TaskNodeMap();
        this.dependants = new TaskNodeMap();
    }
    addDependency(node) {
        this.dependencies.addNode(node);
    }
    addDependant(node) {
        this.dependants.addNode(node);
    }
    removeDependency(node) {
        this.dependencies.removeNode(node);
    }
    removeDependant(node) {
        this.dependants.removeNode(node);
    }
    getDependencies() {
        return this.dependencies.getNodes();
    }
    getDependants() {
        return this.dependants.getNodes();
    }
    getBaseKey() {
        return this.task.getBaseKey();
    }
    getKey() {
        return getIndexKey(this.task);
    }
    getDescription() {
        return this.task.getDescription();
    }
    getType() {
        return this.task.type;
    }
    // For testing/debugging purposes
    inspect() {
        return {
            key: this.getKey(),
            dependencies: this.getDependencies().map(d => d.getKey()),
            dependants: this.getDependants().map(d => d.getKey()),
        };
    }
    process(dependencyResults) {
        return __awaiter(this, void 0, void 0, function* () {
            const output = yield this.task.process(dependencyResults);
            return {
                type: this.getType(),
                description: this.getDescription(),
                output,
                dependencyResults,
            };
        });
    }
}
class ResultCache {
    constructor() {
        this.cache = {};
    }
    put(baseKey, versionString, result) {
        this.cache[baseKey] = { result, versionString };
    }
    get(baseKey, versionString) {
        const r = this.cache[baseKey];
        return (r && r.versionString === versionString && !r.result.error) ? r.result : null;
    }
    getNewest(baseKey) {
        const r = this.cache[baseKey];
        return (r && !r.result.error) ? r.result : null;
    }
    // Returns newest cached results, if any, for baseKeys
    pick(baseKeys) {
        const results = {};
        for (const baseKey of baseKeys) {
            const cachedResult = this.getNewest(baseKey);
            if (cachedResult) {
                results[baseKey] = cachedResult;
            }
        }
        return results;
    }
}
const taskStyle = chalk_1.default.cyan.bold;
function inProgressToStr(nodes) {
    return `Currently in progress [${nodes.map(n => taskStyle(n.getKey())).join(", ")}]`;
}
function remainingTasksToStr(num) {
    const style = num === 0 ? chalk_1.default.green : chalk_1.default.yellow;
    return `Remaining tasks ${style.bold(String(num))}`;
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUE7SUFDakQsQ0FBQztJQUVELHNEQUFzRDtJQUN0RCxJQUFJLENBQUMsUUFBa0I7UUFDckIsTUFBTSxPQUFPLEdBQWdCLEVBQUUsQ0FBQTtRQUUvQixLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRTtZQUM5QixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1lBQzVDLElBQUksWUFBWSxFQUFFO2dCQUNoQixPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsWUFBWSxDQUFBO2FBQ2hDO1NBQ0Y7UUFFRCxPQUFPLE9BQU8sQ0FBQTtJQUNoQixDQUFDO0NBRUY7QUFJRCxNQUFNLFNBQVMsR0FBRyxlQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQTtBQUVqQyxTQUFTLGVBQWUsQ0FBQyxLQUFLO0lBQzVCLE9BQU8sMEJBQTBCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQTtBQUN0RixDQUFDO0FBRUQsU0FBUyxtQkFBbUIsQ0FBQyxHQUFHO0lBQzlCLE1BQU0sS0FBSyxHQUFHLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGVBQUssQ0FBQyxNQUFNLENBQUE7SUFDcEQsT0FBTyxtQkFBbUIsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFBO0FBQ3JELENBQUMiLCJmaWxlIjoidGFzay1ncmFwaC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBCbHVlYmlyZCBmcm9tIFwiYmx1ZWJpcmRcIlxuaW1wb3J0ICogYXMgUFF1ZXVlIGZyb20gXCJwLXF1ZXVlXCJcbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuaW1wb3J0IHsgbWVyZ2UsIHBhZEVuZCwgcGljayB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgVGFzaywgVGFza0RlZmluaXRpb25FcnJvciB9IGZyb20gXCIuL3Rhc2tzL2Jhc2VcIlxuXG5pbXBvcnQgeyBMb2dFbnRyeSB9IGZyb20gXCIuL2xvZ2dlci9sb2ctZW50cnlcIlxuaW1wb3J0IHsgdG9HYXJkZW5FcnJvciB9IGZyb20gXCIuL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHsgR2FyZGVuIH0gZnJvbSBcIi4vZ2FyZGVuXCJcblxuY2xhc3MgVGFza0dyYXBoRXJyb3IgZXh0ZW5kcyBFcnJvciB7IH1cblxuZXhwb3J0IGludGVyZmFjZSBUYXNrUmVzdWx0IHtcbiAgdHlwZTogc3RyaW5nXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmdcbiAgb3V0cHV0PzogYW55XG4gIGRlcGVuZGVuY3lSZXN1bHRzPzogVGFza1Jlc3VsdHNcbiAgZXJyb3I/OiBFcnJvclxufVxuXG4vKlxuICBXaGVuIG11bHRpcGxlIHRhc2tzIHdpdGggdGhlIHNhbWUgYmFzZUtleSBhcmUgY29tcGxldGVkIGR1cmluZyBhIGNhbGwgdG8gcHJvY2Vzc1Rhc2tzLFxuICB0aGUgcmVzdWx0IGZyb20gdGhlIGxhc3QgcHJvY2Vzc2VkIGlzIHVzZWQgKGhlbmNlIG9ubHkgb25lIGtleS12YWx1ZSBwYWlyIGhlcmUgcGVyIGJhc2VLZXkpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFRhc2tSZXN1bHRzIHtcbiAgW2Jhc2VLZXk6IHN0cmluZ106IFRhc2tSZXN1bHRcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfQ09OQ1VSUkVOQ1kgPSA0XG5cbmV4cG9ydCBjbGFzcyBUYXNrR3JhcGgge1xuICBwcml2YXRlIHJvb3RzOiBUYXNrTm9kZU1hcFxuICBwcml2YXRlIGluZGV4OiBUYXNrTm9kZU1hcFxuXG4gIHByaXZhdGUgaW5Qcm9ncmVzczogVGFza05vZGVNYXBcbiAgcHJpdmF0ZSBsb2dFbnRyeU1hcDogTG9nRW50cnlNYXBcblxuICBwcml2YXRlIHJlc3VsdENhY2hlOiBSZXN1bHRDYWNoZVxuICBwcml2YXRlIG9wUXVldWU6IFBRdWV1ZVxuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZ2FyZGVuOiBHYXJkZW4sIHByaXZhdGUgY29uY3VycmVuY3k6IG51bWJlciA9IERFRkFVTFRfQ09OQ1VSUkVOQ1kpIHtcbiAgICB0aGlzLnJvb3RzID0gbmV3IFRhc2tOb2RlTWFwKClcbiAgICB0aGlzLmluZGV4ID0gbmV3IFRhc2tOb2RlTWFwKClcbiAgICB0aGlzLmluUHJvZ3Jlc3MgPSBuZXcgVGFza05vZGVNYXAoKVxuICAgIHRoaXMucmVzdWx0Q2FjaGUgPSBuZXcgUmVzdWx0Q2FjaGUoKVxuICAgIHRoaXMub3BRdWV1ZSA9IG5ldyBQUXVldWUoeyBjb25jdXJyZW5jeTogMSB9KVxuICAgIHRoaXMubG9nRW50cnlNYXAgPSB7fVxuICB9XG5cbiAgYXN5bmMgYWRkVGFzayh0YXNrOiBUYXNrKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMub3BRdWV1ZS5hZGQoKCkgPT4gdGhpcy5hZGRUYXNrSW50ZXJuYWwodGFzaykpXG4gIH1cblxuICBhc3luYyBwcm9jZXNzVGFza3MoKTogUHJvbWlzZTxUYXNrUmVzdWx0cz4ge1xuICAgIHJldHVybiB0aGlzLm9wUXVldWUuYWRkKCgpID0+IHRoaXMucHJvY2Vzc1Rhc2tzSW50ZXJuYWwoKSlcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgYWRkVGFza0ludGVybmFsKHRhc2s6IFRhc2spIHtcbiAgICBjb25zdCBwcmVkZWNlc3NvciA9IHRoaXMuZ2V0UHJlZGVjZXNzb3IodGFzaylcbiAgICBsZXQgbm9kZSA9IHRoaXMuZ2V0Tm9kZSh0YXNrKVxuXG4gICAgaWYgKHByZWRlY2Vzc29yKSB7XG4gICAgICAvKlxuICAgICAgICBwcmVkZWNlc3NvciBpcyBhbHJlYWR5IGluIHRoZSBncmFwaCwgaGF2aW5nIHRoZSBzYW1lIGJhc2VLZXkgYXMgdGFzayxcbiAgICAgICAgYnV0IGEgZGlmZmVyZW50IGtleSAoc2VlIHRoZSBnZXRQcmVkZWNlc3NvciBtZXRob2QgYmVsb3cpLlxuICAgICAgKi9cbiAgICAgIGlmICh0aGlzLmluUHJvZ3Jlc3MuY29udGFpbnMocHJlZGVjZXNzb3IpKSB7XG4gICAgICAgIHRoaXMuaW5kZXguYWRkTm9kZShub2RlKVxuICAgICAgICAvKlxuICAgICAgICAgIFdlIHRyYW5zaXRpb25cbiAgICAgICAgICAgIFtkZXBlbmRlbmNpZXNdID4gcHJlZGVjZXNzb3IgPiBbZGVwZW5kYW50c11cbiAgICAgICAgICB0b1xuICAgICAgICAgICAgW2RlcGVuZGVuY2llc10gPiBwcmVkZWNlc3NvciA+IG5vZGUgPiBbZGVwZW5kYW50c11cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuaW5oZXJpdChwcmVkZWNlc3Nvciwgbm9kZSlcbiAgICAgICAgcmV0dXJuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBub2RlID0gcHJlZGVjZXNzb3IgLy8gTm8gbmVlZCB0byBhZGQgYSBuZXcgVGFza05vZGUuXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5pbmRleC5hZGROb2RlKG5vZGUpXG4gICAgYXdhaXQgdGhpcy5hZGREZXBlbmRlbmNpZXMobm9kZSlcblxuICAgIGlmIChub2RlLmdldERlcGVuZGVuY2llcygpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhpcy5yb290cy5hZGROb2RlKG5vZGUpXG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMuYWRkRGVwZW5kYW50cyhub2RlKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0Tm9kZSh0YXNrOiBUYXNrKTogVGFza05vZGUge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5pbmRleC5nZXROb2RlKHRhc2spXG4gICAgcmV0dXJuIGV4aXN0aW5nIHx8IG5ldyBUYXNrTm9kZSh0YXNrKVxuICB9XG4gIC8qXG4gICAgUHJvY2VzcyB0aGUgZ3JhcGggdW50aWwgaXQncyBjb21wbGV0ZVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzVGFza3NJbnRlcm5hbCgpOiBQcm9taXNlPFRhc2tSZXN1bHRzPiB7XG4gICAgY29uc3QgX3RoaXMgPSB0aGlzXG4gICAgY29uc3QgcmVzdWx0czogVGFza1Jlc3VsdHMgPSB7fVxuXG4gICAgY29uc3QgbG9vcCA9IGFzeW5jICgpID0+IHtcbiAgICAgIGlmIChfdGhpcy5pbmRleC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgLy8gZG9uZSFcbiAgICAgICAgdGhpcy5sb2dFbnRyeU1hcC5jb3VudGVyICYmIHRoaXMubG9nRW50cnlNYXAuY291bnRlci5zZXREb25lKHsgc3ltYm9sOiBcImluZm9cIiB9KVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgY29uc3QgYmF0Y2ggPSBfdGhpcy5yb290cy5nZXROb2RlcygpXG4gICAgICAgIC5maWx0ZXIobiA9PiAhdGhpcy5pblByb2dyZXNzLmNvbnRhaW5zKG4pKVxuICAgICAgICAuc2xpY2UoMCwgX3RoaXMuY29uY3VycmVuY3kgLSB0aGlzLmluUHJvZ3Jlc3MubGVuZ3RoKVxuXG4gICAgICBiYXRjaC5mb3JFYWNoKG4gPT4gdGhpcy5pblByb2dyZXNzLmFkZE5vZGUobikpXG5cbiAgICAgIHRoaXMuaW5pdExvZ2dpbmcoKVxuXG4gICAgICByZXR1cm4gQmx1ZWJpcmQubWFwKGJhdGNoLCBhc3luYyAobm9kZTogVGFza05vZGUpID0+IHtcbiAgICAgICAgY29uc3QgdGFzayA9IG5vZGUudGFza1xuICAgICAgICBjb25zdCB0eXBlID0gbm9kZS5nZXRUeXBlKClcbiAgICAgICAgY29uc3QgYmFzZUtleSA9IG5vZGUuZ2V0QmFzZUtleSgpXG4gICAgICAgIGNvbnN0IGRlc2NyaXB0aW9uID0gbm9kZS5nZXREZXNjcmlwdGlvbigpXG4gICAgICAgIGxldCByZXN1bHRcblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHRoaXMubG9nVGFzayhub2RlKVxuICAgICAgICAgIHRoaXMubG9nRW50cnlNYXAuaW5Qcm9ncmVzcy5zZXRTdGF0ZShpblByb2dyZXNzVG9TdHIodGhpcy5pblByb2dyZXNzLmdldE5vZGVzKCkpKVxuXG4gICAgICAgICAgY29uc3QgZGVwZW5kZW5jeUJhc2VLZXlzID0gKGF3YWl0IHRhc2suZ2V0RGVwZW5kZW5jaWVzKCkpXG4gICAgICAgICAgICAubWFwKGRlcCA9PiBkZXAuZ2V0QmFzZUtleSgpKVxuXG4gICAgICAgICAgY29uc3QgZGVwZW5kZW5jeVJlc3VsdHMgPSBtZXJnZShcbiAgICAgICAgICAgIHRoaXMucmVzdWx0Q2FjaGUucGljayhkZXBlbmRlbmN5QmFzZUtleXMpLFxuICAgICAgICAgICAgcGljayhyZXN1bHRzLCBkZXBlbmRlbmN5QmFzZUtleXMpKVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGF3YWl0IG5vZGUucHJvY2VzcyhkZXBlbmRlbmN5UmVzdWx0cylcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgcmVzdWx0ID0geyB0eXBlLCBkZXNjcmlwdGlvbiwgZXJyb3IgfVxuICAgICAgICAgICAgdGhpcy5sb2dUYXNrRXJyb3Iobm9kZSwgZXJyb3IpXG4gICAgICAgICAgICB0aGlzLmNhbmNlbERlcGVuZGFudHMobm9kZSlcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgcmVzdWx0c1tiYXNlS2V5XSA9IHJlc3VsdFxuICAgICAgICAgICAgdGhpcy5yZXN1bHRDYWNoZS5wdXQoYmFzZUtleSwgdGFzay52ZXJzaW9uLnZlcnNpb25TdHJpbmcsIHJlc3VsdClcbiAgICAgICAgICB9XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgdGhpcy5jb21wbGV0ZVRhc2sobm9kZSwgIXJlc3VsdC5lcnJvcilcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBsb29wKClcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgYXdhaXQgbG9vcCgpXG5cbiAgICByZXR1cm4gcmVzdWx0c1xuICB9XG5cbiAgcHJpdmF0ZSBjb21wbGV0ZVRhc2sobm9kZTogVGFza05vZGUsIHN1Y2Nlc3M6IGJvb2xlYW4pIHtcbiAgICBpZiAobm9kZS5nZXREZXBlbmRlbmNpZXMoKS5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgVGFza0dyYXBoRXJyb3IoYFRhc2sgJHtub2RlLmdldEtleSgpfSBzdGlsbCBoYXMgdW5wcm9jZXNzZWQgZGVwZW5kZW5jaWVzYClcbiAgICB9XG5cbiAgICBmb3IgKGxldCBkIG9mIG5vZGUuZ2V0RGVwZW5kYW50cygpKSB7XG4gICAgICBkLnJlbW92ZURlcGVuZGVuY3kobm9kZSlcblxuICAgICAgaWYgKGQuZ2V0RGVwZW5kZW5jaWVzKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRoaXMucm9vdHMuYWRkTm9kZShkKVxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMucmVtb3ZlKG5vZGUpXG4gICAgdGhpcy5sb2dUYXNrQ29tcGxldGUobm9kZSwgc3VjY2VzcylcbiAgfVxuXG4gIHByaXZhdGUgZ2V0UHJlZGVjZXNzb3IodGFzazogVGFzayk6IFRhc2tOb2RlIHwgbnVsbCB7XG4gICAgY29uc3Qga2V5ID0gdGFzay5nZXRLZXkoKVxuICAgIGNvbnN0IGJhc2VLZXkgPSB0YXNrLmdldEJhc2VLZXkoKVxuICAgIGNvbnN0IHByZWRlY2Vzc29ycyA9IHRoaXMuaW5kZXguZ2V0Tm9kZXMoKVxuICAgICAgLmZpbHRlcihuID0+IG4uZ2V0QmFzZUtleSgpID09PSBiYXNlS2V5ICYmIG4uZ2V0S2V5KCkgIT09IGtleSlcbiAgICAgIC5yZXZlcnNlKClcbiAgICByZXR1cm4gcHJlZGVjZXNzb3JzWzBdIHx8IG51bGxcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgYWRkRGVwZW5kZW5jaWVzKG5vZGU6IFRhc2tOb2RlKSB7XG4gICAgY29uc3QgdGFzayA9IG5vZGUudGFza1xuICAgIGZvciAoY29uc3QgZCBvZiBhd2FpdCB0YXNrLmdldERlcGVuZGVuY2llcygpKSB7XG5cbiAgICAgIGlmICghZC5mb3JjZSAmJiB0aGlzLnJlc3VsdENhY2hlLmdldChkLmdldEJhc2VLZXkoKSwgZC52ZXJzaW9uLnZlcnNpb25TdHJpbmcpKSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGRlcGVuZGVuY3kgPSB0aGlzLmdldFByZWRlY2Vzc29yKGQpIHx8IHRoaXMuZ2V0Tm9kZShkKVxuICAgICAgdGhpcy5pbmRleC5hZGROb2RlKGRlcGVuZGVuY3kpXG4gICAgICBub2RlLmFkZERlcGVuZGVuY3koZGVwZW5kZW5jeSlcblxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgYWRkRGVwZW5kYW50cyhub2RlOiBUYXNrTm9kZSkge1xuICAgIGNvbnN0IG5vZGVEZXBlbmRlbmNpZXMgPSBub2RlLmdldERlcGVuZGVuY2llcygpXG4gICAgZm9yIChjb25zdCBkIG9mIG5vZGVEZXBlbmRlbmNpZXMpIHtcbiAgICAgIGNvbnN0IGRlcGVuZGFudCA9IHRoaXMuZ2V0UHJlZGVjZXNzb3IoZC50YXNrKSB8fCBkXG4gICAgICBhd2FpdCB0aGlzLmFkZFRhc2tJbnRlcm5hbChkZXBlbmRhbnQudGFzaylcbiAgICAgIGRlcGVuZGFudC5hZGREZXBlbmRhbnQobm9kZSlcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGluaGVyaXQob2xkTm9kZTogVGFza05vZGUsIG5ld05vZGU6IFRhc2tOb2RlKSB7XG4gICAgb2xkTm9kZS5nZXREZXBlbmRhbnRzKCkuZm9yRWFjaChub2RlID0+IHtcbiAgICAgIG5ld05vZGUuYWRkRGVwZW5kYW50KG5vZGUpXG4gICAgICBvbGROb2RlLnJlbW92ZURlcGVuZGFudChub2RlKVxuICAgICAgbm9kZS5yZW1vdmVEZXBlbmRlbmN5KG9sZE5vZGUpXG4gICAgICBub2RlLmFkZERlcGVuZGVuY3kobmV3Tm9kZSlcbiAgICB9KVxuXG4gICAgbmV3Tm9kZS5hZGREZXBlbmRlbmN5KG9sZE5vZGUpXG4gICAgb2xkTm9kZS5hZGREZXBlbmRhbnQobmV3Tm9kZSlcbiAgfVxuXG4gIC8vIFNob3VsZCBvbmx5IGJlIGNhbGxlZCB3aGVuIG5vZGUgaXMgbm90IGEgZGVwZW5kYW50IGZvciBhbnkgdGFzay5cbiAgcHJpdmF0ZSByZW1vdmUobm9kZTogVGFza05vZGUpIHtcbiAgICB0aGlzLnJvb3RzLnJlbW92ZU5vZGUobm9kZSlcbiAgICB0aGlzLmluZGV4LnJlbW92ZU5vZGUobm9kZSlcbiAgICB0aGlzLmluUHJvZ3Jlc3MucmVtb3ZlTm9kZShub2RlKVxuICB9XG5cbiAgLy8gUmVjdXJzaXZlbHkgcmVtb3ZlIG5vZGUncyBkZXBlbmRhbnRzLCB3aXRob3V0IHJlbW92aW5nIG5vZGUuXG4gIHByaXZhdGUgY2FuY2VsRGVwZW5kYW50cyhub2RlOiBUYXNrTm9kZSkge1xuICAgIGNvbnN0IHJlbW92ZXIgPSAobikgPT4ge1xuICAgICAgZm9yIChjb25zdCBkZXBlbmRhbnQgb2Ygbi5nZXREZXBlbmRhbnRzKCkpIHtcbiAgICAgICAgdGhpcy5sb2dUYXNrQ29tcGxldGUobiwgZmFsc2UpXG4gICAgICAgIHJlbW92ZXIoZGVwZW5kYW50KVxuICAgICAgfVxuICAgICAgdGhpcy5yZW1vdmUobilcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGRlcGVuZGFudCBvZiBub2RlLmdldERlcGVuZGFudHMoKSkge1xuICAgICAgbm9kZS5yZW1vdmVEZXBlbmRhbnQoZGVwZW5kYW50KVxuICAgICAgcmVtb3ZlcihkZXBlbmRhbnQpXG4gICAgfVxuICB9XG5cbiAgLy8gTG9nZ2luZ1xuICBwcml2YXRlIGxvZ1Rhc2sobm9kZTogVGFza05vZGUpIHtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuZ2FyZGVuLmxvZy5kZWJ1Zyh7XG4gICAgICBzZWN0aW9uOiBcInRhc2tzXCIsXG4gICAgICBtc2c6IGBQcm9jZXNzaW5nIHRhc2sgJHt0YXNrU3R5bGUobm9kZS5nZXRLZXkoKSl9YCxcbiAgICAgIHN0YXR1czogXCJhY3RpdmVcIixcbiAgICB9KVxuICAgIHRoaXMubG9nRW50cnlNYXBbbm9kZS5nZXRLZXkoKV0gPSBlbnRyeVxuICB9XG5cbiAgcHJpdmF0ZSBsb2dUYXNrQ29tcGxldGUobm9kZTogVGFza05vZGUsIHN1Y2Nlc3M6IGJvb2xlYW4pIHtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMubG9nRW50cnlNYXBbbm9kZS5nZXRLZXkoKV1cbiAgICBpZiAoZW50cnkpIHtcbiAgICAgIHN1Y2Nlc3MgPyBlbnRyeS5zZXRTdWNjZXNzKCkgOiBlbnRyeS5zZXRFcnJvcigpXG4gICAgfVxuICAgIHRoaXMubG9nRW50cnlNYXAuY291bnRlci5zZXRTdGF0ZShyZW1haW5pbmdUYXNrc1RvU3RyKHRoaXMuaW5kZXgubGVuZ3RoKSlcbiAgfVxuXG4gIHByaXZhdGUgaW5pdExvZ2dpbmcoKSB7XG4gICAgaWYgKCFPYmplY3Qua2V5cyh0aGlzLmxvZ0VudHJ5TWFwKS5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IGhlYWRlciA9IHRoaXMuZ2FyZGVuLmxvZy5kZWJ1ZyhcIlByb2Nlc3NpbmcgdGFza3MuLi5cIilcbiAgICAgIGNvbnN0IGNvdW50ZXIgPSB0aGlzLmdhcmRlbi5sb2cuZGVidWcoe1xuICAgICAgICBtc2c6IHJlbWFpbmluZ1Rhc2tzVG9TdHIodGhpcy5pbmRleC5sZW5ndGgpLFxuICAgICAgICBzdGF0dXM6IFwiYWN0aXZlXCIsXG4gICAgICB9KVxuICAgICAgY29uc3QgaW5Qcm9ncmVzcyA9IHRoaXMuZ2FyZGVuLmxvZy5kZWJ1ZyhpblByb2dyZXNzVG9TdHIodGhpcy5pblByb2dyZXNzLmdldE5vZGVzKCkpKVxuICAgICAgdGhpcy5sb2dFbnRyeU1hcCA9IHtcbiAgICAgICAgLi4udGhpcy5sb2dFbnRyeU1hcCxcbiAgICAgICAgaGVhZGVyLFxuICAgICAgICBjb3VudGVyLFxuICAgICAgICBpblByb2dyZXNzLFxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgbG9nVGFza0Vycm9yKG5vZGU6IFRhc2tOb2RlLCBlcnIpIHtcbiAgICBjb25zdCBkaXZpZGVyID0gcGFkRW5kKFwiXCIsIDgwLCBcIuKAlFwiKVxuICAgIGNvbnN0IGVycm9yID0gdG9HYXJkZW5FcnJvcihlcnIpXG4gICAgY29uc3QgbXNnID0gYFxcbkZhaWxlZCAke25vZGUuZ2V0RGVzY3JpcHRpb24oKX0uIEhlcmUgaXMgdGhlIG91dHB1dDpcXG4ke2RpdmlkZXJ9XFxuJHtlcnJvci5tZXNzYWdlfVxcbiR7ZGl2aWRlcn1cXG5gXG4gICAgdGhpcy5nYXJkZW4ubG9nLmVycm9yKHsgbXNnLCBlcnJvciB9KVxuICB9XG59XG5cbmZ1bmN0aW9uIGdldEluZGV4S2V5KHRhc2s6IFRhc2spIHtcbiAgY29uc3Qga2V5ID0gdGFzay5nZXRLZXkoKVxuXG4gIGlmICghdGFzay50eXBlIHx8ICFrZXkgfHwgdGFzay50eXBlLmxlbmd0aCA9PT0gMCB8fCBrZXkubGVuZ3RoID09PSAwKSB7XG4gICAgdGhyb3cgbmV3IFRhc2tEZWZpbml0aW9uRXJyb3IoXCJUYXNrcyBtdXN0IGRlZmluZSBhIHR5cGUgYW5kIGEga2V5XCIpXG4gIH1cblxuICByZXR1cm4ga2V5XG59XG5cbmNsYXNzIFRhc2tOb2RlTWFwIHtcbiAgLy8gTWFwIGlzIHVzZWQgaGVyZSB0byBmYWNpbGl0YXRlIGluLW9yZGVyIHRyYXZlcnNhbC5cbiAgaW5kZXg6IE1hcDxzdHJpbmcsIFRhc2tOb2RlPlxuICBsZW5ndGg6IG51bWJlclxuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuaW5kZXggPSBuZXcgTWFwKClcbiAgICB0aGlzLmxlbmd0aCA9IDBcbiAgfVxuXG4gIGdldE5vZGUodGFzazogVGFzaykge1xuICAgIGNvbnN0IGluZGV4S2V5ID0gZ2V0SW5kZXhLZXkodGFzaylcbiAgICBjb25zdCBlbGVtZW50ID0gdGhpcy5pbmRleC5nZXQoaW5kZXhLZXkpXG4gICAgcmV0dXJuIGVsZW1lbnRcbiAgfVxuXG4gIGFkZE5vZGUobm9kZTogVGFza05vZGUpOiB2b2lkIHtcbiAgICBjb25zdCBpbmRleEtleSA9IG5vZGUuZ2V0S2V5KClcblxuICAgIGlmICghdGhpcy5pbmRleC5nZXQoaW5kZXhLZXkpKSB7XG4gICAgICB0aGlzLmluZGV4LnNldChpbmRleEtleSwgbm9kZSlcbiAgICAgIHRoaXMubGVuZ3RoKytcbiAgICB9XG4gIH1cblxuICByZW1vdmVOb2RlKG5vZGU6IFRhc2tOb2RlKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaW5kZXguZGVsZXRlKG5vZGUuZ2V0S2V5KCkpKSB7XG4gICAgICB0aGlzLmxlbmd0aC0tXG4gICAgfVxuICB9XG5cbiAgZ2V0Tm9kZXMoKTogVGFza05vZGVbXSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20odGhpcy5pbmRleC52YWx1ZXMoKSlcbiAgfVxuXG4gIGNvbnRhaW5zKG5vZGU6IFRhc2tOb2RlKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuaW5kZXguaGFzKG5vZGUuZ2V0S2V5KCkpXG4gIH1cblxufVxuXG5jbGFzcyBUYXNrTm9kZSB7XG4gIHRhc2s6IFRhc2tcblxuICBwcml2YXRlIGRlcGVuZGVuY2llczogVGFza05vZGVNYXBcbiAgcHJpdmF0ZSBkZXBlbmRhbnRzOiBUYXNrTm9kZU1hcFxuXG4gIGNvbnN0cnVjdG9yKHRhc2s6IFRhc2spIHtcbiAgICB0aGlzLnRhc2sgPSB0YXNrXG4gICAgdGhpcy5kZXBlbmRlbmNpZXMgPSBuZXcgVGFza05vZGVNYXAoKVxuICAgIHRoaXMuZGVwZW5kYW50cyA9IG5ldyBUYXNrTm9kZU1hcCgpXG4gIH1cblxuICBhZGREZXBlbmRlbmN5KG5vZGU6IFRhc2tOb2RlKSB7XG4gICAgdGhpcy5kZXBlbmRlbmNpZXMuYWRkTm9kZShub2RlKVxuICB9XG5cbiAgYWRkRGVwZW5kYW50KG5vZGU6IFRhc2tOb2RlKSB7XG4gICAgdGhpcy5kZXBlbmRhbnRzLmFkZE5vZGUobm9kZSlcbiAgfVxuXG4gIHJlbW92ZURlcGVuZGVuY3kobm9kZTogVGFza05vZGUpIHtcbiAgICB0aGlzLmRlcGVuZGVuY2llcy5yZW1vdmVOb2RlKG5vZGUpXG4gIH1cblxuICByZW1vdmVEZXBlbmRhbnQobm9kZTogVGFza05vZGUpIHtcbiAgICB0aGlzLmRlcGVuZGFudHMucmVtb3ZlTm9kZShub2RlKVxuICB9XG5cbiAgZ2V0RGVwZW5kZW5jaWVzKCkge1xuICAgIHJldHVybiB0aGlzLmRlcGVuZGVuY2llcy5nZXROb2RlcygpXG4gIH1cblxuICBnZXREZXBlbmRhbnRzKCkge1xuICAgIHJldHVybiB0aGlzLmRlcGVuZGFudHMuZ2V0Tm9kZXMoKVxuICB9XG5cbiAgZ2V0QmFzZUtleSgpIHtcbiAgICByZXR1cm4gdGhpcy50YXNrLmdldEJhc2VLZXkoKVxuICB9XG5cbiAgZ2V0S2V5KCkge1xuICAgIHJldHVybiBnZXRJbmRleEtleSh0aGlzLnRhc2spXG4gIH1cblxuICBnZXREZXNjcmlwdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy50YXNrLmdldERlc2NyaXB0aW9uKClcbiAgfVxuXG4gIGdldFR5cGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudGFzay50eXBlXG4gIH1cblxuICAvLyBGb3IgdGVzdGluZy9kZWJ1Z2dpbmcgcHVycG9zZXNcbiAgaW5zcGVjdCgpOiBvYmplY3Qge1xuICAgIHJldHVybiB7XG4gICAgICBrZXk6IHRoaXMuZ2V0S2V5KCksXG4gICAgICBkZXBlbmRlbmNpZXM6IHRoaXMuZ2V0RGVwZW5kZW5jaWVzKCkubWFwKGQgPT4gZC5nZXRLZXkoKSksXG4gICAgICBkZXBlbmRhbnRzOiB0aGlzLmdldERlcGVuZGFudHMoKS5tYXAoZCA9PiBkLmdldEtleSgpKSxcbiAgICB9XG4gIH1cblxuICBhc3luYyBwcm9jZXNzKGRlcGVuZGVuY3lSZXN1bHRzOiBUYXNrUmVzdWx0cykge1xuICAgIGNvbnN0IG91dHB1dCA9IGF3YWl0IHRoaXMudGFzay5wcm9jZXNzKGRlcGVuZGVuY3lSZXN1bHRzKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHR5cGU6IHRoaXMuZ2V0VHlwZSgpLFxuICAgICAgZGVzY3JpcHRpb246IHRoaXMuZ2V0RGVzY3JpcHRpb24oKSxcbiAgICAgIG91dHB1dCxcbiAgICAgIGRlcGVuZGVuY3lSZXN1bHRzLFxuICAgIH1cbiAgfVxufVxuXG5pbnRlcmZhY2UgQ2FjaGVkUmVzdWx0IHtcbiAgcmVzdWx0OiBUYXNrUmVzdWx0LFxuICB2ZXJzaW9uU3RyaW5nOiBzdHJpbmdcbn1cblxuY2xhc3MgUmVzdWx0Q2FjaGUge1xuICAvKlxuICAgIEJ5IGRlc2lnbiwgYXQgbW9zdCBvbmUgVGFza1Jlc3VsdCAodGhlIG1vc3QgcmVjZW50bHkgcHJvY2Vzc2VkKSBpcyBjYWNoZWQgZm9yIGEgZ2l2ZW4gYmFzZUtleS5cblxuICAgIEludmFyaWFudDogTm8gY29uY3VycmVudCBjYWxscyBhcmUgbWFkZSB0byB0aGlzIGNsYXNzJyBpbnN0YW5jZSBtZXRob2RzLCBzaW5jZSB0aGV5XG4gICAgb25seSBoYXBwZW4gd2l0aGluIFRhc2tHcmFwaCdzIGFkZFRhc2tJbnRlcm5hbCBhbmQgcHJvY2Vzc1Rhc2tzSW50ZXJuYWwgbWV0aG9kcyxcbiAgICB3aGljaCBhcmUgbmV2ZXIgZXhlY3V0ZWQgY29uY3VycmVudGx5LCBzaW5jZSB0aGV5IGFyZSBleGVjdXRlZCBzZXF1ZW50aWFsbHkgYnkgdGhlXG4gICAgb3BlcmF0aW9uIHF1ZXVlLlxuICAqL1xuICBwcml2YXRlIGNhY2hlOiB7IFtrZXk6IHN0cmluZ106IENhY2hlZFJlc3VsdCB9XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5jYWNoZSA9IHt9XG4gIH1cblxuICBwdXQoYmFzZUtleTogc3RyaW5nLCB2ZXJzaW9uU3RyaW5nOiBzdHJpbmcsIHJlc3VsdDogVGFza1Jlc3VsdCk6IHZvaWQge1xuICAgIHRoaXMuY2FjaGVbYmFzZUtleV0gPSB7IHJlc3VsdCwgdmVyc2lvblN0cmluZyB9XG4gIH1cblxuICBnZXQoYmFzZUtleTogc3RyaW5nLCB2ZXJzaW9uU3RyaW5nOiBzdHJpbmcpOiBUYXNrUmVzdWx0IHwgbnVsbCB7XG4gICAgY29uc3QgciA9IHRoaXMuY2FjaGVbYmFzZUtleV1cbiAgICByZXR1cm4gKHIgJiYgci52ZXJzaW9uU3RyaW5nID09PSB2ZXJzaW9uU3RyaW5nICYmICFyLnJlc3VsdC5lcnJvcikgPyByLnJlc3VsdCA6IG51bGxcbiAgfVxuXG4gIGdldE5ld2VzdChiYXNlS2V5OiBzdHJpbmcpOiBUYXNrUmVzdWx0IHwgbnVsbCB7XG4gICAgY29uc3QgciA9IHRoaXMuY2FjaGVbYmFzZUtleV1cbiAgICByZXR1cm4gKHIgJiYgIXIucmVzdWx0LmVycm9yKSA/IHIucmVzdWx0IDogbnVsbFxuICB9XG5cbiAgLy8gUmV0dXJucyBuZXdlc3QgY2FjaGVkIHJlc3VsdHMsIGlmIGFueSwgZm9yIGJhc2VLZXlzXG4gIHBpY2soYmFzZUtleXM6IHN0cmluZ1tdKTogVGFza1Jlc3VsdHMge1xuICAgIGNvbnN0IHJlc3VsdHM6IFRhc2tSZXN1bHRzID0ge31cblxuICAgIGZvciAoY29uc3QgYmFzZUtleSBvZiBiYXNlS2V5cykge1xuICAgICAgY29uc3QgY2FjaGVkUmVzdWx0ID0gdGhpcy5nZXROZXdlc3QoYmFzZUtleSlcbiAgICAgIGlmIChjYWNoZWRSZXN1bHQpIHtcbiAgICAgICAgcmVzdWx0c1tiYXNlS2V5XSA9IGNhY2hlZFJlc3VsdFxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHRzXG4gIH1cblxufVxuXG5pbnRlcmZhY2UgTG9nRW50cnlNYXAgeyBba2V5OiBzdHJpbmddOiBMb2dFbnRyeSB9XG5cbmNvbnN0IHRhc2tTdHlsZSA9IGNoYWxrLmN5YW4uYm9sZFxuXG5mdW5jdGlvbiBpblByb2dyZXNzVG9TdHIobm9kZXMpIHtcbiAgcmV0dXJuIGBDdXJyZW50bHkgaW4gcHJvZ3Jlc3MgWyR7bm9kZXMubWFwKG4gPT4gdGFza1N0eWxlKG4uZ2V0S2V5KCkpKS5qb2luKFwiLCBcIil9XWBcbn1cblxuZnVuY3Rpb24gcmVtYWluaW5nVGFza3NUb1N0cihudW0pIHtcbiAgY29uc3Qgc3R5bGUgPSBudW0gPT09IDAgPyBjaGFsay5ncmVlbiA6IGNoYWxrLnllbGxvd1xuICByZXR1cm4gYFJlbWFpbmluZyB0YXNrcyAke3N0eWxlLmJvbGQoU3RyaW5nKG51bSkpfWBcbn1cbiJdfQ==
