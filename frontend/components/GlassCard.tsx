import type { ReactNode } from "react";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
};

export default function GlassCard({ children, className = "", hover = true }: GlassCardProps) {
  return (
    <div className={`glass-card rounded-[28px] ${hover ? "" : "hover:shadow-none"} ${className}`.trim()}>
      {children}
    </div>
  );
}