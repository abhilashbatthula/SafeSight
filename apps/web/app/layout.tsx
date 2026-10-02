import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'SafeSight · Industrial Safety Analytics',
  description:
    'Industrial safety decision-support prototype. Simulated environmental readings and timestamped PPE inspections.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
