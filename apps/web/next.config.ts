import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.NEXT_OUTPUT_DIR || '.next',
  transpilePackages: ['@safesight/contracts'],
  devIndicators: false,
};
export default config;
