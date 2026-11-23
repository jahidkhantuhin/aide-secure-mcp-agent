import { quarantine } from '@aide/guard/quarantine';
import type { MockWorld } from '@aide/shared/mock-world';

export function prepareWorld(world: MockWorld) {
  const mail = world.mailbox.slice(0, 20).map((message) => ({
    message,
    fact: quarantine({
      source: 'email',
      sender: message.from,
      content: message.subject + '\n' + message.body,
    }),
  }));
  const calendar = world.calendar.slice(0, 20).map((event) => ({
    event,
    fact: quarantine({
      source: 'invite',
      content: event.title + ' ' + event.start.slice(0, 10),
    }),
  }));
  const social = world.social
    .slice(0, 20)
    .map((post) => quarantine({ source: 'social', content: post.text }));
  return {
    facts: [
      ...mail.map(({ fact }) => fact),
      ...calendar.map(({ fact }) => fact),
      ...social,
    ],
    riskByTool: {
      search: Math.max(0, ...mail.map(({ fact }) => fact.riskScore)),
      list_events: Math.max(0, ...calendar.map(({ fact }) => fact.riskScore)),
    },
    safeWorld: {
      id: world.id,
      mailbox: mail
        .filter(({ fact }) => fact.riskScore < 70)
        .map(({ message, fact }) => ({
          ...message,
          from:
            fact.sender === 'team'
              ? 'team@example.test'
              : 'external@example.test',
          subject: fact.intent,
          body: fact.dates.join(' '),
        })),
      calendar: calendar
        .filter(({ fact }) => fact.riskScore < 70)
        .map(({ event, fact }) => ({ ...event, title: fact.intent })),
      social: [],
    } satisfies MockWorld,
  };
}
