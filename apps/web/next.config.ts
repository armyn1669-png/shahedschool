import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@school/shared"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), fullscreen=(self)" },
      ],
    }];
  },
};

export default nextConfig;
