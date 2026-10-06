import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class EmailService {
  configured(): boolean {
    return Boolean(
      process.env['RESEND_API_KEY'] && process.env['EMAIL_FROM'] && process.env['APP_ORIGIN'],
    );
  }

  async sendPasswordReset(to: string, link: string, idempotencyKey: string): Promise<void> {
    await this.send(
      to,
      'Reset your Revora password',
      `Use this link to reset your Revora password. It expires in 30 minutes.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
      `password-reset/${idempotencyKey}`,
    );
  }

  async sendInvitation(to: string, link: string, idempotencyKey: string): Promise<void> {
    await this.send(
      to,
      'Join your team in Revora',
      `Your teammate invited you to Revora. Use this link within 48 hours to join the workspace.\n\n${link}`,
      `invitation/${idempotencyKey}`,
    );
  }

  async sendEmailVerification(to: string, link: string, idempotencyKey: string): Promise<void> {
    await this.send(
      to,
      'Verify your Revora email',
      `Use this link to verify your Revora email address. It expires in 24 hours.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
      `email-verification/${idempotencyKey}`,
    );
  }

  private async send(
    to: string,
    subject: string,
    body: string,
    idempotencyKey: string,
  ): Promise<void> {
    if (!this.configured()) {
      throw new ServiceUnavailableException('Account email is not configured.');
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env['RESEND_API_KEY']}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env['EMAIL_FROM'],
        to: [to],
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Account email could not be sent.');
    }
  }
}
