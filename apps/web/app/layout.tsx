import type { Metadata } from 'next';
import Application from '@/components/application';
import './globals.css';
export const metadata: Metadata = {
  title: 'SafeSight · Safety Workspace',
  description:
    'Windows 95 desktop for human PPE and machinery safety analysis.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Application />
        {children}
      </body>
    </html>
  );
}
