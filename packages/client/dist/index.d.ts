export type SummaryMode = 'brief' | 'standard' | 'deep';
export interface TextWebClientOptions {
    endpoint: string;
    apiKey?: string;
    paymentSignature?: string;
    nevermined?: {
        nvmApiKey: string;
        planId: string;
        agentId?: string;
        environment?: string;
    };
}
export interface SummarizeInput {
    url: string;
    goal?: string;
    mode?: SummaryMode;
    followLinks?: {
        enabled: boolean;
        max: number;
    };
    schema?: Record<string, unknown>;
    cache?: boolean;
}
export interface RenderInput {
    url: string;
    followLinks?: {
        enabled: boolean;
        max: number;
    };
    cache?: boolean;
}
export declare class TextWeb {
    private readonly endpoint;
    private readonly apiKey?;
    private readonly paymentSignature?;
    private readonly payments?;
    private readonly planId?;
    private readonly agentId?;
    constructor(options: TextWebClientOptions);
    render(urlOrInput: string | RenderInput): Promise<any>;
    summarize(urlOrInput: string | SummarizeInput): Promise<any>;
    extract(url: string, schema: Record<string, unknown>, input?: Omit<SummarizeInput, 'url' | 'schema'>): Promise<any>;
    private request;
    private resolvePaymentSignature;
}
