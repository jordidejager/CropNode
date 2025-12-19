'use client';

import { usePathname } from 'next/navigation';
import React from 'react';

type ActivePathProps = {
  href: string;
  children: React.ReactElement;
  passHref?: boolean;
};

export function ActivePath({ href, children }: ActivePathProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return React.cloneElement(children, { ...children.props, isActive });
}
