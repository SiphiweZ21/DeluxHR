import { Feature } from '@prisma/client';
export type MenuCategory =
  | 'HOME'
  | 'DETAILS'
  | 'LEAVE'
  | 'ATTENDANCE'
  | 'PAY'
  | 'HR';
export type ListRow = { id: string; title: string; description: string };
export type WhatsAppList = {
  type: 'list';
  header: { type: 'text'; text: string };
  body: { text: string };
  footer: { text: string };
  action: { button: string; sections: { title: string; rows: ListRow[] }[] };
};
export type MenuReply = { interactive: WhatsAppList; fallback: string };
export type EssReply = string | MenuReply;
const groups: {
  key: MenuCategory;
  title: string;
  description: string;
  actions: {
    number: string;
    title: string;
    description: string;
    feature: Feature;
  }[];
}[] = [
  {
    key: 'DETAILS',
    title: 'My details',
    description: 'Your profile and company news',
    actions: [
      {
        number: '1',
        title: 'My profile',
        description: 'View your employee details',
        feature: Feature.CORE_HR,
      },
      {
        number: '12',
        title: 'Announcements',
        description: 'Read updates from your company',
        feature: Feature.CORE_HR,
      },
    ],
  },
  {
    key: 'LEAVE',
    title: 'Leave',
    description: 'Balances, requests and progress',
    actions: [
      {
        number: '2',
        title: 'Leave balance',
        description: 'See your available leave days',
        feature: Feature.LEAVE,
      },
      {
        number: '3',
        title: 'Request leave',
        description: 'Start a new leave request',
        feature: Feature.LEAVE,
      },
      {
        number: '4',
        title: 'Leave request status',
        description: 'Check your latest request',
        feature: Feature.LEAVE,
      },
    ],
  },
  {
    key: 'ATTENDANCE',
    title: 'Attendance',
    description: 'Clock in, clock out and records',
    actions: [
      {
        number: '6',
        title: 'Clock in',
        description: 'Start your shift with your location',
        feature: Feature.ATTENDANCE,
      },
      {
        number: '7',
        title: 'Clock out',
        description: 'End your shift with your location',
        feature: Feature.ATTENDANCE,
      },
      {
        number: '5',
        title: 'My attendance',
        description: 'Check your latest attendance event',
        feature: Feature.ATTENDANCE,
      },
      {
        number: '8',
        title: 'Explain an exception',
        description: 'Respond to an attendance query',
        feature: Feature.ATTENDANCE,
      },
    ],
  },
  {
    key: 'PAY',
    title: 'Pay',
    description: 'Payslips and Early Pay',
    actions: [
      {
        number: '9',
        title: 'My payslip',
        description: 'Get your latest issued payslip',
        feature: Feature.PAYSLIPS,
      },
      {
        number: '13',
        title: 'Early Pay',
        description: 'Check eligibility and request an advance',
        feature: Feature.EARLY_PAY,
      },
    ],
  },
  {
    key: 'HR',
    title: 'HR support',
    description: 'Ask HR and follow up',
    actions: [
      {
        number: '10',
        title: 'Contact HR',
        description: 'Submit a new HR request',
        feature: Feature.CORE_HR,
      },
      {
        number: '11',
        title: 'HR request status',
        description: 'Track your latest HR request',
        feature: Feature.CORE_HR,
      },
    ],
  },
];
export function validMenuId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (/^WA_MENU_(HOME|DETAILS|LEAVE|ATTENDANCE|PAY|HR)$/.test(value) ||
      /^WA_ACTION_([1-9]|1[0-3])$/.test(value))
  );
}
export function buildWhatsAppMenu(
  enabled: ReadonlySet<Feature>,
  category: MenuCategory = 'HOME',
): MenuReply {
  const available = groups
    .map((g) => ({
      ...g,
      actions: g.actions.filter((a) => enabled.has(a.feature)),
    }))
    .filter((g) => g.actions.length);
  const group = available.find((g) => g.key === category);
  const title = group?.title ?? 'Employee self-service';
  const rows: ListRow[] = group
    ? [
        ...group.actions.map((a) => ({
          id: `WA_ACTION_${a.number}`,
          title: a.title,
          description: a.description,
        })),
        {
          id: 'WA_MENU_HOME',
          title: 'Back to main menu',
          description: 'Choose a different service',
        },
      ]
    : available.map((g) => ({
        id: `WA_MENU_${g.key}`,
        title: g.title,
        description:
          g.key === 'PAY'
            ? g.actions.map((a) => a.title).join(' and ')
            : g.description,
      }));
  // CORE_HR is always included by EntitlementsService; retain navigation if configuration is empty.
  if (!rows.length)
    rows.push({
      id: 'WA_MENU_HOME',
      title: 'Refresh menu',
      description: 'Ask HR to enable your company services',
    });
  const fallbackGroups = group ? [group] : available;
  const fallback =
    `*DeluxHR • ${title}*\n\n` +
    fallbackGroups
      .map(
        (g) =>
          `*${g.title}*\n${g.actions.map((a) => `${a.number}. ${a.title}`).join('\n')}`,
      )
      .join('\n\n') +
    '\n\nReply with an option number.\nReply 0 for the main menu.';
  return {
    interactive: {
      type: 'list',
      header: { type: 'text', text: `DeluxHR • ${title}` },
      body: {
        text: group
          ? 'What would you like to do?\nTap Choose option below to continue.'
          : 'Welcome to your employee self-service. 👋\n\nChoose a service below. We’re here to help.',
      },
      footer: { text: 'Your details stay private • Type 0 for the main menu' },
      action: {
        button: group ? 'Choose option' : 'Open menu',
        sections: [
          { title: group ? 'Available options' : 'Your services', rows },
        ],
      },
    },
    fallback,
  };
}
