"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const uniqid = require("uniqid");
const lodash_1 = require("lodash");
const util_1 = require("./util");
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["error"] = 0] = "error";
    LogLevel[LogLevel["warn"] = 1] = "warn";
    LogLevel[LogLevel["info"] = 2] = "info";
    LogLevel[LogLevel["verbose"] = 3] = "verbose";
    LogLevel[LogLevel["debug"] = 4] = "debug";
    LogLevel[LogLevel["silly"] = 5] = "silly";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
class LogNode {
    constructor(level, parent, id) {
        this.level = level;
        this.parent = parent;
        this.id = id;
        if (this instanceof RootLogNode) {
            this.root = this;
        }
        else {
            // Non-root nodes have a parent
            this.root = parent.root;
        }
        this.key = uniqid();
        this.timestamp = Date.now();
        this.children = [];
    }
    appendNode(level, param) {
        const node = this.createNode(level, this, param);
        this.children.push(node);
        this.root.onGraphChange(node);
        return node;
    }
    silly(param) {
        return this.appendNode(LogLevel.silly, param);
    }
    debug(param) {
        return this.appendNode(LogLevel.debug, param);
    }
    verbose(param) {
        return this.appendNode(LogLevel.verbose, param);
    }
    info(param) {
        return this.appendNode(LogLevel.info, param);
    }
    warn(param) {
        return this.appendNode(LogLevel.warn, param);
    }
    error(param) {
        return this.appendNode(LogLevel.error, param);
    }
    /**
     * Returns the duration in seconds, defaults to 2 decimal precision
     */
    getDuration(precision = 2) {
        return lodash_1.round((Date.now() - this.timestamp) / 1000, precision);
    }
}
exports.LogNode = LogNode;
class RootLogNode extends LogNode {
    findById(id) {
        return util_1.findLogNode(this, node => node.id === id);
    }
}
exports.RootLogNode = RootLogNode;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFBO0lBQ2xELENBQUM7Q0FFRjtBQVBELGtDQU9DIiwiZmlsZSI6ImxvZ2dlci9sb2ctbm9kZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgKiBhcyB1bmlxaWQgZnJvbSBcInVuaXFpZFwiXG5pbXBvcnQgeyByb3VuZCB9IGZyb20gXCJsb2Rhc2hcIlxuXG5pbXBvcnQgeyBmaW5kTG9nTm9kZSB9IGZyb20gXCIuL3V0aWxcIlxuaW1wb3J0IHsgTG9nRW50cnksIENyZWF0ZVBhcmFtIH0gZnJvbSBcIi4vbG9nLWVudHJ5XCJcblxuZXhwb3J0IGVudW0gTG9nTGV2ZWwge1xuICBlcnJvciA9IDAsXG4gIHdhcm4gPSAxLFxuICBpbmZvID0gMixcbiAgdmVyYm9zZSA9IDMsXG4gIGRlYnVnID0gNCxcbiAgc2lsbHkgPSA1LFxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTG9nTm9kZTxUID0gTG9nRW50cnksIFUgPSBDcmVhdGVQYXJhbT4ge1xuICBwdWJsaWMgcmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXJcbiAgcHVibGljIHJlYWRvbmx5IGtleTogc3RyaW5nXG4gIHB1YmxpYyByZWFkb25seSBjaGlsZHJlbjogVFtdXG4gIHB1YmxpYyByZWFkb25seSByb290OiBSb290TG9nTm9kZTxUPlxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHB1YmxpYyByZWFkb25seSBsZXZlbDogTG9nTGV2ZWwsXG4gICAgcHVibGljIHJlYWRvbmx5IHBhcmVudD86IExvZ05vZGU8VD4sXG4gICAgcHVibGljIHJlYWRvbmx5IGlkPzogc3RyaW5nLFxuICApIHtcbiAgICBpZiAodGhpcyBpbnN0YW5jZW9mIFJvb3RMb2dOb2RlKSB7XG4gICAgICB0aGlzLnJvb3QgPSB0aGlzXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE5vbi1yb290IG5vZGVzIGhhdmUgYSBwYXJlbnRcbiAgICAgIHRoaXMucm9vdCA9IHBhcmVudCEucm9vdFxuICAgIH1cbiAgICB0aGlzLmtleSA9IHVuaXFpZCgpXG4gICAgdGhpcy50aW1lc3RhbXAgPSBEYXRlLm5vdygpXG4gICAgdGhpcy5jaGlsZHJlbiA9IFtdXG4gIH1cblxuICBhYnN0cmFjdCBjcmVhdGVOb2RlKGxldmVsOiBMb2dMZXZlbCwgcGFyZW50OiBMb2dOb2RlPFQsIFU+LCBwYXJhbT86IFUpOiBUXG5cbiAgcHJvdGVjdGVkIGFwcGVuZE5vZGUobGV2ZWw6IExvZ0xldmVsLCBwYXJhbT86IFUpOiBUIHtcbiAgICBjb25zdCBub2RlID0gdGhpcy5jcmVhdGVOb2RlKGxldmVsLCB0aGlzLCBwYXJhbSlcbiAgICB0aGlzLmNoaWxkcmVuLnB1c2gobm9kZSlcbiAgICB0aGlzLnJvb3Qub25HcmFwaENoYW5nZShub2RlKVxuICAgIHJldHVybiBub2RlXG4gIH1cblxuICBzaWxseShwYXJhbT86IFUpOiBUIHtcbiAgICByZXR1cm4gdGhpcy5hcHBlbmROb2RlKExvZ0xldmVsLnNpbGx5LCBwYXJhbSlcbiAgfVxuXG4gIGRlYnVnKHBhcmFtPzogVSk6IFQge1xuICAgIHJldHVybiB0aGlzLmFwcGVuZE5vZGUoTG9nTGV2ZWwuZGVidWcsIHBhcmFtKVxuICB9XG5cbiAgdmVyYm9zZShwYXJhbT86IFUpOiBUIHtcbiAgICByZXR1cm4gdGhpcy5hcHBlbmROb2RlKExvZ0xldmVsLnZlcmJvc2UsIHBhcmFtKVxuICB9XG5cbiAgaW5mbyhwYXJhbT86IFUpOiBUIHtcbiAgICByZXR1cm4gdGhpcy5hcHBlbmROb2RlKExvZ0xldmVsLmluZm8sIHBhcmFtKVxuICB9XG5cbiAgd2FybihwYXJhbT86IFUpOiBUIHtcbiAgICByZXR1cm4gdGhpcy5hcHBlbmROb2RlKExvZ0xldmVsLndhcm4sIHBhcmFtKVxuICB9XG5cbiAgZXJyb3IocGFyYW0/OiBVKTogVCB7XG4gICAgcmV0dXJuIHRoaXMuYXBwZW5kTm9kZShMb2dMZXZlbC5lcnJvciwgcGFyYW0pXG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgZHVyYXRpb24gaW4gc2Vjb25kcywgZGVmYXVsdHMgdG8gMiBkZWNpbWFsIHByZWNpc2lvblxuICAgKi9cbiAgZ2V0RHVyYXRpb24ocHJlY2lzaW9uOiBudW1iZXIgPSAyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gcm91bmQoKERhdGUubm93KCkgLSB0aGlzLnRpbWVzdGFtcCkgLyAxMDAwLCBwcmVjaXNpb24pXG4gIH1cblxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgUm9vdExvZ05vZGU8VCA9IExvZ0VudHJ5PiBleHRlbmRzIExvZ05vZGU8VD4ge1xuICBhYnN0cmFjdCBvbkdyYXBoQ2hhbmdlKG5vZGU6IFQpOiB2b2lkXG5cbiAgZmluZEJ5SWQoaWQ6IHN0cmluZyk6IFQgfCB2b2lkIHtcbiAgICByZXR1cm4gZmluZExvZ05vZGUodGhpcywgbm9kZSA9PiBub2RlLmlkID09PSBpZClcbiAgfVxuXG59XG4iXX0=
