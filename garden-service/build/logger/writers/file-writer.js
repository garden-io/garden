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
const winston = require("winston");
const path_1 = require("path");
const stripAnsi = require("strip-ansi");
const fs_extra_1 = require("fs-extra");
const log_node_1 = require("../log-node");
const base_1 = require("./base");
const util_1 = require("../util");
const renderers_1 = require("../renderers");
const constants_1 = require("../../constants");
const { combine: winstonCombine, timestamp, printf } = winston.format;
const DEFAULT_FILE_TRANSPORT_OPTIONS = {
    format: winstonCombine(timestamp(), printf(info => `\n[${info.timestamp}] ${info.message}`)),
    maxsize: 10000000,
    maxFiles: 1,
};
const levelToStr = (lvl) => log_node_1.LogLevel[lvl];
class FileWriter extends base_1.Writer {
    constructor(filePath, config) {
        const { fileTransportOptions = DEFAULT_FILE_TRANSPORT_OPTIONS, level, } = config;
        super({ level });
        this.fileTransportOptions = fileTransportOptions;
        this.filePath = filePath;
        this.fileLogger = null;
    }
    static factory(config) {
        return __awaiter(this, void 0, void 0, function* () {
            const { filename, root, truncatePrevious, path = constants_1.LOGS_DIR, } = config;
            const fullPath = path_1.join(root, path);
            yield fs_extra_1.ensureDir(fullPath);
            const filePath = path_1.join(fullPath, filename);
            if (truncatePrevious) {
                try {
                    yield fs_extra_1.truncate(filePath);
                }
                catch (_) {
                }
            }
            return new FileWriter(filePath, config);
        });
    }
    // Only init if needed to prevent unnecessary file writes
    initFileLogger() {
        return winston.createLogger({
            level: levelToStr(this.level),
            transports: [
                new winston.transports.File(Object.assign({}, this.fileTransportOptions, { filename: this.filePath })),
            ],
        });
    }
    render(entry) {
        if (util_1.validate(this.level, entry)) {
            const renderFn = entry.level === log_node_1.LogLevel.error ? renderers_1.renderError : renderers_1.renderMsg;
            return stripAnsi(renderFn(entry));
        }
        return null;
    }
    onGraphChange(entry) {
        const out = this.render(entry);
        if (out) {
            if (!this.fileLogger) {
                this.fileLogger = this.initFileLogger();
            }
            this.fileLogger.log(levelToStr(entry.level), out);
        }
    }
    stop() { }
}
exports.FileWriter = FileWriter;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxvZ2dlci93cml0ZXJzL2ZpbGUtd3JpdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxtQ0FBa0M7QUFDbEMsK0JBQTJCO0FBQzNCLHdDQUF1QztBQUN2Qyx1Q0FBOEM7QUFFOUMsMENBQXNDO0FBRXRDLGlDQUErQjtBQUMvQixrQ0FBa0M7QUFDbEMsNENBR3FCO0FBQ3JCLCtDQUEwQztBQWExQyxNQUFNLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQTtBQUVyRSxNQUFNLDhCQUE4QixHQUF5QjtJQUMzRCxNQUFNLEVBQUUsY0FBYyxDQUNwQixTQUFTLEVBQUUsRUFDWCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLElBQUksQ0FBQyxTQUFTLEtBQUssSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQ3hEO0lBQ0QsT0FBTyxFQUFFLFFBQVE7SUFDakIsUUFBUSxFQUFFLENBQUM7Q0FDWixDQUFBO0FBRUQsTUFBTSxVQUFVLEdBQUcsQ0FBQyxHQUFhLEVBQVUsRUFBRSxDQUFDLG1CQUFRLENBQUMsR0FBRyxDQUFDLENBQUE7QUFFM0QsTUFBYSxVQUFXLFNBQVEsYUFBTTtJQU9wQyxZQUFZLFFBQWdCLEVBQUUsTUFBd0I7UUFDcEQsTUFBTSxFQUNKLG9CQUFvQixHQUFHLDhCQUE4QixFQUNyRCxLQUFLLEdBQ04sR0FBRyxNQUFNLENBQUE7UUFFVixLQUFLLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFBO1FBRWhCLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQTtRQUNoRCxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQTtRQUN4QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQTtJQUN4QixDQUFDO0lBRUQsTUFBTSxDQUFPLE9BQU8sQ0FBQyxNQUF3Qjs7WUFDM0MsTUFBTSxFQUNKLFFBQVEsRUFDUixJQUFJLEVBQ0osZ0JBQWdCLEVBQ2hCLElBQUksR0FBRyxvQkFBUSxHQUNoQixHQUFHLE1BQU0sQ0FBQTtZQUNWLE1BQU0sUUFBUSxHQUFHLFdBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUE7WUFDakMsTUFBTSxvQkFBUyxDQUFDLFFBQVEsQ0FBQyxDQUFBO1lBQ3pCLE1BQU0sUUFBUSxHQUFHLFdBQUksQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUE7WUFDekMsSUFBSSxnQkFBZ0IsRUFBRTtnQkFDcEIsSUFBSTtvQkFDRixNQUFNLG1CQUFRLENBQUMsUUFBUSxDQUFDLENBQUE7aUJBQ3pCO2dCQUFDLE9BQU8sQ0FBQyxFQUFFO2lCQUNYO2FBQ0Y7WUFDRCxPQUFPLElBQUksVUFBVSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQTtRQUN6QyxDQUFDO0tBQUE7SUFFRCx5REFBeUQ7SUFDekQsY0FBYztRQUNaLE9BQU8sT0FBTyxDQUFDLFlBQVksQ0FBQztZQUMxQixLQUFLLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDN0IsVUFBVSxFQUFFO2dCQUNWLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLG1CQUN0QixJQUFJLENBQUMsb0JBQW9CLElBQzVCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxJQUN2QjthQUNIO1NBQ0YsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUVELE1BQU0sQ0FBQyxLQUFlO1FBQ3BCLElBQUksZUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUU7WUFDL0IsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEtBQUssS0FBSyxtQkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsdUJBQVcsQ0FBQyxDQUFDLENBQUMscUJBQVMsQ0FBQTtZQUN6RSxPQUFPLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQTtTQUNsQztRQUNELE9BQU8sSUFBSSxDQUFBO0lBQ2IsQ0FBQztJQUVELGFBQWEsQ0FBQyxLQUFlO1FBQzNCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDOUIsSUFBSSxHQUFHLEVBQUU7WUFDUCxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRTtnQkFFcEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUE7YUFDeEM7WUFDRCxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFBO1NBQ2xEO0lBQ0gsQ0FBQztJQUVELElBQUksS0FBSyxDQUFDO0NBQ1g7QUF4RUQsZ0NBd0VDIiwiZmlsZSI6ImxvZ2dlci93cml0ZXJzL2ZpbGUtd3JpdGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCAqIGFzIHdpbnN0b24gZnJvbSBcIndpbnN0b25cIlxuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCAqIGFzIHN0cmlwQW5zaSBmcm9tIFwic3RyaXAtYW5zaVwiXG5pbXBvcnQgeyBlbnN1cmVEaXIsIHRydW5jYXRlIH0gZnJvbSBcImZzLWV4dHJhXCJcblxuaW1wb3J0IHsgTG9nTGV2ZWwgfSBmcm9tIFwiLi4vbG9nLW5vZGVcIlxuaW1wb3J0IHsgTG9nRW50cnkgfSBmcm9tIFwiLi4vbG9nLWVudHJ5XCJcbmltcG9ydCB7IFdyaXRlciB9IGZyb20gXCIuL2Jhc2VcIlxuaW1wb3J0IHsgdmFsaWRhdGUgfSBmcm9tIFwiLi4vdXRpbFwiXG5pbXBvcnQge1xuICByZW5kZXJFcnJvcixcbiAgcmVuZGVyTXNnLFxufSBmcm9tIFwiLi4vcmVuZGVyZXJzXCJcbmltcG9ydCB7IExPR1NfRElSIH0gZnJvbSBcIi4uLy4uL2NvbnN0YW50c1wiXG5cbmV4cG9ydCBpbnRlcmZhY2UgRmlsZVdyaXRlckNvbmZpZyB7XG4gIGxldmVsOiBMb2dMZXZlbFxuICByb290OiBzdHJpbmdcbiAgZmlsZW5hbWU6IHN0cmluZ1xuICBwYXRoPzogc3RyaW5nXG4gIGZpbGVUcmFuc3BvcnRPcHRpb25zPzoge31cbiAgdHJ1bmNhdGVQcmV2aW91cz86IGJvb2xlYW5cbn1cblxudHlwZSBGaWxlVHJhbnNwb3J0T3B0aW9ucyA9IHdpbnN0b24udHJhbnNwb3J0cy5GaWxlVHJhbnNwb3J0T3B0aW9uc1xuXG5jb25zdCB7IGNvbWJpbmU6IHdpbnN0b25Db21iaW5lLCB0aW1lc3RhbXAsIHByaW50ZiB9ID0gd2luc3Rvbi5mb3JtYXRcblxuY29uc3QgREVGQVVMVF9GSUxFX1RSQU5TUE9SVF9PUFRJT05TOiBGaWxlVHJhbnNwb3J0T3B0aW9ucyA9IHtcbiAgZm9ybWF0OiB3aW5zdG9uQ29tYmluZShcbiAgICB0aW1lc3RhbXAoKSxcbiAgICBwcmludGYoaW5mbyA9PiBgXFxuWyR7aW5mby50aW1lc3RhbXB9XSAke2luZm8ubWVzc2FnZX1gKSxcbiAgKSxcbiAgbWF4c2l6ZTogMTAwMDAwMDAsIC8vIDEwIE1CXG4gIG1heEZpbGVzOiAxLFxufVxuXG5jb25zdCBsZXZlbFRvU3RyID0gKGx2bDogTG9nTGV2ZWwpOiBzdHJpbmcgPT4gTG9nTGV2ZWxbbHZsXVxuXG5leHBvcnQgY2xhc3MgRmlsZVdyaXRlciBleHRlbmRzIFdyaXRlciB7XG4gIHByaXZhdGUgZmlsZUxvZ2dlcjogd2luc3Rvbi5Mb2dnZXIgfCBudWxsXG4gIHByaXZhdGUgZmlsZVBhdGg6IHN0cmluZ1xuICBwcml2YXRlIGZpbGVUcmFuc3BvcnRPcHRpb25zOiBGaWxlVHJhbnNwb3J0T3B0aW9uc1xuXG4gIHB1YmxpYyBsZXZlbDogTG9nTGV2ZWxcblxuICBjb25zdHJ1Y3RvcihmaWxlUGF0aDogc3RyaW5nLCBjb25maWc6IEZpbGVXcml0ZXJDb25maWcpIHtcbiAgICBjb25zdCB7XG4gICAgICBmaWxlVHJhbnNwb3J0T3B0aW9ucyA9IERFRkFVTFRfRklMRV9UUkFOU1BPUlRfT1BUSU9OUyxcbiAgICAgIGxldmVsLFxuICAgIH0gPSBjb25maWdcblxuICAgIHN1cGVyKHsgbGV2ZWwgfSlcblxuICAgIHRoaXMuZmlsZVRyYW5zcG9ydE9wdGlvbnMgPSBmaWxlVHJhbnNwb3J0T3B0aW9uc1xuICAgIHRoaXMuZmlsZVBhdGggPSBmaWxlUGF0aFxuICAgIHRoaXMuZmlsZUxvZ2dlciA9IG51bGxcbiAgfVxuXG4gIHN0YXRpYyBhc3luYyBmYWN0b3J5KGNvbmZpZzogRmlsZVdyaXRlckNvbmZpZykge1xuICAgIGNvbnN0IHtcbiAgICAgIGZpbGVuYW1lLFxuICAgICAgcm9vdCxcbiAgICAgIHRydW5jYXRlUHJldmlvdXMsXG4gICAgICBwYXRoID0gTE9HU19ESVIsXG4gICAgfSA9IGNvbmZpZ1xuICAgIGNvbnN0IGZ1bGxQYXRoID0gam9pbihyb290LCBwYXRoKVxuICAgIGF3YWl0IGVuc3VyZURpcihmdWxsUGF0aClcbiAgICBjb25zdCBmaWxlUGF0aCA9IGpvaW4oZnVsbFBhdGgsIGZpbGVuYW1lKVxuICAgIGlmICh0cnVuY2F0ZVByZXZpb3VzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0cnVuY2F0ZShmaWxlUGF0aClcbiAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5ldyBGaWxlV3JpdGVyKGZpbGVQYXRoLCBjb25maWcpXG4gIH1cblxuICAvLyBPbmx5IGluaXQgaWYgbmVlZGVkIHRvIHByZXZlbnQgdW5uZWNlc3NhcnkgZmlsZSB3cml0ZXNcbiAgaW5pdEZpbGVMb2dnZXIoKSB7XG4gICAgcmV0dXJuIHdpbnN0b24uY3JlYXRlTG9nZ2VyKHtcbiAgICAgIGxldmVsOiBsZXZlbFRvU3RyKHRoaXMubGV2ZWwpLFxuICAgICAgdHJhbnNwb3J0czogW1xuICAgICAgICBuZXcgd2luc3Rvbi50cmFuc3BvcnRzLkZpbGUoe1xuICAgICAgICAgIC4uLnRoaXMuZmlsZVRyYW5zcG9ydE9wdGlvbnMsXG4gICAgICAgICAgZmlsZW5hbWU6IHRoaXMuZmlsZVBhdGgsXG4gICAgICAgIH0pLFxuICAgICAgXSxcbiAgICB9KVxuICB9XG5cbiAgcmVuZGVyKGVudHJ5OiBMb2dFbnRyeSk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmICh2YWxpZGF0ZSh0aGlzLmxldmVsLCBlbnRyeSkpIHtcbiAgICAgIGNvbnN0IHJlbmRlckZuID0gZW50cnkubGV2ZWwgPT09IExvZ0xldmVsLmVycm9yID8gcmVuZGVyRXJyb3IgOiByZW5kZXJNc2dcbiAgICAgIHJldHVybiBzdHJpcEFuc2kocmVuZGVyRm4oZW50cnkpKVxuICAgIH1cbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgb25HcmFwaENoYW5nZShlbnRyeTogTG9nRW50cnkpIHtcbiAgICBjb25zdCBvdXQgPSB0aGlzLnJlbmRlcihlbnRyeSlcbiAgICBpZiAob3V0KSB7XG4gICAgICBpZiAoIXRoaXMuZmlsZUxvZ2dlcikge1xuXG4gICAgICAgIHRoaXMuZmlsZUxvZ2dlciA9IHRoaXMuaW5pdEZpbGVMb2dnZXIoKVxuICAgICAgfVxuICAgICAgdGhpcy5maWxlTG9nZ2VyLmxvZyhsZXZlbFRvU3RyKGVudHJ5LmxldmVsKSwgb3V0KVxuICAgIH1cbiAgfVxuXG4gIHN0b3AoKSB7IH1cbn1cbiJdfQ==
