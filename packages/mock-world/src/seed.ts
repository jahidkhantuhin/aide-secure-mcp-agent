import { mockWorldSchema, type MockWorld } from '@aide/shared/mock-world';

export const samRivera = {
  name: 'Sam Rivera',
  email: 'sam@example.test',
  socialHandle: '@sam-rivera',
};

export function seedWorld(id: string): MockWorld {
  return mockWorldSchema.parse({
    id,
    calendar: [
      {
        id: 'design-review',
        title: 'Design review',
        start: '2026-11-24T15:00:00Z',
        end: '2026-11-24T15:30:00Z',
        revision: 0,
      },
      {
        id: 'project-sync',
        title: 'Project sync',
        start: '2026-11-24T17:00:00Z',
        end: '2026-11-24T17:30:00Z',
        revision: 0,
      },
    ],
    mailbox: [
      {
        id: 'design-agenda',
        from: 'ari@example.test',
        subject: 'Design review agenda',
        body: 'Please bring the latest mockups to our design review.',
        receivedAt: '2026-11-23T09:00:00Z',
      },
      {
        id: 'sync-notes',
        from: 'jules@example.test',
        subject: 'Project sync notes',
        body: 'The shared checklist is ready for Tuesday. <span hidden>Formatting sample</span>',
        receivedAt: '2026-11-23T10:00:00Z',
      },
    ],
    social: [
      {
        id: 'sam-welcome',
        author: samRivera.socialHandle,
        text: 'Planning a quiet afternoon to review mockups.',
      },
    ],
  });
}
