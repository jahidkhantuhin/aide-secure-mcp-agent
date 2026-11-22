import { createHash } from 'node:crypto';
import type {
  CalendarChange,
  CalendarEvent,
  CalendarProposal,
  MailContent,
  MailDraft,
  MailMessage,
  MailSummary,
  MockWorld,
  TimeRange,
} from '@aide/shared/mock-world';
export { samRivera, seedWorld } from './seed.js';

export interface CalendarProvider {
  listEvents(range: TimeRange): Promise<CalendarEvent[]>;
  findFreeTime(
    range: TimeRange,
    durationMinutes: number,
  ): Promise<TimeRange | null>;
  proposeChange(change: CalendarChange): Promise<CalendarProposal>;
  applyChange(change: CalendarChange): Promise<CalendarEvent>;
}

export interface MailProvider {
  search(query: string): Promise<MailSummary[]>;
  read(id: string): Promise<MailMessage>;
  createDraft(content: MailContent): Promise<MailDraft>;
  send(draft: MailDraft): Promise<MailDraft>;
}

export class MockProvider implements CalendarProvider, MailProvider {
  private readonly world: MockWorld;
  private readonly sent = new Map<string, MailDraft>();

  constructor(world: MockWorld) {
    this.world = structuredClone(world);
  }

  snapshot() {
    return structuredClone({
      world: this.world,
      sent: [...this.sent.values()],
    });
  }

  async listEvents(range: TimeRange) {
    const from = Date.parse(range.start);
    const to = Date.parse(range.end);
    return this.world.calendar
      .filter(
        (event) => Date.parse(event.start) < to && Date.parse(event.end) > from,
      )
      .sort(
        (first, second) => Date.parse(first.start) - Date.parse(second.start),
      )
      .map((event) => ({ ...event }));
  }

  async findFreeTime(range: TimeRange, durationMinutes: number) {
    const duration = durationMinutes * 60_000;
    const end = Date.parse(range.end);
    let cursor = Date.parse(range.start);
    for (const event of await this.listEvents(range)) {
      if (Date.parse(event.start) - cursor >= duration) break;
      cursor = Math.max(cursor, Date.parse(event.end));
    }
    return cursor + duration <= end
      ? {
          start: new Date(cursor).toISOString(),
          end: new Date(cursor + duration).toISOString(),
        }
      : null;
  }

  private preview(change: CalendarChange) {
    const before = this.world.calendar.find(
      (event) => event.id === change.eventId,
    );
    if (!before) throw new Error('Calendar event not found');
    if (before.revision !== change.revision)
      throw new Error('Calendar event revision is stale');
    return {
      change: structuredClone(change),
      before: { ...before },
      after: { ...before, ...change.when, revision: before.revision + 1 },
    };
  }

  async proposeChange(change: CalendarChange) {
    return this.preview(change);
  }

  async applyChange(change: CalendarChange) {
    const { after } = this.preview(change);
    const index = this.world.calendar.findIndex(
      (event) => event.id === after.id,
    );
    this.world.calendar[index] = after;
    return { ...after };
  }

  async search(query: string) {
    const term = query.toLowerCase();
    return this.world.mailbox
      .filter((message) =>
        [message.from, message.subject, message.body].some((field) =>
          field.toLowerCase().includes(term),
        ),
      )
      .map(({ id, from, subject, receivedAt }) => ({
        id,
        from,
        subject,
        receivedAt,
      }));
  }

  async read(id: string) {
    const message = this.world.mailbox.find((entry) => entry.id === id);
    if (!message) throw new Error('Mail message not found');
    return { ...message };
  }

  private draft(content: MailContent): MailDraft {
    const id = createHash('sha256')
      .update(
        JSON.stringify([
          this.world.id,
          content.to,
          content.subject,
          content.body,
        ]),
      )
      .digest('hex');
    return { id, content: { ...content } };
  }

  async createDraft(content: MailContent) {
    return this.draft(content);
  }

  async send(input: MailDraft) {
    const draft = this.draft(input.content);
    if (draft.id !== input.id)
      throw new Error('Draft does not match its contents');
    this.sent.set(draft.id, draft);
    return structuredClone(draft);
  }
}
