import { z } from 'zod';

export const RegisterWebhookSchema = z.object({
    url: z.string().url('Invalid URL format'),
    events: z.array(z.string()).min(1, 'At least one event type is required'),
    secret: z.string().optional(),
});

export const UpdateWebhookSchema = z.object({
    url: z.string().url('Invalid URL format').optional(),
    events: z.array(z.string()).min(1).optional(),
    secret: z.string().optional(),
    active: z.boolean().optional(),
});

export type RegisterWebhookInput = z.infer<typeof RegisterWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof UpdateWebhookSchema>;
