"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface RememberKeyToggleProps {
  id: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}

/**
 * Opt-in "Remember on this device" switch that sits under an API key field.
 * Off by default, same as the Weave importer. The store writes the key to
 * localStorage only while this is on, and turning it off deletes it.
 */
export function RememberKeyToggle({ id, checked, onCheckedChange, disabled }: RememberKeyToggleProps) {
  return (
    <div className="flex items-start gap-2.5 pt-0.5">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          Remember on this device
        </Label>
        <p className="text-xs text-muted-foreground">
          {checked
            ? "Saved in this browser, so you won't need to paste it again. Turn this off to delete it."
            : "Off: the key is forgotten when you reload. Only turn this on for your own computer."}
        </p>
      </div>
    </div>
  );
}
