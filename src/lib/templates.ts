export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultIcon: string;
  body: string;
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Empty page with just frontmatter',
    icon: 'file',
    defaultIcon: 'file',
    body: '',
  },
  {
    id: 'process-sop',
    name: 'Process/SOP',
    description: 'Phased checklist with timeline sections',
    icon: 'clipboard-list',
    defaultIcon: 'clipboard-list',
    body: `A brief description of what this process accomplishes and when to use it.

## Phase 1 — Getting Started

- [ ] Step one
- [ ] Step two
- [ ] Step three

## Phase 2 — Main Work

- [ ] Step one
- [ ] Step two
- [ ] Step three

## Phase 3 — Wrap Up

- [ ] Step one
- [ ] Step two

<Callout type="tip" title="Pro tip">
Add helpful context or shortcuts for people following this process.
</Callout>
`,
  },
  {
    id: 'community',
    name: 'Community/Program',
    description: 'Lead, mission, focus areas, resources',
    icon: 'users',
    defaultIcon: 'users',
    body: `Brief description of this community's purpose and value.

## Community overview

<PersonRow name="Lead Name" role="Community Lead" email="email@mdplus.community" slack="channel-name" />

**Mission:** One sentence mission statement.

**Focus areas:**
- Area one
- Area two
- Area three

## Regular programming

| Event | Frequency | Description |
|-------|-----------|-------------|
| Event name | Weekly | Brief description |
| Event name | Monthly | Brief description |

## Resources

<LinkCard href="#" title="Slack channel" description="#channel — Main community channel" icon="brand-slack" />

<LinkCard href="#" title="Resource library" description="Docs, templates, and guides" icon="folder" />

## Active initiatives

1. **Initiative name** — Brief description
2. **Initiative name** — Brief description

<Callout type="info" title="New member onboarding">
Instructions for new members joining this community.
</Callout>
`,
  },
  {
    id: 'reference',
    name: 'Reference/Directory',
    description: 'Tables with callout warnings',
    icon: 'table',
    defaultIcon: 'table',
    body: `Central reference for this topic. Keep this page updated.

<Callout type="warning" title="Important notice">
Add any warnings or caveats about this reference material.
</Callout>

## Category one

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data | Data | Data |
| Data | Data | Data |

## Category two

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data | Data | Data |
| Data | Data | Data |

<Callout type="info" title="Need to add something?">
Instructions for updating this reference.
</Callout>
`,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Standing agenda template',
    icon: 'notes',
    defaultIcon: 'notes',
    body: `Central repository for meeting notes and action items.

## Meeting template

Copy this template for each meeting:

\`\`\`markdown
## Meeting Name — Date

**Attendees:** Names
**Facilitator:** Name
**Note-taker:** Name

### Agenda
1. Topic one
2. Topic two
3. Open floor

### Discussion notes
Summary of each agenda item

### Action items
- [ ] Task — Owner — Due Date

### Next meeting
Date/time — Facilitator
\`\`\`

## Standing agenda

1. **Check-in** (5 min) — Quick pulse check
2. **Updates** (15 min) — Round-robin updates
3. **Discussion** (20 min) — Deep-dive topic
4. **Action items** (5 min) — Review and assign

<Callout type="info" title="Recordings">
Meeting recordings are stored in the shared drive.
</Callout>
`,
  },
  {
    id: 'hub',
    name: 'Hub/Overview',
    description: 'LinkCard grid with intro',
    icon: 'layout-grid',
    defaultIcon: 'home',
    body: `Welcome to this section — brief description of what this section contains.

<Callout type="info" title="What lives here">
Explain what users will find in this section and how to navigate it.
</Callout>

## Quick links

<LinkCard
  href="#"
  title="Page name"
  description="Brief description of this page."
  icon="file"
/>

<LinkCard
  href="#"
  title="Page name"
  description="Brief description of this page."
  icon="file"
/>

<LinkCard
  href="#"
  title="Page name"
  description="Brief description of this page."
  icon="file"
/>

## How to use this section

- **Read** pages to learn about this topic
- **Edit** any page to improve documentation
- **Add** new pages as needed
`,
  },
];

export function getTemplateById(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}
