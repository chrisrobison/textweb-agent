export type SummaryMode = 'brief' | 'standard' | 'deep';
export interface TextWebClientOptions {
    endpoint: string;
    apiKey?: string;
    paymentSignature?: string;
    timeoutMs?: number;
    nevermined?: {
        nvmApiKey: string;
        planId: string;
        agentId?: string;
        environment?: string;
    };
    retry?: {
        retries?: number;
        baseDelayMs?: number;
        maxDelayMs?: number;
    };
}
export interface FollowLinksOptions {
    enabled: boolean;
    max: number;
}
export interface SummarizeInput {
    url: string;
    goal?: string;
    mode?: SummaryMode;
    followLinks?: FollowLinksOptions;
    schema?: Record<string, unknown>;
    cache?: boolean;
}
export interface RenderInput {
    url: string;
    followLinks?: FollowLinksOptions;
    cache?: boolean;
}
export interface RenderResponse {
    url: string;
    title: string;
    view: string;
    elements: Record<string, unknown>;
    links: Array<{
        ref: string;
        text: string;
        href: string;
    }>;
    interactiveElements: Array<{
        ref: string;
        text: string;
        semantic: string;
        selector: string;
    }>;
    visibleTextBlocks: string[];
    meta: {
        renderMs: number;
        source: 'live' | 'cache';
    };
    followedPages?: Array<{
        url: string;
        title: string;
        view: string;
    }>;
}
export interface SummarizeResponse {
    url: string;
    title: string;
    summaryBullets: string[];
    keyFacts: string[];
    nextActions: string[];
    links: Array<{
        text: string;
        href: string;
    }>;
    extracted: Record<string, unknown>;
    cost: {
        units: number;
        credits: number;
    };
    meta: {
        renderMs: number;
        summarizeMs: number;
        cached: boolean;
    };
}
export declare class TextWebApiError extends Error {
    readonly status: number;
    readonly bodyText: string;
    readonly requestId?: string;
    readonly code?: string;
    readonly details?: unknown;
    readonly data?: {
        error?: string;
        message?: string;
        code?: string;
        details?: unknown;
    };
    readonly retryAfterMs?: number;
    constructor(params: {
        status: number;
        bodyText: string;
        requestId?: string;
        data?: {
            error?: string;
            message?: string;
            code?: string;
            details?: unknown;
        };
        retryAfterMs?: number;
    });
}
export type TextWebAuthHeaders = {
    'payment-signature'?: string;
    'x-api-key'?: string;
};
export declare class TextWeb {
    private readonly endpoint;
    private readonly apiKey?;
    private readonly paymentSignature?;
    private readonly payments?;
    private readonly planId?;
    private readonly agentId?;
    private readonly retries;
    private readonly baseDelayMs;
    private readonly maxDelayMs;
    private readonly timeoutMs;
    constructor(options: TextWebClientOptions);
    render(urlOrInput: string | RenderInput): Promise<RenderResponse>;
    summarize(urlOrInput: string | SummarizeInput): Promise<SummarizeResponse>;
    extract(url: string, schema: Record<string, unknown>, input?: Omit<SummarizeInput, 'url' | 'schema'>): Promise<SummarizeResponse>;
    getNeverminedAccessToken(planId?: string, agentId?: string): Promise<string | undefined>;
    getAuthHeaders(planId?: string, agentId?: string): Promise<TextWebAuthHeaders>;
    private request;
    private shouldRetryStatus;
    private isRetryableError;
    private computeBackoff;
    private parseRetryAfter;
    private sleep;
}
