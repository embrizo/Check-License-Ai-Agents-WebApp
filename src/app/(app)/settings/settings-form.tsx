"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveSettings, type SettingsState } from "./actions";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Props {
  alertThresholds: string;
  alertRecipients: string;
  productFilterRegex: string;
  timezone: string;
  alertSendHour: number;
  notifyCustomerContacts: boolean;
  aiEnabled: boolean;
}

export function SettingsForm(props: Props) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, undefined);

  useEffect(() => {
    if (state?.success) toast.success("Settings saved.");
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <form action={action}>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="alertThresholds">Alert thresholds (days)</Label>
            <Input id="alertThresholds" name="alertThresholds" defaultValue={props.alertThresholds} placeholder="30, 15" />
            <p className="text-xs text-muted-foreground">Comma-separated. An email goes out once per license per threshold crossed.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="alertRecipients">Alert recipients</Label>
            <textarea
              id="alertRecipients"
              name="alertRecipients"
              defaultValue={props.alertRecipients}
              rows={4}
              placeholder={"ops@yourcompany.com\nsales@yourcompany.com"}
              className="rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <p className="text-xs text-muted-foreground">One email per line (or comma-separated).</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="productFilterRegex">Product filter (regex, optional)</Label>
            <Input id="productFilterRegex" name="productFilterRegex" defaultValue={props.productFilterRegex} placeholder="^[nN][xX]\d+$" />
            <p className="text-xs text-muted-foreground">Leave blank to alert on every product.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input id="timezone" name="timezone" defaultValue={props.timezone} placeholder="Asia/Bangkok" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="alertSendHour">Alert send time</Label>
            <select
              id="alertSendHour"
              name="alertSendHour"
              defaultValue={String(props.alertSendHour)}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Hour the daily alert email is sent, in the timezone above.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Not honored yet — the current hosting plan checks all organizations
              once daily at a fixed time, regardless of this setting. Your
              licenses are still checked and alerted every day; only this exact
              hour isn&apos;t yet in effect. Set it now if you like — it applies
              automatically once per-org scheduling is enabled.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notifyCustomerContacts" defaultChecked={props.notifyCustomerContacts} />
            Also notify customer contacts marked &ldquo;notify&rdquo;
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="aiEnabled" defaultChecked={props.aiEnabled} />
            Enable AI-assisted parsing features
          </label>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </CardFooter>
      </form>
    </Card>
  );
}
