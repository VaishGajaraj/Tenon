/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@electric-sql/pglite", "postgres"],
  },
};

export default nextConfig;
