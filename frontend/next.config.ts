import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: [
    "192.168.1.108", 
    "localhost",
    "127.0.0.1",
    "26.161.225.127",
    "kws.wattanapong.com",
  ],
};

export default nextConfig; 
