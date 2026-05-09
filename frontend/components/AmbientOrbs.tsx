import type { ReactNode } from "react";

type AmbientOrbsProps = {
  children?: ReactNode;
  className?: string;
};

export default function AmbientOrbs({ children, className = "" }: AmbientOrbsProps) {
  return (
    <>
      <div aria-hidden className={`ambient-orbs ${className}`.trim()}>
        <div className="ambient-orb orb-1" />
        <div className="ambient-orb orb-2" />
        <div className="ambient-orb orb-3" />
      </div>
      {children}
    </>
  );
}