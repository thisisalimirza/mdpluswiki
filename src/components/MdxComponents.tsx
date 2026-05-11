import * as Icons from '@tabler/icons-react';
import type { IconProps } from '@tabler/icons-react';
import React from 'react';

type CalloutType = 'info' | 'warning' | 'success' | 'tip';

const CALLOUT_STYLES: Record<
  CalloutType,
  { bg: string; border: string; iconColor: string; Icon: React.ComponentType<IconProps> }
> = {
  info: { bg: '#F4F3FB', border: '#534AB7', iconColor: '#534AB7', Icon: Icons.IconInfoCircle },
  warning: { bg: '#FEF7EC', border: '#D58A1A', iconColor: '#D58A1A', Icon: Icons.IconAlertTriangle },
  success: { bg: '#EDF8F2', border: '#1A8A4A', iconColor: '#1A8A4A', Icon: Icons.IconCircleCheck },
  tip: { bg: '#EEF6FB', border: '#1E6E9E', iconColor: '#1E6E9E', Icon: Icons.IconBulb },
};

export function Callout({
  type = 'info',
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children: React.ReactNode;
}) {
  const s = CALLOUT_STYLES[type] ?? CALLOUT_STYLES.info;
  const Icon = s.Icon;
  return (
    <div
      className="my-4 rounded-card border-l-4 px-4 py-3 flex gap-3"
      style={{ background: s.bg, borderColor: s.border }}
    >
      <Icon size={18} stroke={1.75} className="shrink-0 mt-0.5" />
      <div className="text-[14px] leading-relaxed">
        {title && <div className="font-semibold mb-1">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function LinkCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description?: string;
  icon?: string;
}) {
  const key =
    'Icon' +
    (icon || 'link')
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
  const I =
    ((Icons as unknown as Record<string, React.ComponentType<IconProps>>)[
      key
    ] as React.ComponentType<IconProps>) ?? Icons.IconLink;
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="block border border-hairline rounded-card p-3.5 hover:border-brand hover:bg-brand-50/50 transition-colors no-underline"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-md bg-brand-50 text-brand grid place-items-center shrink-0">
          <I size={16} stroke={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="font-semibold text-[14px] text-ink truncate">{title}</div>
            {external && <Icons.IconExternalLink size={12} stroke={1.75} className="text-muted" />}
          </div>
          {description && <div className="text-[13px] text-muted mt-0.5">{description}</div>}
        </div>
      </div>
    </a>
  );
}

export function PersonRow({
  name,
  role,
  email,
  slack,
}: {
  name: string;
  role: string;
  email?: string;
  slack?: string;
}) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex items-center gap-3 py-2 border-b border-hairline last:border-b-0">
      <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold text-[12px]">
        {initials}
      </div>
      <div className="flex-1">
        <div className="font-semibold text-[14px]">{name}</div>
        <div className="text-[12px] text-muted">{role}</div>
      </div>
      <div className="flex items-center gap-3 text-[12px] text-muted">
        {email && (
          <a href={`mailto:${email}`} className="hover:text-brand">
            {email}
          </a>
        )}
        {slack && (
          <span className="text-brand">
            @{slack}
          </span>
        )}
      </div>
    </div>
  );
}

export const mdxComponents = {
  Callout,
  LinkCard,
  PersonRow,
};
