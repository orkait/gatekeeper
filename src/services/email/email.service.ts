// Cloudflare Workers compatible email service using Resend API directly
export interface EmailConfig {
    resendApiKey: string;
    fromEmail: string;
    appUrl: string;
}

export class EmailService {
    private apiKey: string;
    private fromEmail: string;
    private appUrl: string;

    constructor(config: EmailConfig) {
        this.apiKey = config.resendApiKey;
        this.fromEmail = config.fromEmail;
        this.appUrl = config.appUrl;
    }

    async sendVerificationEmail(email: string, name: string | null, verificationToken: string): Promise<void> {
        const verificationUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

        // Use fetch API directly instead of resend package (which uses Node.js streams)
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: this.fromEmail,
                to: email,
                subject: 'Verify your email address',
                html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px 40px; text-align: center;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #1a1a1a;">Orkait</h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <p style="margin: 0 0 16px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                                ${name ? `Hi ${this.escapeHtml(name)},` : 'Hi there,'}
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                                Thank you for signing up! Please verify your email address by clicking the button below:
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="${verificationUrl}" style="display: inline-block; padding: 14px 32px; background-color: #0066FF; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 500;">
                                            Verify Email Address
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 24px 0 0 0; font-size: 14px; color: #666666; line-height: 1.6;">
                                Or copy and paste this link into your browser:
                            </p>
                            <p style="margin: 8px 0 0 0; font-size: 14px; color: #0066FF; word-break: break-all; line-height: 1.6;">
                                ${verificationUrl}
                            </p>

                            <p style="margin: 32px 0 0 0; font-size: 14px; color: #999999; line-height: 1.6;">
                                This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px 40px 40px; text-align: center; border-top: 1px solid #eeeeee;">
                            <p style="margin: 0; font-size: 12px; color: #999999; line-height: 1.6;">
                                © ${new Date().getFullYear()} Orkait. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            `.trim(),
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to send email: ${error}`);
        }
    }

    private escapeHtml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m] || m);
    }
}
