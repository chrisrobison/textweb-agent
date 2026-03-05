import { Payments } from '@nevermined-io/payments';
export class TextWeb {
    endpoint;
    apiKey;
    paymentSignature;
    payments;
    planId;
    agentId;
    constructor(options) {
        this.endpoint = options.endpoint.replace(/\/$/, '');
        this.apiKey = options.apiKey;
        this.paymentSignature = options.paymentSignature;
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
    async request(path, body) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.apiKey) {
            headers['x-api-key'] = this.apiKey;
        }
        const paymentSignature = await this.resolvePaymentSignature();
        if (paymentSignature) {
            headers['payment-signature'] = paymentSignature;
        }
        const response = await fetch(`${this.endpoint}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`TextWeb API error ${response.status}: ${text}`);
        }
        return response.json();
    }
    async resolvePaymentSignature() {
        if (this.paymentSignature)
            return this.paymentSignature;
        if (this.payments && this.planId) {
            const token = await this.payments.x402.getX402AccessToken(this.planId, this.agentId);
            return token.accessToken;
        }
        return undefined;
    }
}
