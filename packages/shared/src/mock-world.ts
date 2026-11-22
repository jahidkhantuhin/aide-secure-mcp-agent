import { z } from 'zod';

export const mockId = z.string().min(1).max(128);
export const instant = z.iso.datetime({ offset: true });
export const timeRange = z
  .strictObject({ start: instant, end: instant })
  .refine(({ start, end }) => Date.parse(start) < Date.parse(end), {
    message: 'End must follow start',
  });
export const calendarEventSchema = z.strictObject({
  id: mockId,
  title: z.string(),
  start: instant,
  end: instant,
  revision: z.int().nonnegative(),
});
export const calendarChangeSchema = z.strictObject({
  eventId: mockId,
  revision: z.int().nonnegative(),
  when: timeRange,
});
export const calendarProposalSchema = z.strictObject({
  change: calendarChangeSchema,
  before: calendarEventSchema,
  after: calendarEventSchema,
});

export const mailMessageSchema = z.strictObject({
  id: mockId,
  from: z.email(),
  subject: z.string(),
  body: z.string(),
  receivedAt: instant,
});
export const mailSummarySchema = mailMessageSchema.omit({ body: true });
export const mailContentSchema = z.strictObject({
  to: z.email().max(254),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
});
export const mailDraftSchema = z.strictObject({
  id: mockId,
  content: mailContentSchema,
});
export const socialPostSchema = z.strictObject({
  id: mockId,
  author: z.string(),
  text: z.string(),
});

export const mockWorldSchema = z.strictObject({
  id: mockId,
  mailbox: z.array(mailMessageSchema),
  calendar: z.array(calendarEventSchema),
  social: z.array(socialPostSchema),
});

export type MockWorld = z.infer<typeof mockWorldSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type CalendarChange = z.infer<typeof calendarChangeSchema>;
export type CalendarProposal = z.infer<typeof calendarProposalSchema>;
export type TimeRange = z.infer<typeof timeRange>;
export type MailContent = z.infer<typeof mailContentSchema>;
export type MailDraft = z.infer<typeof mailDraftSchema>;
export type MailMessage = z.infer<typeof mailMessageSchema>;
export type MailSummary = z.infer<typeof mailSummarySchema>;
