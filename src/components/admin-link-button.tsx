"use client";

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Button } from './ui/button';

interface AdminLinkButtonProps {
  href: string;
  text: string;
}

export function AdminLinkButton({ href, text }: AdminLinkButtonProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // Don't show anything while loading
  }

  if (!user) {
    return null; // Don't show if not logged in
  }

  return (
    <Link href={href} passHref>
      <Button variant="outline">{text}</Button>
    </Link>
  );
}
