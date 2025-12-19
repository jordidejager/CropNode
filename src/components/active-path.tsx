'use client';

import { usePathname } from 'next/navigation';
import React from 'react';

type ActivePathProps = {
  href: string;
  children: React.ReactElement;
  passHref?: boolean;
};

export function ActivePath({ href, children, passHref = false }: ActivePathProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  if (passHref) {
    return React.cloneElement(children, { isActive });
  }

  return children;
}
