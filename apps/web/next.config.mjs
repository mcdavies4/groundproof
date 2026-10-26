/** @type {import('next').NextConfig} */
const nextConfig = {
  // Document uploads (survey plans, C of O) go through a server action. Vercel caps request bodies at 4.5 MB, so the
  // form shrinks photos first and rejects PDFs over 4 MB.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
};
export default nextConfig;
