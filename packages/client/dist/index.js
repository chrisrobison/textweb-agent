import { Payments } from '@nevermined-io/payments';
export class TextWebApiError extends Error {
    status;
    bodyText;
    requestId;
    code;
    details;
    data;
    retryAfterMs;
    constructor(params) {
        const message = params.data?.message || params.bodyText || 'Request failed';
        super(`TextWeb API error ${params.status}: ${message}`);
        this.status = params.status;
        this.bodyText = params.bodyText;
        this.requestId = params.requestId;
        this.code = params.data?.code;
        this.details = params.data?.details;
        this.data = params.data;
        this.retryAfterMs = params.retryAfterMs;
    }
}
export class TextWeb {
    endpoint;
    apiKey;
    paymentSignature;
    payments;
    planId;
    agentId;
    retries;
    baseDelayMs;
    maxDelayMs;
    timeoutMs;
    constructor(options) {
        this.endpoint = options.endpoint.replace(/\/$/, '');
        this.apiKey = options.apiKey;
        this.paymentSignature = options.paymentSignature;
        this.retries = options.retry?.retries ?? 2;
        this.baseDelayMs = options.retry?.baseDelayMs ?? 250;
        this.maxDelayMs = options.retry?.maxDelayMs ?? 1500;
        this.timeoutMs = options.timeoutMs ?? 30000;
        if (options.nevermined) {
            this.payments = Payments.getInstance({
                nvmApiKey: options.nevermined.nvmApiKey,
                environment: (options.nevermined.environment || 'sandbox'),
            });
            this.planId = options.nevermined.planId;
            this.agentId = options.nevermined.agentId;
        }
    }
    async render(urlOrInput) {
        const body = typeof urlOrInput === 'string' ? { url: urlOrInput } : urlOrInput;
        return this.request('/v1/render', body);
    }
    async summarize(urlOrInput) {
        const body = typeof urlOrInput === 'string' ? { url: urlOrInput } : urlOrInput;
        return this.request('/v1/summarize', body);
    }
    async extract(url, schema, input) {
        return this.summarize({
            url,
            ...input,
            schema,
        });
    }
    async getNeverminedAccessToken(planId, agentId) {
        if (!this.payments)
            return undefined;
        const selectedPlanId = planId || this.planId;
        if (!selectedPlanId)
            return undefined;
        const token = await this.payments.x402.getX402AccessToken(selectedPlanId, agentId || this.agentId);
        return token.accessToken;
    }
    async getAuthHeaders(planId, agentId) {
        const paymentSignature = this.paymentSignature || (await this.getNeverminedAccessToken(planId, agentId));
        return {
            ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
            ...(paymentSignature ? { 'payment-signature': paymentSignature } : {}),
        };
    }
    async request(path, body) {
        const headers = {
            'Content-Type': 'application/json',
            ...(await this.getAuthHeaders()),
        };
        let lastError;
        for (let attempt = 0; attempt <= this.retries; attempt += 1) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const response = await fetch(`${this.endpoint}${path}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
                if (!response.ok) {
                    const text = await response.text();
                    let parsed;
                    try {
                        parsed = text ? JSON.parse(text) : undefined;
                    }
                    catch {
                        parsed = undefined;
                    }
                    const requestId = response.headers.get('x-request-id') || undefined;
                    const retryAfterMs = this.parseRetryAfter(response.headers.get('retry-after'));
                    const error = new TextWebApiError({
                        status: response.status,
                        bodyText: text,
                        requestId,
                        data: parsed,
                        retryAfterMs,
                    });
                    if (attempt < this.retries && this.shouldRetryStatus(response.status)) {
                        await this.sleep(this.computeBackoff(attempt, retryAfterMs));
                        lastError = error;
                        continue;
                    }
                    throw error;
                }
                return (await response.json());
            }
            catch (error) {
                const retryable = this.isRetryableError(error);
                if (attempt < this.retries && retryable) {
                    await this.sleep(this.computeBackoff(attempt));
                    lastError = error;
                    continue;
                }
                throw error;
            }
            finally {
                clearTimeout(timeout);
            }
        }
        throw lastError instanceof Error ? lastError : new Error('Request failed');
    }
    shouldRetryStatus(status) {
        return status === 429 || status >= 500;
    }
    isRetryableError(error) {
        if (error instanceof TextWebApiError)
            return this.shouldRetryStatus(error.status);
        if (error instanceof Error && error.name === 'AbortError')
            return true;
        return true;
    }
    computeBackoff(attempt, retryAfterMs) {
        const exponential = Math.min(this.baseDelayMs * 2 ** attempt, this.maxDelayMs);
        const jitter = Math.floor(Math.random() * Math.max(20, Math.floor(exponential * 0.2)));
        const backoffWithJitter = Math.min(exponential + jitter, this.maxDelayMs);
        if (!retryAfterMs || retryAfterMs <= 0)
            return backoffWithJitter;
        return Math.max(backoffWithJitter, Math.min(retryAfterMs, this.maxDelayMs * 5));
    }
    parseRetryAfter(raw) {
        if (!raw)
            return undefined;
        const seconds = Number(raw);
        if (Number.isFinite(seconds) && seconds > 0)
            return Math.round(seconds * 1000);
        const date = new Date(raw);
        if (Number.isNaN(date.getTime()))
            return undefined;
        const delta = date.getTime() - Date.now();
        return delta > 0 ? delta : undefined;
    }
    async sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
