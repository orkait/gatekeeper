export interface PostHogConfig {
    apiKey: string;
    host: string;
}

export interface PostHogEventProperties {
    distinct_id: string;
    [key: string]: any;
}

export interface PostHogEvent {
    event: string;
    properties: PostHogEventProperties;
    timestamp?: string;
}

export interface AnalyticsTransport {
    send(event: PostHogEvent): Promise<void>;
    sendBatch(events: PostHogEvent[]): Promise<void>;
}
