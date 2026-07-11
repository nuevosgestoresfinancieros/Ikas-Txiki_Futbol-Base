import React, { useId } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export const Field = ({ label, value, onChange, type = "text", testid, placeholder, error, id, required, ...rest }) => {
  const generatedId = useId();
  const fieldId = id || `${testid || "field"}-${generatedId}`;
  const errorId = `${fieldId}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId} className="text-sm font-semibold text-slate-700">
        {label}{required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
      </Label>
      <Input
        id={fieldId}
        type={type}
        data-testid={testid}
        value={value ?? ""}
        placeholder={placeholder}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        className="h-12 rounded-xl border-slate-300 bg-white focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
        {...rest}
      />
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
};

export const Area = ({ label, value, onChange, testid, rows = 3, error, id }) => {
  const generatedId = useId();
  const fieldId = id || `${testid || "area"}-${generatedId}`;
  const errorId = `${fieldId}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId} className="text-sm font-semibold text-slate-700">{label}</Label>
      <Textarea id={fieldId} data-testid={testid} value={value ?? ""} rows={rows} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={(e) => onChange(e.target.value)} className="rounded-xl border-slate-300 bg-white focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" />
      {error && <p id={errorId} role="alert" className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
};

export const SelectField = ({ label, value, onChange, options, testid, placeholder, id }) => {
  const generatedId = useId();
  const fieldId = id || `${testid || "select"}-${generatedId}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId} className="text-sm font-semibold text-slate-700">{label}</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger id={fieldId} className="h-12 rounded-xl border-slate-300 bg-white focus:ring-primary/20" data-testid={testid}>
          <SelectValue placeholder={placeholder || "—"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export const SwitchField = ({ label, checked, onChange, testid, id }) => {
  const generatedId = useId();
  const fieldId = id || `${testid || "switch"}-${generatedId}`;
  return (
    <div className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
      <Label htmlFor={fieldId} className="pr-4 text-sm font-medium text-slate-700">{label}</Label>
      <Switch id={fieldId} data-testid={testid} checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
};
