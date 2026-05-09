"use client";

type ToggleSwitchProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  icon: string;
  iconColor?: string;
  label: string;
  description: string;
};

export default function ToggleSwitch({
  checked,
  onChange,
  icon,
  iconColor = "text-gray-400",
  label,
  description,
}: ToggleSwitchProps) {
  return (
    <div className="settings-row">
      <div className="flex items-center gap-4">
        <span className={`material-symbols-outlined text-2xl ${iconColor}`}>{icon}</span>
        <div>
          <p className="text-base font-medium">{label}</p>
          <p className="text-xs font-medium text-gray-400">{description}</p>
        </div>
      </div>

      <label className="toggle-switch">
        <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}