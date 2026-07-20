/**
 * @audebase/notification - EmailNotificationProvider
 *
 * Concrete provider that delivers notifications via SMTP (D1.14).
 * Phase 2: full nodemailer integration.
 */

import type { NotificationProvider, NotificationRecipient, NotificationTemplate, NotificationResult } from '../types.js'

/**
 * Minimal transporter interface compatible with nodemailer.
 * Accept a real `nodemailer.Transporter` at runtime without importing nodemailer.
 */
export interface EmailTransporter {
  sendMail(mailOptions: {
    from?: string
    to: string
    subject: string
    text?: string
    html?: string
  }): Promise<{ messageId: string }>
}

/** SMTP configuration for creating a nodemailer transporter. */
export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  auth: {
    user: string
    pass: string
  }
}

/**
 * Delivers notifications via email using a nodemailer-compatible transporter.
 *
 * SMTP config is typically sourced from env:
 *   AUDE_SMTP_HOST, AUDE_SMTP_PORT, AUDE_SMTP_USER, AUDE_SMTP_PASS
 */
export class EmailNotificationProvider implements NotificationProvider {
  readonly name = 'email'

  private readonly fromAddress: string

  constructor(
    private readonly transporter: EmailTransporter,
    opts?: { from?: string },
  ) {
    this.fromAddress = opts?.from ?? 'noreply@audebase.local'
  }

  async send(
    recipient: NotificationRecipient,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationResult> {
    if (!recipient.email) {
      return {
        success: false,
        providerName: this.name,
        error: 'Recipient email is required',
        sentAt: new Date(),
      }
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: recipient.email,
        subject: `[AUDEBase] ${template.subject}`,
        text: typeof data.body === 'string' ? data.body : JSON.stringify(data, null, 2),
        html: typeof data.html === 'string' ? data.html : undefined,
      })
      return {
        success: true,
        providerName: this.name,
        sentAt: new Date(),
      }
    } catch (error: unknown) {
      return {
        success: false,
        providerName: this.name,
        error: `Email send failed for template "${template.id}": ${error instanceof Error ? error.message : 'unknown error'}`,
        sentAt: new Date(),
      }
    }
  }
}

/**
 * Read SMTP config from environment variables.
 * Returns null if required vars are not set.
 */
export function readSmtpConfigFromEnv(): SmtpConfig | null {
  const host = process.env.AUDE_SMTP_HOST
  const portStr = process.env.AUDE_SMTP_PORT
  const user = process.env.AUDE_SMTP_USER
  const pass = process.env.AUDE_SMTP_PASS

  if (!host || !portStr) return null

  const port = Number.parseInt(portStr, 10)
  if (Number.isNaN(port)) return null

  return {
    host,
    port,
    secure: port === 465,
    auth: {
      user: user ?? '',
      pass: pass ?? '',
    },
  }
}
