import { LogEntry } from "./log-entry";
export declare type ToRender = string | ((...args: any[]) => string);
export declare type Renderer = [ToRender, any[]] | ToRender[];
export declare type Renderers = Renderer[];
export declare const msgStyle: (s: string) => string;
export declare const errorStyle: import("chalk").Chalk & {
    supportsColor: import("chalk").ColorSupport;
};
export declare function combine(renderers: Renderers): string;
/*** RENDERERS ***/
export declare function leftPad(entry: LogEntry): string;
export declare function renderEmoji(entry: LogEntry): string;
export declare function renderError(entry: LogEntry): string | string[];
export declare function renderSymbol(entry: LogEntry): string;
export declare function renderMsg(entry: LogEntry): string;
export declare function renderSection(entry: LogEntry): string;
export declare function renderDuration(entry: LogEntry): string;
export declare function formatForTerminal(entry: LogEntry): string;
//# sourceMappingURL=renderers.d.ts.map