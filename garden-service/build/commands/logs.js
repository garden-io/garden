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
const base_1 = require("./base");
const chalk_1 = require("chalk");
const Bluebird = require("bluebird");
const ts_stream_1 = require("ts-stream");
const logger_1 = require("../logger/logger");
const dedent = require("dedent");
const logsArgs = {
    service: new base_1.StringsParameter({
        help: "The name of the service(s) to logs (skip to logs all services). " +
            "Use comma as separator to specify multiple services.",
    }),
};
const logsOpts = {
    tail: new base_1.BooleanParameter({ help: "Continuously stream new logs from the service(s).", alias: "t" }),
};
class LogsCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "logs";
        this.help = "Retrieves the most recent logs for the specified service(s).";
        this.description = dedent `
    Outputs logs for all or specified services, and optionally waits for news logs to come in.

    Examples:

        garden logs               # prints latest logs from all services
        garden logs my-service    # prints latest logs for my-service
        garden logs -t            # keeps running and streams all incoming logs to the console
  `;
        this.arguments = logsArgs;
        this.options = logsOpts;
        this.loggerType = logger_1.LoggerType.basic;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            const tail = opts.tail;
            const services = yield garden.getServices(args.service);
            const result = [];
            const stream = new ts_stream_1.default();
            // TODO: use basic logger (no need for fancy stuff here, just causes flickering)
            void stream.forEach((entry) => {
                // TODO: color each service differently for easier visual parsing
                let timestamp = "                        ";
                // bad timestamp values can cause crash if not caught
                if (entry.timestamp) {
                    try {
                        timestamp = entry.timestamp.toISOString();
                    }
                    catch (_a) { }
                }
                garden.log.info({
                    section: entry.serviceName,
                    msg: [timestamp, chalk_1.default.white(entry.msg)],
                });
                if (!tail) {
                    result.push(entry);
                }
            });
            // NOTE: This will work differently when we have Elasticsearch set up for logging, but is
            //       quite servicable for now.
            yield Bluebird.map(services, (service) => __awaiter(this, void 0, void 0, function* () {
                yield garden.actions.getServiceLogs({ service, stream, tail });
            }));
            return { result };
        });
    }
}
exports.LogsCommand = LogsCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2xvZ3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGlDQU1lO0FBQ2YsaUNBQXlCO0FBRXpCLHFDQUFxQztBQUVyQyx5Q0FBOEI7QUFDOUIsNkNBQTZDO0FBQzdDLGlDQUFpQztBQUVqQyxNQUFNLFFBQVEsR0FBRztJQUNmLE9BQU8sRUFBRSxJQUFJLHVCQUFnQixDQUFDO1FBQzVCLElBQUksRUFBRSxrRUFBa0U7WUFDdEUsc0RBQXNEO0tBQ3pELENBQUM7Q0FDSCxDQUFBO0FBRUQsTUFBTSxRQUFRLEdBQUc7SUFDZixJQUFJLEVBQUUsSUFBSSx1QkFBZ0IsQ0FBQyxFQUFFLElBQUksRUFBRSxtREFBbUQsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUM7Q0FHdEcsQ0FBQTtBQUtELE1BQWEsV0FBWSxTQUFRLGNBQW1CO0lBQXBEOztRQUNFLFNBQUksR0FBRyxNQUFNLENBQUE7UUFDYixTQUFJLEdBQUcsOERBQThELENBQUE7UUFFckUsZ0JBQVcsR0FBRyxNQUFNLENBQUE7Ozs7Ozs7O0dBUW5CLENBQUE7UUFFRCxjQUFTLEdBQUcsUUFBUSxDQUFBO1FBQ3BCLFlBQU8sR0FBRyxRQUFRLENBQUE7UUFDbEIsZUFBVSxHQUFHLG1CQUFVLENBQUMsS0FBSyxDQUFBO0lBdUMvQixDQUFDO0lBckNPLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUE2Qjs7WUFDNUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQTtZQUN0QixNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1lBRXZELE1BQU0sTUFBTSxHQUFzQixFQUFFLENBQUE7WUFDcEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxtQkFBTSxFQUFtQixDQUFBO1lBRTVDLGdGQUFnRjtZQUNoRixLQUFLLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtnQkFDNUIsaUVBQWlFO2dCQUNqRSxJQUFJLFNBQVMsR0FBRywwQkFBMEIsQ0FBQTtnQkFFMUMscURBQXFEO2dCQUNyRCxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUU7b0JBQ25CLElBQUk7d0JBQ0YsU0FBUyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUE7cUJBQzFDO29CQUFDLFdBQU0sR0FBRztpQkFDWjtnQkFFRCxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztvQkFDZCxPQUFPLEVBQUUsS0FBSyxDQUFDLFdBQVc7b0JBQzFCLEdBQUcsRUFBRSxDQUFDLFNBQVMsRUFBRSxlQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDekMsQ0FBQyxDQUFBO2dCQUVGLElBQUksQ0FBQyxJQUFJLEVBQUU7b0JBQ1QsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQTtpQkFDbkI7WUFDSCxDQUFDLENBQUMsQ0FBQTtZQUVGLHlGQUF5RjtZQUN6RixrQ0FBa0M7WUFDbEMsTUFBTSxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFPLE9BQXFCLEVBQUUsRUFBRTtnQkFDM0QsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQTtZQUNoRSxDQUFDLENBQUEsQ0FBQyxDQUFBO1lBRUYsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFBO1FBQ25CLENBQUM7S0FBQTtDQUNGO0FBdkRELGtDQXVEQyIsImZpbGUiOiJjb21tYW5kcy9sb2dzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7XG4gIEJvb2xlYW5QYXJhbWV0ZXIsXG4gIENvbW1hbmQsXG4gIENvbW1hbmRSZXN1bHQsXG4gIENvbW1hbmRQYXJhbXMsXG4gIFN0cmluZ3NQYXJhbWV0ZXIsXG59IGZyb20gXCIuL2Jhc2VcIlxuaW1wb3J0IGNoYWxrIGZyb20gXCJjaGFsa1wiXG5pbXBvcnQgeyBTZXJ2aWNlTG9nRW50cnkgfSBmcm9tIFwiLi4vdHlwZXMvcGx1Z2luL291dHB1dHNcIlxuaW1wb3J0IEJsdWViaXJkID0gcmVxdWlyZShcImJsdWViaXJkXCIpXG5pbXBvcnQgeyBTZXJ2aWNlIH0gZnJvbSBcIi4uL3R5cGVzL3NlcnZpY2VcIlxuaW1wb3J0IFN0cmVhbSBmcm9tIFwidHMtc3RyZWFtXCJcbmltcG9ydCB7IExvZ2dlclR5cGUgfSBmcm9tIFwiLi4vbG9nZ2VyL2xvZ2dlclwiXG5pbXBvcnQgZGVkZW50ID0gcmVxdWlyZShcImRlZGVudFwiKVxuXG5jb25zdCBsb2dzQXJncyA9IHtcbiAgc2VydmljZTogbmV3IFN0cmluZ3NQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIG5hbWUgb2YgdGhlIHNlcnZpY2UocykgdG8gbG9ncyAoc2tpcCB0byBsb2dzIGFsbCBzZXJ2aWNlcykuIFwiICtcbiAgICAgIFwiVXNlIGNvbW1hIGFzIHNlcGFyYXRvciB0byBzcGVjaWZ5IG11bHRpcGxlIHNlcnZpY2VzLlwiLFxuICB9KSxcbn1cblxuY29uc3QgbG9nc09wdHMgPSB7XG4gIHRhaWw6IG5ldyBCb29sZWFuUGFyYW1ldGVyKHsgaGVscDogXCJDb250aW51b3VzbHkgc3RyZWFtIG5ldyBsb2dzIGZyb20gdGhlIHNlcnZpY2UocykuXCIsIGFsaWFzOiBcInRcIiB9KSxcbiAgLy8gVE9ET1xuICAvLyBzaW5jZTogbmV3IE1vbWVudFBhcmFtZXRlcih7IGhlbHA6IFwiUmV0cmlldmUgbG9ncyBmcm9tIHRoZSBzcGVjaWZpZWQgcG9pbnQgb253YXJkc1wiIH0pLFxufVxuXG50eXBlIEFyZ3MgPSB0eXBlb2YgbG9nc0FyZ3NcbnR5cGUgT3B0cyA9IHR5cGVvZiBsb2dzT3B0c1xuXG5leHBvcnQgY2xhc3MgTG9nc0NvbW1hbmQgZXh0ZW5kcyBDb21tYW5kPEFyZ3MsIE9wdHM+IHtcbiAgbmFtZSA9IFwibG9nc1wiXG4gIGhlbHAgPSBcIlJldHJpZXZlcyB0aGUgbW9zdCByZWNlbnQgbG9ncyBmb3IgdGhlIHNwZWNpZmllZCBzZXJ2aWNlKHMpLlwiXG5cbiAgZGVzY3JpcHRpb24gPSBkZWRlbnRgXG4gICAgT3V0cHV0cyBsb2dzIGZvciBhbGwgb3Igc3BlY2lmaWVkIHNlcnZpY2VzLCBhbmQgb3B0aW9uYWxseSB3YWl0cyBmb3IgbmV3cyBsb2dzIHRvIGNvbWUgaW4uXG5cbiAgICBFeGFtcGxlczpcblxuICAgICAgICBnYXJkZW4gbG9ncyAgICAgICAgICAgICAgICMgcHJpbnRzIGxhdGVzdCBsb2dzIGZyb20gYWxsIHNlcnZpY2VzXG4gICAgICAgIGdhcmRlbiBsb2dzIG15LXNlcnZpY2UgICAgIyBwcmludHMgbGF0ZXN0IGxvZ3MgZm9yIG15LXNlcnZpY2VcbiAgICAgICAgZ2FyZGVuIGxvZ3MgLXQgICAgICAgICAgICAjIGtlZXBzIHJ1bm5pbmcgYW5kIHN0cmVhbXMgYWxsIGluY29taW5nIGxvZ3MgdG8gdGhlIGNvbnNvbGVcbiAgYFxuXG4gIGFyZ3VtZW50cyA9IGxvZ3NBcmdzXG4gIG9wdGlvbnMgPSBsb2dzT3B0c1xuICBsb2dnZXJUeXBlID0gTG9nZ2VyVHlwZS5iYXNpY1xuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncywgb3B0cyB9OiBDb21tYW5kUGFyYW1zPEFyZ3MsIE9wdHM+KTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PFNlcnZpY2VMb2dFbnRyeVtdPj4ge1xuICAgIGNvbnN0IHRhaWwgPSBvcHRzLnRhaWxcbiAgICBjb25zdCBzZXJ2aWNlcyA9IGF3YWl0IGdhcmRlbi5nZXRTZXJ2aWNlcyhhcmdzLnNlcnZpY2UpXG5cbiAgICBjb25zdCByZXN1bHQ6IFNlcnZpY2VMb2dFbnRyeVtdID0gW11cbiAgICBjb25zdCBzdHJlYW0gPSBuZXcgU3RyZWFtPFNlcnZpY2VMb2dFbnRyeT4oKVxuXG4gICAgLy8gVE9ETzogdXNlIGJhc2ljIGxvZ2dlciAobm8gbmVlZCBmb3IgZmFuY3kgc3R1ZmYgaGVyZSwganVzdCBjYXVzZXMgZmxpY2tlcmluZylcbiAgICB2b2lkIHN0cmVhbS5mb3JFYWNoKChlbnRyeSkgPT4ge1xuICAgICAgLy8gVE9ETzogY29sb3IgZWFjaCBzZXJ2aWNlIGRpZmZlcmVudGx5IGZvciBlYXNpZXIgdmlzdWFsIHBhcnNpbmdcbiAgICAgIGxldCB0aW1lc3RhbXAgPSBcIiAgICAgICAgICAgICAgICAgICAgICAgIFwiXG5cbiAgICAgIC8vIGJhZCB0aW1lc3RhbXAgdmFsdWVzIGNhbiBjYXVzZSBjcmFzaCBpZiBub3QgY2F1Z2h0XG4gICAgICBpZiAoZW50cnkudGltZXN0YW1wKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdGltZXN0YW1wID0gZW50cnkudGltZXN0YW1wLnRvSVNPU3RyaW5nKClcbiAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgIH1cblxuICAgICAgZ2FyZGVuLmxvZy5pbmZvKHtcbiAgICAgICAgc2VjdGlvbjogZW50cnkuc2VydmljZU5hbWUsXG4gICAgICAgIG1zZzogW3RpbWVzdGFtcCwgY2hhbGsud2hpdGUoZW50cnkubXNnKV0sXG4gICAgICB9KVxuXG4gICAgICBpZiAoIXRhaWwpIHtcbiAgICAgICAgcmVzdWx0LnB1c2goZW50cnkpXG4gICAgICB9XG4gICAgfSlcblxuICAgIC8vIE5PVEU6IFRoaXMgd2lsbCB3b3JrIGRpZmZlcmVudGx5IHdoZW4gd2UgaGF2ZSBFbGFzdGljc2VhcmNoIHNldCB1cCBmb3IgbG9nZ2luZywgYnV0IGlzXG4gICAgLy8gICAgICAgcXVpdGUgc2VydmljYWJsZSBmb3Igbm93LlxuICAgIGF3YWl0IEJsdWViaXJkLm1hcChzZXJ2aWNlcywgYXN5bmMgKHNlcnZpY2U6IFNlcnZpY2U8YW55PikgPT4ge1xuICAgICAgYXdhaXQgZ2FyZGVuLmFjdGlvbnMuZ2V0U2VydmljZUxvZ3MoeyBzZXJ2aWNlLCBzdHJlYW0sIHRhaWwgfSlcbiAgICB9KVxuXG4gICAgcmV0dXJuIHsgcmVzdWx0IH1cbiAgfVxufVxuIl19
