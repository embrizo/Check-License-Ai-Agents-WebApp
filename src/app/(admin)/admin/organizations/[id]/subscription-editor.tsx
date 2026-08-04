"use client";

import { useTransition } from "react";
import { runAction } from "@/lib/run-action";
import { extendSubscriptionAction, setSubscriptionStatusAction } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Subscription = {
  status: string;
  expiresAt: Date;
  plan: string;
  maxUsers: number;
  maxLicenses: number;
  aiCallsPerMonth: number;
} | null;

export function SubscriptionEditor({ orgId, subscription }: { orgId: string; subscription: Subscription }) {
  const [pending, startTransition] = useTransition();

  function extend(months: number) {
    startTransition(async () => {
      await runAction(
        () => extendSubscriptionAction(orgId, months),
        `Extended by ${months} month(s).`,
      );
    });
  }

  function setStatus(status: string) {
    startTransition(async () => {
      await runAction(
        () => setSubscriptionStatusAction(orgId, status as "active" | "suspended" | "expired" | "trial"),
        `Status set to ${status}.`,
      );
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Subscription</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {subscription ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={subscription.status === "active" ? "default" : "secondary"}>{subscription.status}</Badge>
              <span className="text-sm text-muted-foreground">
                Plan: {subscription.plan} · expires {subscription.expiresAt.toISOString().slice(0, 10)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => extend(1)}>+1 month</Button>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => extend(3)}>+3 months</Button>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => extend(6)}>+6 months</Button>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => extend(12)}>+1 year</Button>
              <Select value={subscription.status} onValueChange={(v) => v && setStatus(v)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">trial</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="suspended">suspended</SelectItem>
                  <SelectItem value="expired">expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No subscription row — this shouldn&apos;t happen for an org created via the admin console.</p>
        )}
      </CardContent>
    </Card>
  );
}
