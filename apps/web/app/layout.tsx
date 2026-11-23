import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aide',
  description: 'Agents that ask before they act.',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="en" className="dark">
      <body className="bg-[#111715] text-[#eef2ee] antialiased">
        {children}
      </body>
    </html>
  );
}
