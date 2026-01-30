import type {
    PostHogConfig,
    PostHogEvent,
    AnalyticsTransport,
} from './types';

const DEFAULT_CONFIG: PostHogConfig = {
    apiKey: 'phc_ebgJMTGR4EWeFFlMn0s3JAvq9vtejzj0kJmwflVGhY5',
    host: 'https://eu.i.posthog.com',
};

class PostHogHttpTransport implements AnalyticsTransport {
    constructor(private config: PostHogConfig) { }

    async send(event: PostHogEvent): Promise<void> {
        try {
            await fetch(`${this.config.host}/capture/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: this.config.apiKey,
                    event: event.event,
                    properties: event.properties,
                    timestamp: event.timestamp || new Date().toISOString(),
                }),
            });
        } catch (error) {
            this.handleError('capture', error);
        }
    }

    async sendBatch(events: PostHogEvent[]): Promise<void> {
        try {
            await fetch(`${this.config.host}/batch/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: this.config.apiKey,
                    batch: events.map((e) => ({
                        event: e.event,
                        properties: e.properties,
                        timestamp: e.timestamp || new Date().toISOString(),
                    })),
                }),
            });
        } catch (error) {
            this.handleError('batch', error);
        }
    }

    private handleError(operation: string, error: unknown): void {
        // Don't throw - analytics failures shouldn't break the app
        console.error(`PostHog ${operation} failed:`, error);
    }
}


class PostHogClient {
    private transport: AnalyticsTransport;

    constructor(config: PostHogConfig = DEFAULT_CONFIG) {
        this.transport = new PostHogHttpTransport(config);
    }

    async capture(
        distinctId: string,
        event: string,
        properties?: Record<string, any>
    ): Promise<void> {
        return this.transport.send({
            event,
            properties: {
                distinct_id: distinctId,
                ...properties,
            },
        });
    }

    async captureBatch(events: PostHogEvent[]): Promise<void> {
        return this.transport.sendBatch(events);
    }
}

const client = new PostHogClient();

export function captureEvent(
    distinctId: string,
    event: string,
    properties?: Record<string, any>
): Promise<void> {
    return client.capture(distinctId, event, properties);
}

export function captureBatch(events: PostHogEvent[]): Promise<void> {
    return client.captureBatch(events);
}
