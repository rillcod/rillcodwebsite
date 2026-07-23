'use client';

export type CrmContactFormValues = {
  full_name: string;
  email: string;
  phone: string;
  role: string;
  school_name: string;
  class_name: string;
  source?: string;
  last_channel?: string;
};

type Props = {
  form: CrmContactFormValues;
  onChange: (form: CrmContactFormValues) => void;
  showSource?: boolean;
};

export function CrmContactFormFields({ form, onChange, showSource }: Props) {
  const set = (field: keyof CrmContactFormValues, value: string) =>
    onChange({ ...form, [field]: value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {([
        ['Full name *', 'full_name', 'text'],
        ['Email', 'email', 'email'],
        ['Phone / WhatsApp', 'phone', 'tel'],
        ['School', 'school_name', 'text'],
        ['Class / Year', 'class_name', 'text'],
      ] as [string, keyof CrmContactFormValues, string][]).map(([label, field, type]) => (
        <div key={field}>
          <label className="block text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">{label}</label>
          <input
            value={(form[field] as string) ?? ''}
            onChange={e => set(field, e.target.value)}
            type={type}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
          />
        </div>
      ))}
      <div>
        <label className="block text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Role</label>
        <select
          value={form.role ?? 'parent'}
          onChange={e => set('role', e.target.value)}
          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
        >
          <option value="parent">Parent/Guardian</option>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="school">School Partner</option>
          <option value="external">External</option>
        </select>
      </div>
      {showSource && (
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Source</label>
          <input
            value={form.source ?? 'manual'}
            onChange={e => set('source', e.target.value)}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
}
