'use client';

import { usePathname } from 'next/navigation';
import React from 'react';

type ActivePathProps = {
  href: string;
  children: React.ReactElement;
};

export function ActivePath({ href, children }: ActivePathProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  // Clone the child and pass the isActive prop
  return React.cloneElement(children, { ...children.props, isActive });
}
