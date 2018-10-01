"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const log_node_1 = require("./log-node");
const util_1 = require("./util");
// TODO Fix any cast
function resolveParam(param) {
    return typeof param === "string" ? { msg: param } : param || {};
}
exports.resolveParam = resolveParam;
class LogEntry extends log_node_1.LogNode {
    constructor({ level, opts, parent }) {
        const { id } = opts, otherOpts = __rest(opts, ["id"]);
        super(level, parent, id);
        this.opts = otherOpts;
        if (this.level === log_node_1.LogLevel.error) {
            this.opts.status = "error";
        }
    }
    setOwnState(nextOpts) {
        let msg;
        const { append, msg: nextMsg } = nextOpts;
        const prevMsg = this.opts.msg;
        if (prevMsg !== undefined && nextMsg && append) {
            msg = lodash_1.flatten([...[prevMsg], ...[nextMsg]]);
        }
        else if (nextMsg) {
            msg = nextMsg;
        }
        else {
            msg = prevMsg;
        }
        // Hack to preserve section alignment if symbols or spinners disappear
        const hadSymbolOrSpinner = this.opts.symbol || this.opts.status === "active";
        const hasSymbolOrSpinner = nextOpts.symbol || nextOpts.status === "active";
        if (this.opts.section && hadSymbolOrSpinner && !hasSymbolOrSpinner) {
            nextOpts.symbol = "empty";
        }
        this.opts = Object.assign({}, this.opts, nextOpts, { msg });
    }
    //  Update node and child nodes
    deepSetState(opts) {
        const wasActive = this.opts.status === "active";
        this.setOwnState(opts);
        // Stop active child nodes if parent is no longer active
        if (wasActive && this.opts.status !== "active") {
            util_1.getChildEntries(this).forEach(entry => {
                if (entry.opts.status === "active") {
                    entry.setOwnState({ status: "done" });
                }
            });
        }
    }
    createNode(level, parent, param) {
        // Empty entries inherit their parent's indentation level
        let { indentationLevel } = this.opts;
        if (param) {
            indentationLevel = (indentationLevel || 0) + 1;
        }
        const opts = Object.assign({ indentationLevel }, resolveParam(param));
        return new LogEntry({ level, opts, parent });
    }
    // Preserves status
    setState(param) {
        this.deepSetState(Object.assign({}, resolveParam(param), { status: this.opts.status }));
        this.root.onGraphChange(this);
        return this;
    }
    setDone(param) {
        this.deepSetState(Object.assign({}, resolveParam(param), { status: "done" }));
        this.root.onGraphChange(this);
        return this;
    }
    setSuccess(param) {
        this.deepSetState(Object.assign({}, resolveParam(param), { symbol: "success", status: "success" }));
        this.root.onGraphChange(this);
        return this;
    }
    setError(param) {
        this.deepSetState(Object.assign({}, resolveParam(param), { symbol: "error", status: "error" }));
        this.root.onGraphChange(this);
        return this;
    }
    setWarn(param) {
        this.deepSetState(Object.assign({}, resolveParam(param), { symbol: "warning", status: "warn" }));
        this.root.onGraphChange(this);
        return this;
    }
    fromStdStream() {
        return !!this.opts.fromStdStream;
    }
    stop() {
        // Stop gracefully if still in active state
        if (this.opts.status === "active") {
            this.setOwnState({ symbol: "empty", status: "done" });
            this.root.onGraphChange(this);
        }
        return this;
    }
    inspect() {
        console.log(JSON.stringify(Object.assign({}, this.opts, { level: this.level, children: this.children })));
    }
    filterBySection(section) {
        return util_1.getChildEntries(this).filter(entry => entry.opts.section === section);
    }
}
exports.LogEntry = LogEntry;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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LENBQUE7SUFDTCxDQUFDO0lBRUQsZUFBZSxDQUFDLE9BQWU7UUFDN0IsT0FBTyxzQkFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxLQUFLLE9BQU8sQ0FBQyxDQUFBO0lBQzlFLENBQUM7Q0FFRjtBQXZIRCw0QkF1SEMiLCJmaWxlIjoibG9nZ2VyL2xvZy1lbnRyeS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBsb2dTeW1ib2xzIGZyb20gXCJsb2ctc3ltYm9sc1wiXG5pbXBvcnQgKiBhcyBub2RlRW1vamkgZnJvbSBcIm5vZGUtZW1vamlcIlxuaW1wb3J0IHsgZmxhdHRlbiB9IGZyb20gXCJsb2Rhc2hcIlxuXG5pbXBvcnQgeyBMb2dOb2RlLCBMb2dMZXZlbCB9IGZyb20gXCIuL2xvZy1ub2RlXCJcbmltcG9ydCB7IGdldENoaWxkRW50cmllcyB9IGZyb20gXCIuL3V0aWxcIlxuaW1wb3J0IHsgR2FyZGVuRXJyb3IgfSBmcm9tIFwiLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQgeyBPbWl0IH0gZnJvbSBcIi4uL3V0aWwvdXRpbFwiXG5cbmV4cG9ydCB0eXBlIEVtb2ppTmFtZSA9IGtleW9mIHR5cGVvZiBub2RlRW1vamkuZW1vamlcbmV4cG9ydCB0eXBlIExvZ1N5bWJvbCA9IGtleW9mIHR5cGVvZiBsb2dTeW1ib2xzIHwgXCJlbXB0eVwiXG5leHBvcnQgdHlwZSBFbnRyeVN0YXR1cyA9IFwiYWN0aXZlXCIgfCBcImRvbmVcIiB8IFwiZXJyb3JcIiB8IFwic3VjY2Vzc1wiIHwgXCJ3YXJuXCJcblxuZXhwb3J0IGludGVyZmFjZSBVcGRhdGVPcHRzIHtcbiAgbXNnPzogc3RyaW5nIHwgc3RyaW5nW11cbiAgc2VjdGlvbj86IHN0cmluZ1xuICBlbW9qaT86IEVtb2ppTmFtZVxuICBzeW1ib2w/OiBMb2dTeW1ib2xcbiAgYXBwZW5kPzogYm9vbGVhblxuICBmcm9tU3RkU3RyZWFtPzogYm9vbGVhblxuICBzaG93RHVyYXRpb24/OiBib29sZWFuXG4gIGVycm9yPzogR2FyZGVuRXJyb3JcbiAgc3RhdHVzPzogRW50cnlTdGF0dXNcbiAgaW5kZW50YXRpb25MZXZlbD86IG51bWJlclxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENyZWF0ZU9wdHMgZXh0ZW5kcyBVcGRhdGVPcHRzIHtcbiAgaWQ/OiBzdHJpbmdcbn1cblxuZXhwb3J0IHR5cGUgQ3JlYXRlUGFyYW0gPSBzdHJpbmcgfCBDcmVhdGVPcHRzXG5cbmV4cG9ydCBpbnRlcmZhY2UgTG9nRW50cnlDb25zdHJ1Y3RvciB7XG4gIGxldmVsOiBMb2dMZXZlbFxuICBvcHRzOiBDcmVhdGVPcHRzXG4gIHBhcmVudDogTG9nTm9kZVxufVxuXG4vLyBUT0RPIEZpeCBhbnkgY2FzdFxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQYXJhbTxUIGV4dGVuZHMgVXBkYXRlT3B0cz4ocGFyYW0/OiBzdHJpbmcgfCBUKTogVCB7XG4gIHJldHVybiB0eXBlb2YgcGFyYW0gPT09IFwic3RyaW5nXCIgPyA8YW55PnsgbXNnOiBwYXJhbSB9IDogcGFyYW0gfHwge31cbn1cblxuZXhwb3J0IGNsYXNzIExvZ0VudHJ5IGV4dGVuZHMgTG9nTm9kZSB7XG4gIHB1YmxpYyBvcHRzOiBVcGRhdGVPcHRzXG5cbiAgY29uc3RydWN0b3IoeyBsZXZlbCwgb3B0cywgcGFyZW50IH06IExvZ0VudHJ5Q29uc3RydWN0b3IpIHtcbiAgICBjb25zdCB7IGlkLCAuLi5vdGhlck9wdHMgfSA9IG9wdHNcbiAgICBzdXBlcihsZXZlbCwgcGFyZW50LCBpZClcbiAgICB0aGlzLm9wdHMgPSBvdGhlck9wdHNcbiAgICBpZiAodGhpcy5sZXZlbCA9PT0gTG9nTGV2ZWwuZXJyb3IpIHtcbiAgICAgIHRoaXMub3B0cy5zdGF0dXMgPSBcImVycm9yXCJcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNldE93blN0YXRlKG5leHRPcHRzOiBVcGRhdGVPcHRzKTogdm9pZCB7XG4gICAgbGV0IG1zZzogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWRcbiAgICBjb25zdCB7IGFwcGVuZCwgbXNnOiBuZXh0TXNnIH0gPSBuZXh0T3B0c1xuICAgIGNvbnN0IHByZXZNc2cgPSB0aGlzLm9wdHMubXNnXG4gICAgaWYgKHByZXZNc2cgIT09IHVuZGVmaW5lZCAmJiBuZXh0TXNnICYmIGFwcGVuZCkge1xuICAgICAgbXNnID0gZmxhdHRlbihbLi4uW3ByZXZNc2ddLCAuLi5bbmV4dE1zZ11dKVxuICAgIH0gZWxzZSBpZiAobmV4dE1zZykge1xuICAgICAgbXNnID0gbmV4dE1zZ1xuICAgIH0gZWxzZSB7XG4gICAgICBtc2cgPSBwcmV2TXNnXG4gICAgfVxuXG4gICAgLy8gSGFjayB0byBwcmVzZXJ2ZSBzZWN0aW9uIGFsaWdubWVudCBpZiBzeW1ib2xzIG9yIHNwaW5uZXJzIGRpc2FwcGVhclxuICAgIGNvbnN0IGhhZFN5bWJvbE9yU3Bpbm5lciA9IHRoaXMub3B0cy5zeW1ib2wgfHwgdGhpcy5vcHRzLnN0YXR1cyA9PT0gXCJhY3RpdmVcIlxuICAgIGNvbnN0IGhhc1N5bWJvbE9yU3Bpbm5lciA9IG5leHRPcHRzLnN5bWJvbCB8fCBuZXh0T3B0cy5zdGF0dXMgPT09IFwiYWN0aXZlXCJcbiAgICBpZiAodGhpcy5vcHRzLnNlY3Rpb24gJiYgaGFkU3ltYm9sT3JTcGlubmVyICYmICFoYXNTeW1ib2xPclNwaW5uZXIpIHtcbiAgICAgIG5leHRPcHRzLnN5bWJvbCA9IFwiZW1wdHlcIlxuICAgIH1cblxuICAgIHRoaXMub3B0cyA9IHsgLi4udGhpcy5vcHRzLCAuLi5uZXh0T3B0cywgbXNnIH1cbiAgfVxuXG4gIC8vICBVcGRhdGUgbm9kZSBhbmQgY2hpbGQgbm9kZXNcbiAgcHJpdmF0ZSBkZWVwU2V0U3RhdGUob3B0czogVXBkYXRlT3B0cyk6IHZvaWQge1xuICAgIGNvbnN0IHdhc0FjdGl2ZSA9IHRoaXMub3B0cy5zdGF0dXMgPT09IFwiYWN0aXZlXCJcblxuICAgIHRoaXMuc2V0T3duU3RhdGUob3B0cylcblxuICAgIC8vIFN0b3AgYWN0aXZlIGNoaWxkIG5vZGVzIGlmIHBhcmVudCBpcyBubyBsb25nZXIgYWN0aXZlXG4gICAgaWYgKHdhc0FjdGl2ZSAmJiB0aGlzLm9wdHMuc3RhdHVzICE9PSBcImFjdGl2ZVwiKSB7XG4gICAgICBnZXRDaGlsZEVudHJpZXModGhpcykuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICAgIGlmIChlbnRyeS5vcHRzLnN0YXR1cyA9PT0gXCJhY3RpdmVcIikge1xuICAgICAgICAgIGVudHJ5LnNldE93blN0YXRlKHsgc3RhdHVzOiBcImRvbmVcIiB9KVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGNyZWF0ZU5vZGUobGV2ZWw6IExvZ0xldmVsLCBwYXJlbnQ6IExvZ05vZGUsIHBhcmFtPzogQ3JlYXRlUGFyYW0pIHtcbiAgICAvLyBFbXB0eSBlbnRyaWVzIGluaGVyaXQgdGhlaXIgcGFyZW50J3MgaW5kZW50YXRpb24gbGV2ZWxcbiAgICBsZXQgeyBpbmRlbnRhdGlvbkxldmVsIH0gPSB0aGlzLm9wdHNcbiAgICBpZiAocGFyYW0pIHtcbiAgICAgIGluZGVudGF0aW9uTGV2ZWwgPSAoaW5kZW50YXRpb25MZXZlbCB8fCAwKSArIDFcbiAgICB9XG4gICAgY29uc3Qgb3B0cyA9IHtcbiAgICAgIGluZGVudGF0aW9uTGV2ZWwsXG4gICAgICAuLi5yZXNvbHZlUGFyYW0ocGFyYW0pLFxuICAgIH1cbiAgICByZXR1cm4gbmV3IExvZ0VudHJ5KHsgbGV2ZWwsIG9wdHMsIHBhcmVudCB9KVxuICB9XG5cbiAgLy8gUHJlc2VydmVzIHN0YXR1c1xuICBzZXRTdGF0ZShwYXJhbT86IHN0cmluZyB8IFVwZGF0ZU9wdHMpOiBMb2dFbnRyeSB7XG4gICAgdGhpcy5kZWVwU2V0U3RhdGUoeyAuLi5yZXNvbHZlUGFyYW0ocGFyYW0pLCBzdGF0dXM6IHRoaXMub3B0cy5zdGF0dXMgfSlcbiAgICB0aGlzLnJvb3Qub25HcmFwaENoYW5nZSh0aGlzKVxuICAgIHJldHVybiB0aGlzXG4gIH1cblxuICBzZXREb25lKHBhcmFtPzogc3RyaW5nIHwgT21pdDxVcGRhdGVPcHRzLCBcInN0YXR1c1wiPik6IExvZ0VudHJ5IHtcbiAgICB0aGlzLmRlZXBTZXRTdGF0ZSh7IC4uLnJlc29sdmVQYXJhbShwYXJhbSksIHN0YXR1czogXCJkb25lXCIgfSlcbiAgICB0aGlzLnJvb3Qub25HcmFwaENoYW5nZSh0aGlzKVxuICAgIHJldHVybiB0aGlzXG4gIH1cblxuICBzZXRTdWNjZXNzKHBhcmFtPzogc3RyaW5nIHwgT21pdDxVcGRhdGVPcHRzLCBcInN0YXR1c1wiICYgXCJzeW1ib2xcIj4pOiBMb2dFbnRyeSB7XG4gICAgdGhpcy5kZWVwU2V0U3RhdGUoeyAuLi5yZXNvbHZlUGFyYW0ocGFyYW0pLCBzeW1ib2w6IFwic3VjY2Vzc1wiLCBzdGF0dXM6IFwic3VjY2Vzc1wiIH0pXG4gICAgdGhpcy5yb290Lm9uR3JhcGhDaGFuZ2UodGhpcylcbiAgICByZXR1cm4gdGhpc1xuICB9XG5cbiAgc2V0RXJyb3IocGFyYW0/OiBzdHJpbmcgfCBPbWl0PFVwZGF0ZU9wdHMsIFwic3RhdHVzXCIgJiBcInN5bWJvbFwiPik6IExvZ0VudHJ5IHtcbiAgICB0aGlzLmRlZXBTZXRTdGF0ZSh7IC4uLnJlc29sdmVQYXJhbShwYXJhbSksIHN5bWJvbDogXCJlcnJvclwiLCBzdGF0dXM6IFwiZXJyb3JcIiB9KVxuICAgIHRoaXMucm9vdC5vbkdyYXBoQ2hhbmdlKHRoaXMpXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4gIHNldFdhcm4ocGFyYW0/OiBzdHJpbmcgfCBPbWl0PFVwZGF0ZU9wdHMsIFwic3RhdHVzXCIgJiBcInN5bWJvbFwiPik6IExvZ0VudHJ5IHtcbiAgICB0aGlzLmRlZXBTZXRTdGF0ZSh7IC4uLnJlc29sdmVQYXJhbShwYXJhbSksIHN5bWJvbDogXCJ3YXJuaW5nXCIsIHN0YXR1czogXCJ3YXJuXCIgfSlcbiAgICB0aGlzLnJvb3Qub25HcmFwaENoYW5nZSh0aGlzKVxuICAgIHJldHVybiB0aGlzXG4gIH1cblxuICBmcm9tU3RkU3RyZWFtKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAhIXRoaXMub3B0cy5mcm9tU3RkU3RyZWFtXG4gIH1cblxuICBzdG9wKCkge1xuICAgIC8vIFN0b3AgZ3JhY2VmdWxseSBpZiBzdGlsbCBpbiBhY3RpdmUgc3RhdGVcbiAgICBpZiAodGhpcy5vcHRzLnN0YXR1cyA9PT0gXCJhY3RpdmVcIikge1xuICAgICAgdGhpcy5zZXRPd25TdGF0ZSh7IHN5bWJvbDogXCJlbXB0eVwiLCBzdGF0dXM6IFwiZG9uZVwiIH0pXG4gICAgICB0aGlzLnJvb3Qub25HcmFwaENoYW5nZSh0aGlzKVxuICAgIH1cbiAgICByZXR1cm4gdGhpc1xuICB9XG5cbiAgaW5zcGVjdCgpIHtcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeSh7XG4gICAgICAuLi50aGlzLm9wdHMsXG4gICAgICBsZXZlbDogdGhpcy5sZXZlbCxcbiAgICAgIGNoaWxkcmVuOiB0aGlzLmNoaWxkcmVuLFxuICAgIH0pKVxuICB9XG5cbiAgZmlsdGVyQnlTZWN0aW9uKHNlY3Rpb246IHN0cmluZyk6IExvZ0VudHJ5W10ge1xuICAgIHJldHVybiBnZXRDaGlsZEVudHJpZXModGhpcykuZmlsdGVyKGVudHJ5ID0+IGVudHJ5Lm9wdHMuc2VjdGlvbiA9PT0gc2VjdGlvbilcbiAgfVxuXG59XG4iXX0=
