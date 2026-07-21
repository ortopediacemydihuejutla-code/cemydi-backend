export interface SendEmailOptions {
  to: string;
  recipientName?: string;
  subject: string;
  html: string;
  text?: string;
}
